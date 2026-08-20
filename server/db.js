/* Клевер — слой базы данных (SQLite).

   Один файл klever.db, никаких зависимостей: node:sqlite встроен в Node 22.5+.
   Наружу отдаём те же объекты, что раньше лежали в localStorage, — витрина
   и админка их не отличают. Разница только в том, что теперь они общие
   для всех посетителей и переживают чистку браузера. */

'use strict';

var fs = require('node:fs');
var path = require('node:path');
var crypto = require('node:crypto');

var DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
  console.error('\nНе удалось подключить встроенный SQLite.');
  console.error('Нужен Node.js 22.5 или новее, у вас ' + process.version + '.');
  console.error('Обновите Node — https://nodejs.org — и запустите снова.\n');
  process.exit(1);
}

var db = null;
var SEED = null;

/* ---------- Схема ---------- */

var SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)',
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)',

  'CREATE TABLE IF NOT EXISTS categories (' +
    'id TEXT PRIMARY KEY, slug TEXT, title TEXT, description TEXT, tint TEXT, ord INTEGER)',

  'CREATE TABLE IF NOT EXISTS products (' +
    'id TEXT PRIMARY KEY, slug TEXT, title TEXT, category TEXT, gender TEXT, ' +
    'price INTEGER, oldPrice INTEGER, fabric TEXT, color TEXT, sizes TEXT, ' +
    'inStock INTEGER, featured INTEGER, ord INTEGER, description TEXT, care TEXT, ' +
    'images TEXT, thumb TEXT, createdAt TEXT)',

  'CREATE TABLE IF NOT EXISTS banners (' +
    'id TEXT PRIMARY KEY, ord INTEGER, active INTEGER, eyebrow TEXT, title TEXT, text TEXT, ' +
    'ctaText TEXT, ctaLink TEXT, ctaText2 TEXT, ctaLink2 TEXT, image TEXT)',

  'CREATE TABLE IF NOT EXISTS pages (' +
    'key TEXT PRIMARY KEY, title TEXT, subtitle TEXT, body TEXT, image TEXT, ord INTEGER)',

  'CREATE TABLE IF NOT EXISTS requests (' +
    'id TEXT PRIMARY KEY, createdAt TEXT, status TEXT, name TEXT, contact TEXT, ' +
    'productId TEXT, productTitle TEXT, size TEXT, delivery TEXT, comment TEXT, ' +
    'items TEXT, total INTEGER, source TEXT)',

  'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created INTEGER, expires INTEGER)',

  'CREATE INDEX IF NOT EXISTS idx_products_ord ON products(ord)',
  'CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug)',
  'CREATE INDEX IF NOT EXISTS idx_categories_ord ON categories(ord)',
  'CREATE INDEX IF NOT EXISTS idx_banners_ord ON banners(ord)',
  'CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(createdAt DESC)'
];

/* Какие поля есть у каждой коллекции и как они превращаются в столбцы.
   `order` — зарезервированное слово в SQL, поэтому в базе столбец зовётся `ord`. */

var SHAPES = {
  categories: {
    table: 'categories', key: 'id',
    fields: [
      ['id', 'text'], ['slug', 'text'], ['title', 'text'],
      ['description', 'text'], ['tint', 'text'], ['order', 'int', 'ord']
    ]
  },
  products: {
    table: 'products', key: 'id',
    fields: [
      ['id', 'text'], ['slug', 'text'], ['title', 'text'], ['category', 'text'],
      ['gender', 'text'], ['price', 'int'], ['oldPrice', 'int'], ['fabric', 'text'],
      ['color', 'text'], ['sizes', 'json'], ['inStock', 'bool'], ['featured', 'bool'],
      ['order', 'int', 'ord'], ['description', 'text'], ['care', 'text'],
      ['images', 'json'], ['thumb', 'text'], ['createdAt', 'text']
    ]
  },
  banners: {
    table: 'banners', key: 'id',
    fields: [
      ['id', 'text'], ['order', 'int', 'ord'], ['active', 'bool'], ['eyebrow', 'text'],
      ['title', 'text'], ['text', 'text'], ['ctaText', 'text'], ['ctaLink', 'text'],
      ['ctaText2', 'text'], ['ctaLink2', 'text'], ['image', 'text']
    ]
  },
  requests: {
    table: 'requests', key: 'id',
    fields: [
      ['id', 'text'], ['createdAt', 'text'], ['status', 'text'], ['name', 'text'],
      ['contact', 'text'], ['productId', 'text'], ['productTitle', 'text'],
      ['size', 'text'], ['delivery', 'text'], ['comment', 'text'],
      ['items', 'json'], ['total', 'int'], ['source', 'text']
    ]
  }
};

/* ---------- Преобразование строк ---------- */

function toColumn(kind, value) {
  if (kind === 'json') return JSON.stringify(value == null ? [] : value);
  if (kind === 'bool') return value ? 1 : 0;
  if (kind === 'int') {
    var n = parseInt(value, 10);
    return isNaN(n) ? 0 : n;
  }
  return value == null ? '' : String(value);
}

function fromColumn(kind, value) {
  if (kind === 'json') {
    try { return JSON.parse(value || '[]'); } catch (e) { return []; }
  }
  if (kind === 'bool') return value === 1 || value === '1' || value === true;
  if (kind === 'int') return value == null ? 0 : Number(value);
  return value == null ? '' : String(value);
}

function rowToItem(shape, row) {
  if (!row) return null;
  var item = {};
  shape.fields.forEach(function (f) {
    item[f[0]] = fromColumn(f[1], row[f[2] || f[0]]);
  });
  return item;
}

function itemToRow(shape, item) {
  var row = {};
  shape.fields.forEach(function (f) {
    row[f[2] || f[0]] = toColumn(f[1], item[f[0]]);
  });
  return row;
}

/* ---------- Открытие и первичное наполнение ---------- */

function open(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  SCHEMA.forEach(function (sql) { db.exec(sql); });

  SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));

  var count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  var seeded = meta('seeded');
  if (!count && !seeded) {
    fillFromSeed();
    setMeta('seeded', '1');
    console.log('База пустая — залил демо-наполнение из server/seed.json.');
  }
  setMeta('version', String(SEED.version || 1));
  pruneSessions();
  return db;
}

function fillFromSeed() {
  importAll(JSON.parse(JSON.stringify(SEED)), { keepPassword: true });
}

function seed() { return SEED; }

/* ---------- meta ---------- */

function meta(key) {
  var row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setMeta(key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

/* ---------- Настройки ---------- */

/* Пароль хранится отдельным ключом и наружу не отдаётся никогда */
var SECRET_SETTINGS = ['adminPasswordHash', 'adminPassword'];

function settings(includeSecret) {
  var out = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(function (r) {
    if (!includeSecret && SECRET_SETTINGS.indexOf(r.key) > -1) return;
    out[r.key] = r.value;
  });
  return out;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value == null ? '' : String(value));
}

function saveSettings(patch) {
  var tx = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.exec('BEGIN');
  try {
    Object.keys(patch).forEach(function (k) {
      if (SECRET_SETTINGS.indexOf(k) > -1) return; /* пароль меняется своим методом */
      tx.run(k, patch[k] == null ? '' : String(patch[k]));
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return settings();
}

/* ---------- Страницы ---------- */

function pages() {
  var out = {};
  db.prepare('SELECT * FROM pages ORDER BY ord').all().forEach(function (r) {
    out[r.key] = { title: r.title || '', subtitle: r.subtitle || '', body: r.body || '', image: r.image || '' };
  });
  return out;
}

function savePage(key, page) {
  page = page || {};
  var existing = db.prepare('SELECT ord FROM pages WHERE key = ?').get(key);
  db.prepare('INSERT INTO pages (key, title, subtitle, body, image, ord) VALUES (?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET title = excluded.title, subtitle = excluded.subtitle, ' +
    'body = excluded.body, image = excluded.image')
    .run(key, String(page.title || ''), String(page.subtitle || ''),
      String(page.body || ''), String(page.image || ''),
      existing ? existing.ord : nextOrd('pages'));
  return pages()[key];
}

/* ---------- Коллекции ---------- */

function shapeOf(collection) {
  var s = SHAPES[collection];
  if (!s) throw new Error('Неизвестный раздел: ' + collection);
  return s;
}

function list(collection) {
  var shape = shapeOf(collection);
  var order = collection === 'requests' ? 'createdAt DESC' : 'ord ASC';
  return db.prepare('SELECT * FROM ' + shape.table + ' ORDER BY ' + order).all()
    .map(function (r) { return rowToItem(shape, r); });
}

function get(collection, id) {
  var shape = shapeOf(collection);
  return rowToItem(shape, db.prepare('SELECT * FROM ' + shape.table + ' WHERE id = ?').get(id));
}

function nextOrd(table) {
  var row = db.prepare('SELECT MAX(ord) AS m FROM ' + table).get();
  return (row && row.m ? Number(row.m) : 0) + 1;
}

function upsert(collection, item) {
  var shape = shapeOf(collection);
  if (!item.id) item.id = uid(collection.charAt(0));
  if (collection !== 'requests' && !item.order) item.order = nextOrd(shape.table);

  var row = itemToRow(shape, item);
  var cols = Object.keys(row);
  var marks = cols.map(function () { return '?'; }).join(', ');
  var sets = cols.filter(function (c) { return c !== 'id'; })
    .map(function (c) { return c + ' = excluded.' + c; }).join(', ');

  var stmt = db.prepare('INSERT INTO ' + shape.table + ' (' + cols.join(', ') + ') VALUES (' + marks + ') ' +
    'ON CONFLICT(id) DO UPDATE SET ' + sets);
  stmt.run.apply(stmt, cols.map(function (c) { return row[c]; }));

  return get(collection, item.id);
}

function remove(collection, id) {
  var shape = shapeOf(collection);
  var info = db.prepare('DELETE FROM ' + shape.table + ' WHERE id = ?').run(id);
  return info.changes > 0;
}

/* Поменять две соседние позиции местами и перенумеровать всё подряд,
   чтобы порядок не разъезжался после удалений. */
function move(collection, id, dir) {
  var shape = shapeOf(collection);
  var rows = db.prepare('SELECT id, ord FROM ' + shape.table + ' ORDER BY ord ASC').all();
  var i = rows.findIndex(function (r) { return r.id === id; });
  var j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= rows.length) return false;

  var tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp;
  var upd = db.prepare('UPDATE ' + shape.table + ' SET ord = ? WHERE id = ?');
  db.exec('BEGIN');
  try {
    rows.forEach(function (r, n) { upd.run(n + 1, r.id); });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return true;
}

/* ---------- Заявки ---------- */

function addRequest(req) {
  var item = {
    id: uid('r'),
    createdAt: new Date().toISOString(),
    status: 'new',
    name: req.name || '',
    contact: req.contact || '',
    productId: req.productId || '',
    productTitle: req.productTitle || '',
    size: req.size || '',
    delivery: req.delivery || '',
    comment: req.comment || '',
    items: Array.isArray(req.items) ? req.items : [],
    total: req.total || 0,
    source: req.source || 'site'
  };
  return upsert('requests', item);
}

function setRequestStatus(id, status) {
  db.prepare('UPDATE requests SET status = ? WHERE id = ?')
    .run(status === 'done' ? 'done' : 'new', id);
  return get('requests', id);
}

function newRequestCount() {
  return db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'new'").get().n;
}

/* ---------- Снимки данных ---------- */

/* То, что видит любой посетитель: наполнение без заявок и без пароля */
function publicContent() {
  return {
    version: Number(meta('version') || 1),
    settings: settings(false),
    categories: list('categories'),
    products: list('products'),
    banners: list('banners'),
    pages: pages(),
    requests: []
  };
}

/* То же плюс заявки — только для авторизованного админа */
function adminContent() {
  var data = publicContent();
  data.requests = list('requests');
  return data;
}

/* ---------- Выгрузка и загрузка ---------- */

function exportAll() {
  return adminContent();
}

function importAll(data, opts) {
  opts = opts || {};
  if (!data || typeof data !== 'object' || !Array.isArray(data.products)) {
    throw new Error('Файл не похож на выгрузку «Клевера»');
  }

  db.exec('BEGIN');
  try {
    ['categories', 'products', 'banners'].forEach(function (c) {
      db.exec('DELETE FROM ' + SHAPES[c].table);
    });
    db.exec('DELETE FROM pages');
    if (data.requests && Array.isArray(data.requests)) {
      db.exec('DELETE FROM requests');
    }

    ['categories', 'products', 'banners'].forEach(function (c) {
      (data[c] || []).forEach(function (item, n) {
        if (!item.order) item.order = n + 1;
        if (!item.id) item.id = uid(c.charAt(0));
        var shape = SHAPES[c];
        var row = itemToRow(shape, item);
        var cols = Object.keys(row);
        var stmt = db.prepare('INSERT OR REPLACE INTO ' + shape.table + ' (' + cols.join(', ') + ') VALUES (' +
          cols.map(function () { return '?'; }).join(', ') + ')');
        stmt.run.apply(stmt, cols.map(function (k) { return row[k]; }));
      });
    });

    var pageOrder = 0;
    Object.keys(data.pages || {}).forEach(function (key) {
      var p = data.pages[key] || {};
      pageOrder += 1;
      db.prepare('INSERT OR REPLACE INTO pages (key, title, subtitle, body, image, ord) VALUES (?, ?, ?, ?, ?, ?)')
        .run(key, String(p.title || ''), String(p.subtitle || ''),
          String(p.body || ''), String(p.image || ''), pageOrder);
    });

    (data.requests || []).forEach(function (r) {
      if (!r.id) r.id = uid('r');
      var shape = SHAPES.requests;
      var row = itemToRow(shape, r);
      var cols = Object.keys(row);
      var stmt = db.prepare('INSERT OR REPLACE INTO requests (' + cols.join(', ') + ') VALUES (' +
        cols.map(function () { return '?'; }).join(', ') + ')');
      stmt.run.apply(stmt, cols.map(function (k) { return row[k]; }));
    });

    var incoming = data.settings || {};
    Object.keys(incoming).forEach(function (k) {
      if (SECRET_SETTINGS.indexOf(k) > -1) return;
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ' +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(k, incoming[k] == null ? '' : String(incoming[k]));
    });

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  /* Пароль из файла не берём — он остаётся тот, что был на сервере.
     Исключение: первое наполнение пустой базы (тогда его ставит server.js). */
  if (!opts.keepPassword) { /* ничего не делаем: пароль неприкосновенен */ }
  return adminContent();
}

function resetToSeed() {
  db.exec('DELETE FROM requests');
  return importAll(JSON.parse(JSON.stringify(SEED)), { keepPassword: true });
}

/* ---------- Сессии ---------- */

function createSession(days) {
  var id = crypto.randomBytes(32).toString('hex');
  var now = Date.now();
  var expires = now + (days || 14) * 86400000;
  db.prepare('INSERT INTO sessions (id, created, expires) VALUES (?, ?, ?)').run(id, now, expires);
  return { id: id, expires: expires };
}

function checkSession(id) {
  if (!id) return false;
  var row = db.prepare('SELECT expires FROM sessions WHERE id = ?').get(id);
  if (!row) return false;
  if (Number(row.expires) < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return false;
  }
  return true;
}

function deleteSession(id) {
  if (id) db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

function dropAllSessions() {
  db.exec('DELETE FROM sessions');
}

function pruneSessions() {
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
}

/* ---------- Мелочи ---------- */

function uid(prefix) {
  return (prefix || 'id') + '-' + crypto.randomBytes(4).toString('hex');
}

/* Все пути к картинкам, которые сейчас где-то используются.
   Нужно, чтобы понять, какие файлы в uploads/ уже никому не нужны. */
function usedImages() {
  var used = new Set();
  function add(v) { if (v && typeof v === 'string') used.add(v); }

  list('products').forEach(function (p) {
    (p.images || []).forEach(add);
    add(p.thumb);
  });
  list('banners').forEach(function (b) { add(b.image); });
  var pgs = pages();
  Object.keys(pgs).forEach(function (k) { add(pgs[k].image); });
  return used;
}

function close() {
  if (db) { db.close(); db = null; }
}

module.exports = {
  open: open, close: close, seed: seed,
  meta: meta, setMeta: setMeta,
  settings: settings, setSetting: setSetting, saveSettings: saveSettings,
  pages: pages, savePage: savePage,
  list: list, get: get, upsert: upsert, remove: remove, move: move,
  addRequest: addRequest, setRequestStatus: setRequestStatus, newRequestCount: newRequestCount,
  publicContent: publicContent, adminContent: adminContent,
  exportAll: exportAll, importAll: importAll, resetToSeed: resetToSeed,
  createSession: createSession, checkSession: checkSession,
  deleteSession: deleteSession, dropAllSessions: dropAllSessions, pruneSessions: pruneSessions,
  usedImages: usedImages, uid: uid
};
