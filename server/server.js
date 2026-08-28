/* Клевер — сервер.

   Отдаёт статику сайта и обслуживает /api. Зависимостей нет: всё, что нужно,
   уже есть в Node (включая SQLite, начиная с 22.5).

   Запуск:   node server/server.js
   Настройки — переменные окружения, все со здравыми значениями по умолчанию:

     PORT=8080            порт
     HOST=0.0.0.0         адрес прослушивания
     DB_PATH=server/klever.db
     UPLOADS_DIR=uploads
     ADMIN_PASSWORD=...   пароль, но только при первом запуске на пустой базе
     SECURE_COOKIES=1     принудительно ставить куке флаг Secure (за HTTPS)
*/

'use strict';

/* node:sqlite пока помечен «экспериментальным» и печатает предупреждение
   при каждом запуске. Работает он стабильно, а строка в логе пугает — гасим
   ровно её, остальные предупреждения Node остаются на месте. */
var emitWarning = process.emitWarning;
process.emitWarning = function (warning) {
  if (String(warning).indexOf('SQLite is an experimental') > -1) return;
  return emitWarning.apply(process, arguments);
};

var http = require('node:http');
var fs = require('node:fs');
var path = require('node:path');
var zlib = require('node:zlib');
var crypto = require('node:crypto');

var db = require('./db');
var auth = require('./auth');
var api = require('./api');
var seo = require('./seo');

var ROOT = path.resolve(__dirname, '..');
var PORT = Number(process.env.PORT || 8080);
var HOST = process.env.HOST || '0.0.0.0';
var DB_PATH = path.resolve(ROOT, process.env.DB_PATH || 'server/klever.db');
var UPLOADS_DIR = path.resolve(ROOT, process.env.UPLOADS_DIR || 'uploads');
var BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
var BACKUPS_KEPT = 14;

/* ---------- Статика ---------- */

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4'
};

/* Наружу не отдаём ни базу, ни исходники сервера, ни исходники фотографий.
   Всё, что начинается с точки (.git, .gitignore, .claude, .env), — тоже мимо. */
var HIDDEN = [
  /^server\b/,
  /(^|\/)\./,
  /^img\/original\b/,
  /\.db(-wal|-shm)?$/,
  /^backups\b/,
  /^package(-lock)?\.json$/
];

function isHidden(rel) {
  var norm = rel.replace(/\\/g, '/');
  return HIDDEN.some(function (re) { return re.test(norm); });
}

function cacheFor(rel) {
  if (/\.html?$/.test(rel)) return 'no-cache, must-revalidate';

  /* Фотографии в uploads имеют уникальные имена и никогда не меняются */
  if (/^uploads\//.test(rel)) return 'public, max-age=31536000, immutable';
  if (/^img\//.test(rel)) return 'public, max-age=86400';

  /* Скрипты и стили — no-cache, а не «на десять минут»: имена у них
     постоянные, и после обновления сайта браузер ещё держал бы старый код
     вместе с новой разметкой. no-cache не запрещает кеш, а требует спросить
     сервер — при неизменном файле тот отвечает 304 в несколько сотен байт. */
  if (/^assets\//.test(rel)) return 'no-cache, must-revalidate';

  return 'public, max-age=300';
}

var COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml))/;

function serveStatic(req, res, url) {
  var rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!rel || rel.slice(-1) === '/') rel += 'index.html';

  var full = path.resolve(ROOT, rel);
  if (full !== ROOT && full.indexOf(ROOT + path.sep) !== 0) return notFound(res);

  var relFromRoot = path.relative(ROOT, full);
  if (isHidden(relFromRoot)) return notFound(res);

  var stat;
  try { stat = fs.statSync(full); }
  catch (e) { return notFound(res); }

  if (stat.isDirectory()) {
    full = path.join(full, 'index.html');
    try { stat = fs.statSync(full); }
    catch (e) { return notFound(res); }
    relFromRoot = path.relative(ROOT, full);
  }

  var type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
  var isHTML = /^text\/html/.test(type);

  /* Страницы проходят через SEO-слой: он подставляет заголовок, описание,
     микроразметку и текст, который иначе появился бы только после скриптов. */
  var body = null;
  if (isHTML) {
    try {
      body = Buffer.from(seo.apply(fs.readFileSync(full, 'utf8'), url.pathname, url.searchParams, siteBase(req)), 'utf8');
    } catch (e) {
      console.error('SEO-слой не смог обработать ' + relFromRoot + ':', e.message);
      body = fs.readFileSync(full); /* отдаём как есть, лишь бы страница открылась */
    }
  }

  /* Метка версии считается от готового ответа: наполнение меняется в базе,
     а файл при этом остаётся прежним. */
  var etag = isHTML
    ? '"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 20) + '"'
    : '"' + stat.size.toString(16) + '-' + stat.mtimeMs.toString(16) + '"';

  var headers = {
    'Content-Type': type,
    'Cache-Control': cacheFor(relFromRoot.replace(/\\/g, '/')),
    'ETag': etag,
    'Last-Modified': stat.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff'
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }

  var accepts = String(req.headers['accept-encoding'] || '');
  var size = body ? body.length : stat.size;
  var gzip = COMPRESSIBLE.test(type) && accepts.indexOf('gzip') > -1 && size > 1024;

  if (req.method === 'HEAD') {
    if (!gzip) headers['Content-Length'] = size;
    res.writeHead(200, headers);
    return res.end();
  }

  if (gzip) {
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
    res.writeHead(200, headers);
    if (body) zlib.gzip(body, function (err, out) { res.end(err ? body : out); });
    else fs.createReadStream(full).pipe(zlib.createGzip()).pipe(res);
  } else {
    headers['Content-Length'] = size;
    res.writeHead(200, headers);
    if (body) res.end(body);
    else fs.createReadStream(full).pipe(res);
  }
}

/* Адрес сайта таким, каким его видит посетитель: он идёт в canonical,
   в ссылки Open Graph и в карту сайта. */
function siteBase(req) {
  if (process.env.SITE_URL) return String(process.env.SITE_URL).replace(/\/+$/, '');
  var proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  var host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  return proto + '://' + host;
}

function notFound(res) {
  var page = path.join(ROOT, '404.html');
  if (fs.existsSync(page)) {
    var body = fs.readFileSync(page);
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length });
    return res.end(body);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Страница не найдена');
}

/* ---------- Сервер ---------- */

function createServer(ctx) {
  return http.createServer(function (req, res) {
    var url;
    try { url = new URL(req.url, 'http://' + (req.headers.host || 'localhost')); }
    catch (e) { return notFound(res); }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    if (api.handle(req, res, url, ctx)) return;

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', 'Allow': 'GET, HEAD' });
      return res.end('Так сюда обращаться нельзя');
    }

    /* Оба файла собираются из базы: товары появляются и исчезают,
       а карта сайта должна это отражать без ручных правок. */
    if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') {
      var isMap = url.pathname === '/sitemap.xml';
      var text = isMap ? seo.sitemap(siteBase(req)) : seo.robots(siteBase(req));
      var buf = Buffer.from(text, 'utf8');
      res.writeHead(200, {
        'Content-Type': isMap ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8',
        'Content-Length': buf.length,
        'Cache-Control': 'public, max-age=3600'
      });
      return res.end(req.method === 'HEAD' ? undefined : buf);
    }

    serveStatic(req, res, url);
  });
}

/* ---------- Резервные копии ---------- */

function backup() {
  try {
    if (!fs.existsSync(DB_PATH)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    var stamp = new Date().toISOString().slice(0, 10);
    var dest = path.join(BACKUP_DIR, 'klever-' + stamp + '.db');
    fs.copyFileSync(DB_PATH, dest);

    var old = fs.readdirSync(BACKUP_DIR)
      .filter(function (f) { return /^klever-\d{4}-\d{2}-\d{2}\.db$/.test(f); })
      .sort();
    while (old.length > BACKUPS_KEPT) {
      fs.unlinkSync(path.join(BACKUP_DIR, old.shift()));
    }
  } catch (e) {
    console.warn('Не удалось сделать резервную копию: ' + e.message);
  }
}

/* ---------- Запуск ---------- */

function start() {
  db.open(DB_PATH);
  api.configure({ uploadsDir: UPLOADS_DIR });

  var freshPassword = null;
  if (!auth.hasPassword()) {
    freshPassword = process.env.ADMIN_PASSWORD || 'klever';
    auth.setPassword(freshPassword);
  }

  backup();
  setInterval(backup, 24 * 60 * 60 * 1000).unref();
  setInterval(db.pruneSessions, 60 * 60 * 1000).unref();

  var ctx = { dbPath: DB_PATH, uploadsDir: UPLOADS_DIR, root: ROOT };
  var server = createServer(ctx);

  server.listen(PORT, HOST, function () {
    var shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
    console.log('');
    console.log('  Клевер работает: http://' + shown + ':' + PORT + '/');
    console.log('  Админ-панель:    http://' + shown + ':' + PORT + '/admin.html');
    console.log('  База:            ' + DB_PATH);
    console.log('  Фотографии:      ' + UPLOADS_DIR);
    if (freshPassword) {
      console.log('');
      console.log('  Пароль админки установлен: ' + freshPassword);
      console.log('  Смените его в разделе «Настройки» — это делается один раз.');
    } else if (auth.isDefaultPassword()) {
      console.log('');
      console.log('  Внимание: пароль админки всё ещё демонстрационный (klever).');
    }
    console.log('');
  });

  function shutdown(signal) {
    return function () {
      console.log('\n' + signal + ' — останавливаюсь.');
      server.close(function () {
        db.close();
        process.exit(0);
      });
      setTimeout(function () { process.exit(0); }, 3000).unref();
    };
  }
  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
}

start();
