/* Клевер — хранилище данных.

   Наполнение приходит с сервера: страница подключает /api/content.js, который
   кладёт готовый снимок в window.KLEVER_DATA. Поэтому всё чтение осталось
   мгновенным и синхронным — витрина не знает, что данные теперь общие.

   Изменения уходят на сервер по сети, поэтому все методы записи возвращают
   промис с { ok, message }. */

window.Store = (function () {
  var SESSION_KEY = 'klever.admin';
  var data = null;
  var admin = false;
  var defaultPassword = false;
  var offline = false;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* Пустышка на случай, если сервер не ответил: страница покажет каркас
     и честное сообщение вместо белого экрана с ошибкой в консоли. */
  var EMPTY = {
    version: 0,
    settings: { siteName: 'Авторская одежда Любови Меньшениной', tagline: 'Мастерская Клевер', slogan: '' },
    categories: [], products: [], banners: [],
    pages: { about: {}, delivery: {}, care: {}, contacts: {} },
    requests: []
  };

  function load() {
    if (data) return data;
    if (window.KLEVER_DATA) {
      data = window.KLEVER_DATA;
    } else {
      offline = true;
      console.error('Клевер: не удалось получить наполнение с сервера (/api/content.js). ' +
        'Сайт нужно открывать через запущенный сервер, а не двойным кликом по файлу.');
      data = clone(EMPTY);
    }
    if (!data.pages) data.pages = clone(EMPTY.pages);
    ['categories', 'products', 'banners', 'requests'].forEach(function (k) {
      if (!Array.isArray(data[k])) data[k] = [];
    });
    return data;
  }

  /* ---------- Сетевой слой ---------- */

  function request(method, url, body, opts) {
    opts = opts || {};
    var init = {
      method: method,
      credentials: 'same-origin',
      headers: { 'X-Klever': '1' }
    };
    if (body !== undefined && body !== null) {
      if (opts.raw) {
        init.body = body;
        init.headers['Content-Type'] = opts.contentType || 'application/octet-stream';
      } else {
        init.body = JSON.stringify(body);
        init.headers['Content-Type'] = 'application/json';
      }
    }

    return fetch(url, init).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, message: 'Сервер ответил непонятно (' + res.status + ')' };
      }).then(function (json) {
        if (res.status === 401 && url.indexOf('/api/admin/') > -1) {
          admin = false;
          try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        }
        if (!res.ok && json.ok !== false) json.ok = false;
        return json;
      });
    }).catch(function (e) {
      return { ok: false, message: 'Нет связи с сервером: ' + (e.message || e) };
    });
  }

  function post(url, body) { return request('POST', url, body); }
  function get(url) { return request('GET', url, null); }

  /* После любой правки перечитываем наполнение целиком. Так на экране
     всегда ровно то, что лежит в базе, — без расхождений и догадок. */
  function refresh() {
    return get('/api/admin/bootstrap').then(function (res) {
      if (res.ok && res.data) {
        data = res.data;
        admin = true;
        defaultPassword = !!res.defaultPassword;
      }
      return res;
    });
  }

  /* Оборачиваем запись: сохранили — перечитали — вернули результат */
  function write(url, body) {
    return post(url, body).then(function (res) {
      if (!res.ok) return res;
      return refresh().then(function () { return res; });
    });
  }

  /* ---------- Мелочи ---------- */

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9);
  }

  function slugify(str) {
    var map = {
      а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
      н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',
      ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
    };
    return String(str || '').toLowerCase()
      .replace(/[а-яё]/g, function (c) { return map[c] !== undefined ? map[c] : c; })
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || uid('item');
  }

  var api = {

    /* ---------- Чтение ---------- */

    all: function () { return load(); },
    settings: function () { return load().settings; },
    categories: function () {
      return load().categories.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    },
    category: function (slug) {
      return load().categories.filter(function (c) { return c.slug === slug; })[0] || null;
    },
    products: function () {
      return load().products.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    },
    product: function (idOrSlug) {
      return load().products.filter(function (p) { return p.id === idOrSlug || p.slug === idOrSlug; })[0] || null;
    },
    featured: function (limit) {
      var list = api.products().filter(function (p) { return p.featured; });
      return limit ? list.slice(0, limit) : list;
    },
    banners: function () {
      return load().banners.filter(function (b) { return b.active !== false; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    },
    page: function (key) { return load().pages[key] || null; },
    requests: function () {
      return load().requests.slice().sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
    },

    /* ---------- Запись (всё возвращает промис) ---------- */

    upsert: function (collection, item) {
      return write('/api/admin/save', { collection: collection, item: item });
    },

    remove: function (collection, id) {
      return write('/api/admin/remove', { collection: collection, id: id });
    },

    move: function (collection, id, dir) {
      return write('/api/admin/move', { collection: collection, id: id, dir: dir });
    },

    savePage: function (key, page) {
      return write('/api/admin/page', { key: key, page: page });
    },

    saveSettings: function (s) {
      return write('/api/admin/settings', { settings: s });
    },

    changePassword: function (current, next) {
      return post('/api/admin/password', { current: current, password: next })
        .then(function (res) {
          if (res.ok) defaultPassword = false;
          return res;
        });
    },

    /* Заявка приходит от покупателя — сюда может писать кто угодно,
       поэтому адрес публичный и лимитирован по частоте на сервере. */
    addRequest: function (req) {
      return post('/api/requests', req);
    },

    setRequestStatus: function (id, status) {
      return write('/api/admin/request-status', { id: id, status: status });
    },

    /* ---------- Фотографии ---------- */

    /* Браузер уже уменьшил кадр; сюда приходит готовый Blob.
       Полная версия и уменьшенная кладутся рядом: xxx.jpg и xxx-sm.jpg. */
    uploadImage: function (fullBlob, smallBlob) {
      return request('POST', '/api/admin/upload?variant=full', fullBlob,
        { raw: true, contentType: fullBlob.type || 'image/jpeg' }
      ).then(function (res) {
        if (!res.ok) return res;
        if (!smallBlob) return res;
        return request('POST', '/api/admin/upload?variant=sm&base=' + encodeURIComponent(res.id),
          smallBlob, { raw: true, contentType: smallBlob.type || 'image/jpeg' }
        ).then(function (sm) {
          res.thumb = sm.ok ? sm.url : '';
          return res;
        });
      });
    },

    /* ---------- Данные ---------- */

    exportURL: function () { return '/api/admin/export'; },

    importJSON: function (text) {
      var parsed;
      try { parsed = JSON.parse(text); }
      catch (e) { return Promise.resolve({ ok: false, message: 'Файл не читается как JSON' }); }
      return write('/api/admin/import', { data: parsed });
    },

    reset: function () { return write('/api/admin/reset', {}); },

    stats: function () { return get('/api/admin/stats'); },

    cleanup: function () {
      return post('/api/admin/cleanup', {}).then(function (res) {
        return res;
      });
    },

    /* ---------- Сессия админа ---------- */

    isAdmin: function () { return admin; },

    /* Наполнение не пришло — витрине есть о чём предупредить посетителя */
    offline: function () { load(); return offline; },

    usesDefaultPassword: function () { return defaultPassword; },

    /* Проверяем сессию на сервере и, если она есть, сразу тянем заявки */
    boot: function () {
      return get('/api/session').then(function (res) {
        admin = !!(res && res.admin);
        defaultPassword = !!(res && res.defaultPassword);
        if (!admin) return res;
        return refresh();
      });
    },

    login: function (pass) {
      return post('/api/login', { password: pass }).then(function (res) {
        if (!res.ok) return res;
        admin = true;
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
        return refresh().then(function () { return res; });
      });
    },

    logout: function () {
      return post('/api/logout', {}).then(function (res) {
        admin = false;
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
        return res;
      });
    },

    uid: uid,
    slugify: slugify
  };

  return api;
})();
