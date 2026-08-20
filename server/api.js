/* Клевер — HTTP-интерфейс к базе.

   Публичного здесь ровно два адреса: снимок наполнения для витрины
   и приём заявки. Всё остальное живёт под /api/admin/ и требует сессии. */

'use strict';

var fs = require('node:fs');
var path = require('node:path');
var crypto = require('node:crypto');

var db = require('./db');
var auth = require('./auth');

var JSON_LIMIT = 4 * 1024 * 1024;   /* хватит на очень длинное описание */
var IMAGE_LIMIT = 6 * 1024 * 1024;  /* сжатый в браузере кадр обычно 100–400 КБ */

var UPLOADS_DIR = null;
var UPLOADS_URL = 'uploads/';

function configure(opts) {
  UPLOADS_DIR = opts.uploadsDir;
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/* ---------- Ответы ---------- */

function send(res, status, body, headers) {
  var payload = Buffer.from(JSON.stringify(body), 'utf8');
  var h = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store'
  }, headers || {});
  res.writeHead(status, h);
  res.end(payload);
}

function ok(res, body, headers) { send(res, 200, Object.assign({ ok: true }, body || {}), headers); }
function fail(res, status, message, headers) { send(res, status, { ok: false, message: message }, headers); }

/* ---------- Чтение тела запроса ---------- */

function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on('data', function (c) {
      size += c.length;
      if (size > limit) {
        reject(new Error('Слишком большой запрос'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function readJSON(req) {
  return readBody(req, JSON_LIMIT).then(function (buf) {
    if (!buf.length) return {};
    try { return JSON.parse(buf.toString('utf8')); }
    catch (e) { throw new Error('Не разобрать JSON'); }
  });
}

/* ---------- Защита ---------- */

function clientIP(req) {
  var fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

/* Запросы, меняющие данные, обязаны прислать этот заголовок. Обычная форма
   с чужого сайта его поставить не может — это и отсекает CSRF. */
function sameOrigin(req) {
  return req.headers['x-klever'] === '1';
}

var requestLog = new Map();
var REQ_LIMIT = 20;
var REQ_WINDOW = 60 * 60 * 1000;

function requestFlood(ip) {
  var now = Date.now();
  var rec = requestLog.get(ip);
  if (!rec || now - rec.first > REQ_WINDOW) {
    requestLog.set(ip, { first: now, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > REQ_LIMIT;
}

/* Чистим счётчики раз в час, чтобы карта не росла бесконечно */
setInterval(function () {
  var now = Date.now();
  requestLog.forEach(function (rec, ip) {
    if (now - rec.first > REQ_WINDOW) requestLog.delete(ip);
  });
}, REQ_WINDOW).unref();

function trim(v, max) {
  return String(v == null ? '' : v).slice(0, max).trim();
}

/* ---------- Публичное ---------- */

/* Снимок наполнения отдаём готовым скриптом: страница подключает его до
   store.js и дальше работает синхронно, как раньше работала с localStorage. */
function contentScript(res) {
  var data = db.publicContent();
  var body = Buffer.from('window.KLEVER_DATA = ' + JSON.stringify(data) + ';\n', 'utf8');
  res.writeHead(200, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache, must-revalidate'
  });
  res.end(body);
}

function postRequest(req, res) {
  var ip = clientIP(req);
  if (requestFlood(ip)) {
    return fail(res, 429, 'Слишком много заявок подряд. Попробуйте через час или напишите нам в мессенджер.');
  }
  return readJSON(req).then(function (body) {
    var name = trim(body.name, 120);
    var contact = trim(body.contact, 200);
    if (!name || !contact) return fail(res, 400, 'Без имени и контакта заявку не принять');

    var items = Array.isArray(body.items) ? body.items.slice(0, 50).map(function (i) {
      return {
        title: trim(i.title, 200),
        size: trim(i.size, 40),
        qty: Math.max(1, Math.min(99, parseInt(i.qty, 10) || 1)),
        price: Math.max(0, parseInt(i.price, 10) || 0)
      };
    }) : [];

    var saved = db.addRequest({
      name: name,
      contact: contact,
      productId: trim(body.productId, 60),
      productTitle: trim(body.productTitle, 4000),
      size: trim(body.size, 40),
      delivery: trim(body.delivery, 120),
      comment: trim(body.comment, 4000),
      items: items,
      total: Math.max(0, parseInt(body.total, 10) || 0),
      source: trim(body.source, 40) || 'site'
    });

    console.log('Новая заявка: ' + saved.name + ' · ' + saved.contact +
      (saved.total ? ' · ' + saved.total + ' ₽' : ''));
    return ok(res, { id: saved.id });
  });
}

/* ---------- Вход ---------- */

function postLogin(req, res) {
  var ip = clientIP(req);
  if (auth.tooManyAttempts(ip)) {
    return fail(res, 429, 'Слишком много попыток. Подождите ' + auth.minutesLeft(ip) + ' мин.');
  }
  return readJSON(req).then(function (body) {
    var result = auth.login(req, String(body.password || ''));
    if (!result) {
      auth.noteFailure(ip);
      return fail(res, 401, 'Пароль не подходит');
    }
    auth.clearAttempts(ip);
    return ok(res, { admin: true }, { 'Set-Cookie': result.cookie });
  });
}

function postLogout(req, res) {
  var result = auth.logout(req);
  return ok(res, { admin: false }, { 'Set-Cookie': result.cookie });
}

function getSession(req, res) {
  var admin = auth.isAdmin(req);
  send(res, 200, {
    ok: true,
    admin: admin,
    defaultPassword: admin ? auth.isDefaultPassword() : false
  });
}

/* ---------- Админ ---------- */

function adminBootstrap(req, res) {
  send(res, 200, {
    ok: true,
    admin: true,
    defaultPassword: auth.isDefaultPassword(),
    data: db.adminContent()
  });
}

var WRITABLE = ['products', 'categories', 'banners'];

function adminSave(req, res) {
  return readJSON(req).then(function (body) {
    var collection = String(body.collection || '');
    if (WRITABLE.indexOf(collection) < 0) return fail(res, 400, 'Нельзя писать в раздел ' + collection);
    if (!body.item || typeof body.item !== 'object') return fail(res, 400, 'Нечего сохранять');
    var saved = db.upsert(collection, body.item);
    return ok(res, { item: saved });
  });
}

function adminRemove(req, res) {
  return readJSON(req).then(function (body) {
    var collection = String(body.collection || '');
    if (WRITABLE.concat(['requests']).indexOf(collection) < 0) {
      return fail(res, 400, 'Нельзя удалять из раздела ' + collection);
    }
    db.remove(collection, String(body.id || ''));
    return ok(res, {});
  });
}

function adminMove(req, res) {
  return readJSON(req).then(function (body) {
    var collection = String(body.collection || '');
    if (WRITABLE.indexOf(collection) < 0) return fail(res, 400, 'Нельзя менять порядок в разделе ' + collection);
    db.move(collection, String(body.id || ''), Number(body.dir) < 0 ? -1 : 1);
    return ok(res, { items: db.list(collection) });
  });
}

function adminPage(req, res) {
  return readJSON(req).then(function (body) {
    var key = String(body.key || '');
    if (!/^[a-z0-9_-]{1,40}$/.test(key)) return fail(res, 400, 'Неверный адрес страницы');
    var saved = db.savePage(key, body.page || {});
    return ok(res, { page: saved });
  });
}

function adminSettings(req, res) {
  return readJSON(req).then(function (body) {
    var patch = body.settings || {};
    if (typeof patch !== 'object') return fail(res, 400, 'Нечего сохранять');
    var next = db.saveSettings(patch);
    return ok(res, { settings: next });
  });
}

function adminPassword(req, res) {
  return readJSON(req).then(function (body) {
    var current = String(body.current || '');
    var next = String(body.password || '');
    if (next.length < 6) return fail(res, 400, 'Пароль короче шести знаков — так нельзя');
    if (!auth.verify(current, db.settings(true).adminPasswordHash)) {
      return fail(res, 403, 'Текущий пароль введён неверно');
    }
    auth.setPassword(next);
    db.dropAllSessions();
    var s = db.createSession(14);
    return ok(res, { message: 'Пароль изменён' },
      { 'Set-Cookie': auth.sessionCookie(req, s.id, 14 * 86400) });
  });
}

function adminRequestStatus(req, res) {
  return readJSON(req).then(function (body) {
    db.setRequestStatus(String(body.id || ''), String(body.status || 'new'));
    return ok(res, { requests: db.list('requests') });
  });
}

function adminRequests(req, res) {
  return ok(res, { requests: db.list('requests') });
}

/* ---------- Фотографии ---------- */

/* Браузер уже уменьшил и пережал кадр в JPEG — сервер только проверяет,
   что это действительно картинка, и кладёт файл на диск. */
function adminUpload(req, res, url) {
  var variant = url.searchParams.get('variant') === 'sm' ? 'sm' : 'full';
  var base = url.searchParams.get('base') || '';

  if (variant === 'sm' && !/^[a-f0-9]{8,32}$/.test(base)) {
    return fail(res, 400, 'Неверное имя файла');
  }

  return readBody(req, IMAGE_LIMIT).then(function (buf) {
    if (buf.length < 4) return fail(res, 400, 'Пустой файл');

    var isJPEG = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
    var isPNG = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    if (!isJPEG && !isPNG) return fail(res, 400, 'Это не картинка');

    var ext = isJPEG ? '.jpg' : '.png';
    var id = variant === 'sm' ? base : crypto.randomBytes(8).toString('hex');
    var name = id + (variant === 'sm' ? '-sm' : '') + ext;
    var dest = path.join(UPLOADS_DIR, name);

    fs.writeFileSync(dest, buf);
    return ok(res, { id: id, url: UPLOADS_URL + name, bytes: buf.length });
  }).catch(function (e) {
    return fail(res, 413, e.message || 'Не удалось принять файл');
  });
}

/* ---------- Данные ---------- */

function adminExport(req, res) {
  var body = Buffer.from(JSON.stringify(db.exportAll(), null, 2), 'utf8');
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Content-Disposition': 'attachment; filename="klever-' +
      new Date().toISOString().slice(0, 10) + '.json"',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function adminImport(req, res) {
  return readJSON(req).then(function (body) {
    try {
      db.importAll(body.data || body);
      return ok(res, { data: db.adminContent() });
    } catch (e) {
      return fail(res, 400, e.message);
    }
  });
}

function adminReset(req, res) {
  db.resetToSeed();
  return ok(res, { data: db.adminContent() });
}

/* Служебные файлы вроде .gitkeep не считаем фотографиями и не трогаем */
function uploadFiles() {
  try {
    return fs.readdirSync(UPLOADS_DIR).filter(function (f) { return f.charAt(0) !== '.'; });
  } catch (e) {
    return []; /* папки может не быть — это нормально */
  }
}

function dirStats(dir) {
  var bytes = 0, count = 0;
  uploadFiles().forEach(function (f) {
    try {
      var st = fs.statSync(path.join(dir, f));
      if (st.isFile()) { bytes += st.size; count += 1; }
    } catch (e) {}
  });
  return { bytes: bytes, count: count };
}

function unusedUploads() {
  var used = db.usedImages();
  return uploadFiles().filter(function (f) { return !used.has(UPLOADS_URL + f); });
}

function adminStats(req, res, url, ctx) {
  var uploads = dirStats(UPLOADS_DIR);

  /* В режиме WAL свежие записи какое-то время лежат в отдельном файле —
     без него размер базы выглядел бы неправдоподобно маленьким. */
  var dbBytes = 0;
  [ctx.dbPath, ctx.dbPath + '-wal'].forEach(function (f) {
    try { dbBytes += fs.statSync(f).size; } catch (e) {}
  });

  var content = db.publicContent();
  var junk = unusedUploads();

  return ok(res, {
    stats: {
      dbBytes: dbBytes,
      uploadBytes: uploads.bytes,
      uploadCount: uploads.count,
      unusedCount: junk.length,
      products: content.products.length,
      categories: content.categories.length,
      banners: content.banners.length,
      requests: db.list('requests').length,
      newRequests: db.newRequestCount()
    }
  });
}

function adminCleanup(req, res) {
  var junk = unusedUploads();
  var removed = 0;
  junk.forEach(function (f) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, f)); removed += 1; }
    catch (e) { console.warn('Не удалось удалить ' + f + ': ' + e.message); }
  });
  return ok(res, { removed: removed });
}

/* ---------- Маршрутизация ---------- */

var PUBLIC_ROUTES = {
  'GET /api/content.js': function (req, res) { contentScript(res); },
  'GET /api/session': getSession,
  'POST /api/login': postLogin,
  'POST /api/logout': postLogout,
  'POST /api/requests': postRequest
};

var ADMIN_ROUTES = {
  'GET /api/admin/bootstrap': adminBootstrap,
  'GET /api/admin/requests': adminRequests,
  'GET /api/admin/stats': adminStats,
  'GET /api/admin/export': adminExport,
  'POST /api/admin/save': adminSave,
  'POST /api/admin/remove': adminRemove,
  'POST /api/admin/move': adminMove,
  'POST /api/admin/page': adminPage,
  'POST /api/admin/settings': adminSettings,
  'POST /api/admin/password': adminPassword,
  'POST /api/admin/request-status': adminRequestStatus,
  'POST /api/admin/upload': adminUpload,
  'POST /api/admin/import': adminImport,
  'POST /api/admin/reset': adminReset,
  'POST /api/admin/cleanup': adminCleanup
};

/* Возвращает true, если запрос обработан здесь */
function handle(req, res, url, ctx) {
  if (url.pathname.indexOf('/api/') !== 0) return false;

  var key = req.method + ' ' + url.pathname;
  var isAdminRoute = url.pathname.indexOf('/api/admin/') === 0;
  var route = isAdminRoute ? ADMIN_ROUTES[key] : PUBLIC_ROUTES[key];

  if (!route) {
    fail(res, 404, 'Такого адреса нет');
    return true;
  }

  /* Любая запись должна прийти с нашей же страницы */
  if (req.method !== 'GET' && !sameOrigin(req)) {
    fail(res, 403, 'Запрос пришёл не с сайта');
    return true;
  }

  if (isAdminRoute && !auth.isAdmin(req)) {
    fail(res, 401, 'Нужно войти в панель заново');
    return true;
  }

  Promise.resolve()
    .then(function () { return route(req, res, url, ctx); })
    .catch(function (e) {
      console.error('Ошибка на ' + key + ':', e);
      if (!res.headersSent) fail(res, 500, e.message || 'Внутренняя ошибка');
    });

  return true;
}

module.exports = { handle: handle, configure: configure };
