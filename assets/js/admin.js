/* Клевер — админ-панель.
   Данные лежат в базе на сервере (см. store.js и server/).
   Вход — по паролю, сессия живёт в httpOnly-куке. */

(function () {
  UI.init();

  var esc = UI.esc;
  var app = document.getElementById('app');

  var view = { section: 'dashboard', editing: null, editType: null };
  var stats = null;

  /* ================= Вход ================= */

  function renderLogin() {
    app.innerHTML =
      '<div class="login-wrap"><div class="login-card">' +
        '<a class="logo" href="index.html">' + UI.cloverSVG('logo__mark') +
          '<span class="logo__text"><span class="logo__name">Клевер</span>' +
          '<span class="logo__tag">Админ-панель</span></span></a>' +
        '<p class="muted" style="font-size:0.9rem">Введите пароль, чтобы редактировать сайт.</p>' +
        '<form id="login-form">' +
          '<div class="field"><input class="input" type="password" id="pass" placeholder="Пароль" autocomplete="current-password"></div>' +
          '<button class="btn btn--primary btn--wide" type="submit">Войти</button>' +
        '</form>' +
        '<p style="margin-top:16px"><a class="link-arrow" href="index.html" style="font-size:0.8rem">← На сайт</a></p>' +
      '</div></div>';

    var form = document.getElementById('login-form');
    var submit = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('pass');
      submit.disabled = true;
      submit.textContent = 'Проверяем…';

      Store.login(input.value).then(function (res) {
        submit.disabled = false;
        submit.textContent = 'Войти';
        if (res.ok) { render(); return; }
        UI.toast(res.message || 'Пароль не подходит', 'warn');
        input.value = '';
        input.focus();
      });
    });
  }

  /* ================= Каркас ================= */

  var SECTIONS = [
    { key: 'dashboard', label: 'Обзор' },
    { key: 'products',  label: 'Товары' },
    { key: 'categories',label: 'Категории' },
    { key: 'banners',   label: 'Баннеры' },
    { key: 'pages',     label: 'Страницы' },
    { key: 'requests',  label: 'Заявки' },
    { key: 'settings',  label: 'Настройки' },
    { key: 'data',      label: 'Данные' }
  ];

  function counts() {
    var d = Store.all();
    return {
      products: d.products.length,
      categories: d.categories.length,
      banners: d.banners.length,
      requests: d.requests.filter(function (r) { return r.status === 'new'; }).length
    };
  }

  function renderShell() {
    var c = counts();
    app.innerHTML =
      '<div class="admin-shell">' +
        '<aside class="admin-side">' +
          '<a class="logo" href="index.html">' + UI.cloverSVG('logo__mark') +
            '<span class="logo__text"><span class="logo__name">Клевер</span>' +
            '<span class="logo__tag">Админ-панель</span></span></a>' +
          '<nav class="admin-nav">' +
            SECTIONS.map(function (s) {
              var n = c[s.key];
              return '<button data-section="' + s.key + '"' + (view.section === s.key ? ' class="is-active"' : '') + '>' +
                esc(s.label) + (n ? '<span class="pill">' + n + '</span>' : '') + '</button>';
            }).join('') +
          '</nav>' +
          '<div class="admin-side__foot">' +
            '<a href="index.html" target="_blank" rel="noopener">Открыть сайт ↗</a>' +
            '<span>' + (stats ? 'База: ' + kb(stats.dbBytes) + ' · фото: ' + kb(stats.uploadBytes) : 'Данные на сервере') + '</span>' +
            '<button class="btn btn--quiet btn--sm" id="logout" style="align-self:flex-start;padding:0">Выйти</button>' +
          '</div>' +
        '</aside>' +
        '<main class="admin-main" id="admin-main"></main>' +
      '</div>';

    app.querySelector('.admin-nav').addEventListener('click', function (e) {
      var b = e.target.closest('[data-section]');
      if (!b) return;
      view.section = b.dataset.section;
      view.editing = null;
      render();
    });
    document.getElementById('logout').addEventListener('click', function () {
      Store.logout().then(render);
    });
  }

  /* Килобайты и мегабайты без лишних знаков после запятой */
  function kb(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' Б';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' КБ';
    return (n / (1024 * 1024)).toFixed(1).replace('.', ',') + ' МБ';
  }

  function head(title, sub, actionHtml) {
    return '<div class="admin-head"><div><h1>' + esc(title) + '</h1><p>' + (sub || '') + '</p></div>' +
      '<div>' + (actionHtml || '') + '</div></div>';
  }

  /* ================= Поля формы ================= */

  function field(key, label, opts) {
    opts = opts || {};
    var v = opts.value == null ? '' : opts.value;
    var cls = 'field' + (opts.full ? ' field--full' : '');
    var input;

    if (opts.type === 'textarea') {
      input = '<textarea class="textarea" data-f="' + key + '"' +
        (opts.rows ? ' style="min-height:' + (opts.rows * 24) + 'px"' : '') +
        ' placeholder="' + esc(opts.placeholder || '') + '">' + esc(v) + '</textarea>';
    } else if (opts.type === 'select') {
      input = '<select class="input select" data-f="' + key + '">' +
        opts.options.map(function (o) {
          return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(v) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('') + '</select>';
    } else if (opts.type === 'switch') {
      return '<div class="' + cls + '"><label class="switch"><input type="checkbox" data-f="' + key + '"' +
        (v ? ' checked' : '') + '> ' + esc(label) + '</label>' +
        (opts.hint ? '<span class="field__hint">' + esc(opts.hint) + '</span>' : '') + '</div>';
    } else {
      input = '<input class="input" type="' + (opts.type || 'text') + '" data-f="' + key + '" value="' + esc(v) + '"' +
        ' placeholder="' + esc(opts.placeholder || '') + '">';
    }

    return '<div class="' + cls + '">' +
      '<label class="field__label">' + esc(label) + '</label>' + input +
      (opts.hint ? '<span class="field__hint">' + esc(opts.hint) + '</span>' : '') + '</div>';
  }

  function val(key) {
    var el = document.querySelector('[data-f="' + key + '"]');
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }

  function num(key) {
    var v = parseInt(String(val(key)).replace(/\s/g, ''), 10);
    return isNaN(v) ? 0 : v;
  }

  function listValue(key) {
    return String(val(key)).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* ---------- Загрузка изображений ----------
     Браузер уменьшает снимок до 1200 px (и до 700 px для карточек каталога),
     а сервер кладёт оба файла в папку uploads. В карточке товара остаётся
     только путь — поэтому база лёгкая, а фото кешируется браузером. */

  var FULL_PX = 1200;
  var SMALL_PX = 700;

  var uploadBuffer = [];   /* пути к полным снимкам */
  var uploadThumbs = {};   /* полный путь → путь к уменьшенной копии */
  var uploading = 0;

  function uploadsBlock(images, multiple, thumb) {
    uploadBuffer = (images || []).slice();
    uploadThumbs = {};
    if (thumb && uploadBuffer[0]) uploadThumbs[uploadBuffer[0]] = thumb;
    uploading = 0;

    return '<div class="field field--full">' +
      '<label class="field__label">' + (multiple ? 'Фотографии' : 'Изображение') + '</label>' +
      '<div class="uploads" id="uploads"></div>' +
      '<input type="file" id="file-input" accept="image/*"' + (multiple ? ' multiple' : '') + ' hidden>' +
      '<span class="field__hint">Снимок уменьшается до ' + FULL_PX + ' px и загружается на сервер. ' +
        'Если фото нет — покажем пастельную заглушку с клевером.</span>' +
      '</div>';
  }

  /* Путь к уменьшенной копии первого снимка — он идёт в карточки каталога */
  function currentThumb() {
    return uploadThumbs[uploadBuffer[0]] || '';
  }

  function paintUploads(multiple) {
    var host = document.getElementById('uploads');
    if (!host) return;
    host.innerHTML = uploadBuffer.map(function (src, i) {
      return '<div class="upload-item"><img src="' + esc(src) + '" alt="">' +
        '<button type="button" data-del="' + i + '" title="Удалить">✕</button></div>';
    }).join('') +
    (uploading ? '<div class="upload-item upload-item--busy">Загружаем…</div>' : '') +
    ((multiple || !uploadBuffer.length)
      ? '<button type="button" class="upload-add" id="add-photo" title="Добавить">+</button>' : '');

    var add = document.getElementById('add-photo');
    if (add) add.addEventListener('click', function () { document.getElementById('file-input').click(); });

    host.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var gone = uploadBuffer.splice(+b.dataset.del, 1)[0];
        delete uploadThumbs[gone];
        paintUploads(multiple);
      });
    });
  }

  function bindFileInput(multiple) {
    var input = document.getElementById('file-input');
    if (!input) return;
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      input.value = '';

      /* Файлы идут по очереди: так порядок снимков совпадает с выбранным,
         и мы не заваливаем сервер десятком параллельных загрузок. */
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () { return uploadOne(f, multiple); });
      });
      chain.then(function () { paintUploads(multiple); });
    });
  }

  function uploadOne(file, multiple) {
    uploading += 1;
    paintUploads(multiple);

    return shrink(file, [FULL_PX, SMALL_PX]).then(function (blobs) {
      return Store.uploadImage(blobs[0], blobs[1]);
    }).then(function (res) {
      uploading -= 1;
      if (!res.ok) { UI.toast(res.message || 'Не удалось загрузить фото', 'warn'); return; }
      if (multiple) uploadBuffer.push(res.url);
      else { uploadBuffer = [res.url]; uploadThumbs = {}; }
      uploadThumbs[res.url] = res.thumb || '';
    }).catch(function (e) {
      uploading -= 1;
      UI.toast(e.message || 'Не удалось обработать файл', 'warn');
    });
  }

  /* Отдаёт по одному JPEG на каждый размер из списка */
  function shrink(file, sizes) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();

      img.onload = function () {
        var jobs = sizes.map(function (max) {
          var w = img.width, h = img.height;
          if (w > max || h > max) {
            var k = Math.min(max / w, max / h);
            w = Math.round(w * k); h = Math.round(h * k);
          }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var ctx = c.getContext('2d');
          /* Белая подложка: у PNG с прозрачностью иначе получится чёрный фон */
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          return new Promise(function (done) { c.toBlob(done, 'image/jpeg', 0.82); });
        });

        Promise.all(jobs).then(function (blobs) {
          URL.revokeObjectURL(url);
          if (blobs.some(function (b) { return !b; })) reject(new Error('Не удалось обработать файл'));
          else resolve(blobs);
        });
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Это не похоже на картинку'));
      };
      img.src = url;
    });
  }

  /* ---------- Мини-редактор текста ---------- */

  function mdEditor(key, label, value, rows) {
    return '<div class="field field--full">' +
      '<label class="field__label">' + esc(label) + '</label>' +
      '<div class="md-toolbar" data-md="' + key + '">' +
        '<button type="button" data-ins="## ">Заголовок</button>' +
        '<button type="button" data-ins="### ">Подзаголовок</button>' +
        '<button type="button" data-ins="- ">Список</button>' +
        '<button type="button" data-ins="> ">Цитата</button>' +
        '<button type="button" data-wrap="**">Жирный</button>' +
      '</div>' +
      '<textarea class="textarea" data-f="' + key + '" id="md-' + key + '" style="min-height:' + ((rows || 12) * 24) + 'px">' + esc(value || '') + '</textarea>' +
      '<span class="field__hint">Пустая строка — новый абзац. ## — заголовок, - — пункт списка, &gt; — цитата, **текст** — жирный.</span>' +
      '<div style="margin-top:14px"><div class="field__label" style="margin-bottom:6px">Предпросмотр</div>' +
      '<div class="preview"><div class="prose" id="preview-' + key + '"></div></div></div>' +
      '</div>';
  }

  function bindMd(key) {
    var ta = document.getElementById('md-' + key);
    var prev = document.getElementById('preview-' + key);
    if (!ta || !prev) return;
    function paint() { prev.innerHTML = UI.markup(ta.value); }
    ta.addEventListener('input', paint);
    paint();

    var bar = document.querySelector('[data-md="' + key + '"]');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var s = ta.selectionStart, en = ta.selectionEnd;
      if (b.dataset.wrap) {
        var w = b.dataset.wrap;
        var sel = ta.value.slice(s, en) || 'текст';
        ta.value = ta.value.slice(0, s) + w + sel + w + ta.value.slice(en);
        ta.selectionStart = s + w.length; ta.selectionEnd = s + w.length + sel.length;
      } else {
        var lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
        ta.value = ta.value.slice(0, lineStart) + b.dataset.ins + ta.value.slice(lineStart);
        ta.selectionStart = ta.selectionEnd = s + b.dataset.ins.length;
      }
      ta.focus();
      paint();
    });
  }

  /* ---------- Сохранение ---------- */

  /* Сохранение теперь уходит на сервер, поэтому принимаем и промис, и готовый
     результат — все старые вызовы done(...) продолжают работать как раньше. */
  function done(result, message) {
    return Promise.resolve(result).then(function (res) {
      if (res && res.ok === false) {
        UI.toast(res.message || 'Не удалось сохранить', 'warn');
        /* Если сервер сказал «войдите заново», показываем экран входа сразу,
           а не оставляем панель, в которой ничего больше не сохранится */
        if (!Store.isAdmin()) render();
        return false;
      }
      UI.toast(message || 'Сохранено');
      view.editing = null;
      render();
      return true;
    });
  }

  /* Пока правка летит на сервер, кнопку гасим: иначе второй клик успевает
     создать второй такой же товар. При ошибке кнопку возвращаем. */
  function commit(btn, promise, message) {
    var label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Сохраняем…'; }
    return done(promise, message).then(function (okFlag) {
      if (btn && !okFlag) { btn.disabled = false; btn.textContent = label; }
      return okFlag;
    });
  }

  function confirmDelete(what, fn) {
    confirmAction('Удалить?', esc(what) + ' будет удалён без возможности вернуть.', 'Да, удалить', fn);
  }

  function confirmAction(title, note, yesLabel, fn) {
    var m = UI.modal(
      '<div class="modal__head"><h3 style="margin-bottom:6px">' + esc(title) + '</h3>' +
      '<p class="muted" style="margin:0;font-size:0.9rem">' + note + '</p></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<button class="btn btn--primary" id="yes">' + esc(yesLabel) + '</button>' +
        '<button class="btn btn--ghost" data-close>Отмена</button></div>'
    );
    m.el.querySelector('#yes').addEventListener('click', function () { m.close(); fn(); });
  }

  /* ================= Обзор ================= */

  function sectionDashboard(main) {
    var d = Store.all();
    var newReq = d.requests.filter(function (r) { return r.status === 'new'; }).length;
    var tiles = [
      [d.products.length, 'товаров'],
      [d.products.filter(function (p) { return p.inStock; }).length, 'в наличии'],
      [d.banners.length, 'баннеров'],
      [newReq, 'новых заявок']
    ];

    main.innerHTML =
      head('Обзор', 'Здесь можно быстро понять, что происходит с сайтом.') +
      '<div class="stats">' + tiles.map(function (s) {
        return '<div class="stat"><div class="stat__n">' + s[0] + '</div><div class="stat__l">' + s[1] + '</div></div>';
      }).join('') + '</div>' +
      '<div class="panel"><div class="panel__head"><h3>Последние заявки</h3>' +
        '<button class="btn btn--quiet btn--sm" data-go="requests">Все заявки →</button></div>' +
        '<div class="rows">' + (d.requests.length
          ? Store.requests().slice(0, 5).map(function (r) {
              return '<div class="row row--flat">' +
                '<div class="row__body"><div class="row__title">' + esc(r.name) + ' — ' + esc(r.productTitle) + '</div>' +
                '<div class="row__sub">' + esc(r.contact) + ' · ' + esc(UI.dateRu(r.createdAt)) + '</div></div>' +
                '<div class="row__tags"><span class="tag ' + (r.status === 'new' ? 'tag--new' : 'tag--off') + '">' +
                (r.status === 'new' ? 'новая' : 'обработана') + '</span></div></div>';
            }).join('')
          : '<div class="panel__body muted">Заявок пока нет. Они появятся, когда кто-то заполнит форму на сайте.</div>') +
        '</div></div>' +
      '<div class="panel"><div class="panel__body">' +
        (Store.usesDefaultPassword()
          ? '<div class="hint-box hint-box--warn"><strong>Смените пароль от панели.</strong> ' +
            'Сейчас он демонстрационный, и войти сюда может кто угодно. ' +
            'Это делается в разделе «Настройки» и занимает полминуты.</div>'
          : '<div class="hint-box">Всё, что вы здесь меняете, сразу видят посетители сайта. ' +
            'Раздел «Данные» показывает, сколько всего накопилось, и позволяет выгрузить ' +
            'наполнение файлом — на случай переезда или как страховку.</div>') +
      '</div></div>';

    main.addEventListener('click', function (e) {
      var b = e.target.closest('[data-go]');
      if (b) { view.section = b.dataset.go; render(); }
    });
  }

  var GENDER_LABEL = { women: 'Женщинам', men: 'Мужчинам' };

  /* ================= Товары ================= */

  function sectionProducts(main) {
    if (view.editing !== null && view.editType === 'product') return editProduct(main);

    var list = Store.products();
    var cats = Store.categories();

    main.innerHTML =
      head('Товары', 'Карточки, которые видят покупатели в каталоге и на главной.',
        '<button class="btn btn--primary" data-new>+ Добавить товар</button>') +
      '<div class="panel"><div class="rows">' +
      (list.length ? list.map(function (p) {
        var cat = cats.filter(function (c) { return c.slug === p.category; })[0];
        return '<div class="row">' +
          '<img class="row__thumb" src="' + UI.imageOf(p) + '" alt="">' +
          '<div class="row__body"><div class="row__title">' + esc(p.title) + '</div>' +
            '<div class="row__sub">' + esc(GENDER_LABEL[p.gender] || 'Женщинам') + ' · ' +
            esc(cat ? cat.title : 'без категории') + ' · ' + UI.price(p.price) +
            ' · ' + esc(p.fabric || '') + '</div></div>' +
          '<div class="row__tags">' +
            (p.featured ? '<span class="tag tag--on">на главной</span>' : '') +
            '<span class="tag ' + (p.inStock ? 'tag--on' : 'tag--off') + '">' + (p.inStock ? 'в наличии' : 'под заказ') + '</span>' +
          '</div>' +
          '<div class="row__actions">' +
            '<button class="icon-btn" data-up="' + p.id + '" title="Выше">↑</button>' +
            '<button class="icon-btn" data-down="' + p.id + '" title="Ниже">↓</button>' +
            '<button class="icon-btn" data-edit="' + p.id + '" title="Изменить">✎</button>' +
            '<button class="icon-btn icon-btn--danger" data-del="' + p.id + '" title="Удалить">✕</button>' +
          '</div></div>';
      }).join('') : '<div class="panel__body muted">Товаров нет. Добавьте первый — он сразу появится в каталоге.</div>') +
      '</div></div>';

    main.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.hasAttribute('data-new')) { view.editType = 'product'; view.editing = {}; render(); }
      else if (t.dataset.edit) { view.editType = 'product'; view.editing = Store.product(t.dataset.edit); render(); }
      else if (t.dataset.up) { Store.move('products', t.dataset.up, -1).then(render); }
      else if (t.dataset.down) { Store.move('products', t.dataset.down, 1).then(render); }
      else if (t.dataset.del) {
        var p = Store.product(t.dataset.del);
        confirmDelete('Товар «' + p.title + '»', function () {
          done(Store.remove('products', p.id), 'Товар удалён');
        });
      }
    });
  }

  /* Адрес товара в ссылке никто не вводит руками — он собирается из названия.
     Если такой адрес уже занят другим товаром, добавляем номер: plate-poleva-2. */
  function productSlug(title, exceptId) {
    var base = Store.slugify(title);
    var taken = Store.products().filter(function (x) { return x.id !== exceptId; })
      .map(function (x) { return x.slug; });
    var slug = base, n = 2;
    while (taken.indexOf(slug) > -1) { slug = base + '-' + n; n += 1; }
    return slug;
  }

  function editProduct(main) {
    var p = view.editing;
    var isNew = !p.id;
    var cats = Store.categories().map(function (c) { return { value: c.slug, label: c.title }; });

    main.innerHTML =
      head(isNew ? 'Новый товар' : 'Изменить товар', 'Заполните то, что важно — остальное можно оставить пустым.',
        '<button class="btn btn--ghost" data-back>← К списку</button>') +
      '<div class="panel"><div class="panel__body"><div class="form-grid">' +
        field('title', 'Название', { value: p.title, full: true, placeholder: 'Платье «Полева»' }) +
        field('category', 'Категория', { value: p.category, type: 'select', options: cats }) +
        field('gender', 'Кому', { value: p.gender || 'women', type: 'select', options: [
          { value: 'women', label: 'Женщинам' },
          { value: 'men', label: 'Мужчинам' }
        ] }) +
        field('price', 'Цена, ₽', { value: p.price, type: 'number' }) +
        field('oldPrice', 'Старая цена, ₽', { value: p.oldPrice, type: 'number', hint: '0 — не показывать' }) +
        field('fabric', 'Ткань и состав', { value: p.fabric, placeholder: '100% лён, промытый' }) +
        field('color', 'Цвет', { value: p.color, placeholder: 'Молочный' }) +
        field('sizes', 'Размеры', { value: (p.sizes || []).join(', '), full: true, hint: 'Через запятую: XS, S, M, L' }) +
        field('inStock', 'В наличии', { value: p.inStock !== false, type: 'switch' }) +
        field('featured', 'Показывать на главной', { value: !!p.featured, type: 'switch' }) +
        uploadsBlock(p.images, true, p.thumb) +
        field('care', 'Уход', { value: p.care, full: true, type: 'textarea', rows: 2 }) +
        mdEditor('description', 'Описание', p.description, 8) +
      '</div>' +
      '<div class="editor-actions">' +
        '<button class="btn btn--primary" data-save>Сохранить</button>' +
        '<button class="btn btn--ghost" data-back>Отмена</button>' +
        '<span class="spacer"></span>' +
        (isNew ? '' : '<button class="btn btn--quiet" data-del-here>Удалить товар</button>') +
      '</div></div></div>';

    paintUploads(true);
    bindFileInput(true);
    bindMd('description');

    main.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.hasAttribute('data-back')) { view.editing = null; render(); }
      if (t.hasAttribute('data-del-here')) {
        confirmDelete('Товар «' + p.title + '»', function () {
          done(Store.remove('products', p.id), 'Товар удалён');
        });
      }
      if (t.hasAttribute('data-save')) {
        var title = String(val('title')).trim();
        if (!title) { UI.toast('Без названия товар не сохранить', 'warn'); return; }
        if (uploading) { UI.toast('Подождите, фотографии ещё загружаются', 'warn'); return; }
        var item = Object.assign({}, p, {
          title: title,
          slug: (p.slug && title === p.title) ? p.slug : productSlug(title, p.id),
          category: val('category'),
          gender: val('gender'),
          price: num('price'),
          oldPrice: num('oldPrice'),
          fabric: val('fabric'),
          color: val('color'),
          sizes: listValue('sizes'),
          inStock: !!val('inStock'),
          featured: !!val('featured'),
          care: val('care'),
          description: val('description'),
          images: uploadBuffer.slice(),
          /* Облегчённая копия первого снимка — она идёт в карточки каталога */
          thumb: currentThumb(),
          order: p.order || (Store.products().length + 1),
          createdAt: p.createdAt || new Date().toISOString().slice(0, 10)
        });
        commit(t, Store.upsert('products', item), 'Товар сохранён');
      }
    });
  }

  /* ================= Категории ================= */

  function sectionCategories(main) {
    if (view.editing !== null && view.editType === 'category') return editCategory(main);
    var list = Store.categories();
    var products = Store.products();

    main.innerHTML =
      head('Категории', 'Разделы каталога. Товар без категории просто не попадёт в фильтр.',
        '<button class="btn btn--primary" data-new>+ Добавить категорию</button>') +
      '<div class="panel"><div class="rows">' +
      list.map(function (c) {
        var n = products.filter(function (p) { return p.category === c.slug; }).length;
        return '<div class="row">' +
          '<div class="row__thumb row__thumb--tint" style="background:' + esc(c.tint || '#E4EBE1') + '"></div>' +
          '<div class="row__body"><div class="row__title">' + esc(c.title) + '</div>' +
            '<div class="row__sub">' + esc(c.description || '') + ' · ' + n + ' ' + UI.plural(n, ['товар', 'товара', 'товаров']) + '</div></div>' +
          '<div class="row__tags"><span class="tag">' + esc(c.slug) + '</span></div>' +
          '<div class="row__actions">' +
            '<button class="icon-btn" data-up="' + c.id + '">↑</button>' +
            '<button class="icon-btn" data-down="' + c.id + '">↓</button>' +
            '<button class="icon-btn" data-edit="' + c.id + '">✎</button>' +
            '<button class="icon-btn icon-btn--danger" data-del="' + c.id + '">✕</button>' +
          '</div></div>';
      }).join('') + '</div></div>';

    main.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      var all = Store.all().categories;
      var byId = function (id) { return all.filter(function (x) { return x.id === id; })[0]; };
      if (t.hasAttribute('data-new')) { view.editType = 'category'; view.editing = {}; render(); }
      else if (t.dataset.edit) { view.editType = 'category'; view.editing = byId(t.dataset.edit); render(); }
      else if (t.dataset.up) { Store.move('categories', t.dataset.up, -1).then(render); }
      else if (t.dataset.down) { Store.move('categories', t.dataset.down, 1).then(render); }
      else if (t.dataset.del) {
        var c = byId(t.dataset.del);
        var n = Store.products().filter(function (p) { return p.category === c.slug; }).length;
        confirmDelete('Категория «' + c.title + '»' + (n ? ' (в ней ' + n + ' товаров, они останутся без раздела)' : ''), function () {
          done(Store.remove('categories', c.id), 'Категория удалена');
        });
      }
    });
  }

  function editCategory(main) {
    var c = view.editing;
    main.innerHTML =
      head(c.id ? 'Изменить категорию' : 'Новая категория', '', '<button class="btn btn--ghost" data-back>← К списку</button>') +
      '<div class="panel"><div class="panel__body"><div class="form-grid">' +
        field('title', 'Название', { value: c.title, placeholder: 'Платья' }) +
        field('slug', 'Адрес в ссылке', { value: c.slug, placeholder: 'dresses' }) +
        field('description', 'Короткое описание', { value: c.description, full: true, placeholder: 'Свободный крой, лён и хлопок' }) +
        field('tint', 'Оттенок плитки', { value: c.tint || '#E4EBE1', type: 'color' }) +
      '</div><div class="editor-actions">' +
        '<button class="btn btn--primary" data-save>Сохранить</button>' +
        '<button class="btn btn--ghost" data-back>Отмена</button>' +
      '</div></div></div>';

    main.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.hasAttribute('data-back')) { view.editing = null; render(); }
      if (t.hasAttribute('data-save')) {
        var title = String(val('title')).trim();
        if (!title) { UI.toast('Нужно название', 'warn'); return; }
        commit(t, Store.upsert('categories', Object.assign({}, c, {
          title: title,
          slug: String(val('slug')).trim() || Store.slugify(title),
          description: val('description'),
          tint: val('tint'),
          order: c.order || (Store.categories().length + 1)
        })), 'Категория сохранена');
      }
    });
  }

  /* ================= Баннеры ================= */

  function sectionBanners(main) {
    if (view.editing !== null && view.editType === 'banner') return editBanner(main);
    var list = Store.all().banners.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

    main.innerHTML =
      head('Баннеры', 'Крупные блоки на главной. Если баннеров несколько — они меняются каруселью.',
        '<button class="btn btn--primary" data-new>+ Добавить баннер</button>') +
      '<div class="panel"><div class="rows">' +
      (list.length ? list.map(function (b) {
        return '<div class="row">' +
          '<img class="row__thumb row__thumb--wide" src="' + UI.imageOf({ image: b.image, slug: b.id + b.title }) + '" alt="">' +
          '<div class="row__body"><div class="row__title">' + esc(b.title) + '</div>' +
            '<div class="row__sub">' + esc(b.eyebrow || '') + ' · ' + esc((b.text || '').slice(0, 70)) + '…</div></div>' +
          '<div class="row__tags"><span class="tag ' + (b.active !== false ? 'tag--on' : 'tag--off') + '">' + (b.active !== false ? 'показывается' : 'скрыт') + '</span></div>' +
          '<div class="row__actions">' +
            '<button class="icon-btn" data-up="' + b.id + '">↑</button>' +
            '<button class="icon-btn" data-down="' + b.id + '">↓</button>' +
            '<button class="icon-btn" data-edit="' + b.id + '">✎</button>' +
            '<button class="icon-btn icon-btn--danger" data-del="' + b.id + '">✕</button>' +
          '</div></div>';
      }).join('') : '<div class="panel__body muted">Баннеров нет — на главной будет заглушка.</div>') +
      '</div></div>';

    main.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      var byId = function (id) { return Store.all().banners.filter(function (x) { return x.id === id; })[0]; };
      if (t.hasAttribute('data-new')) { view.editType = 'banner'; view.editing = {}; render(); }
      else if (t.dataset.edit) { view.editType = 'banner'; view.editing = byId(t.dataset.edit); render(); }
      else if (t.dataset.up) { Store.move('banners', t.dataset.up, -1).then(render); }
      else if (t.dataset.down) { Store.move('banners', t.dataset.down, 1).then(render); }
      else if (t.dataset.del) {
        var b = byId(t.dataset.del);
        confirmDelete('Баннер «' + b.title + '»', function () {
          done(Store.remove('banners', b.id), 'Баннер удалён');
        });
      }
    });
  }

  function editBanner(main) {
    var b = view.editing;
    main.innerHTML =
      head(b.id ? 'Изменить баннер' : 'Новый баннер', 'Заголовок короткий, текст — одна-две строки.',
        '<button class="btn btn--ghost" data-back>← К списку</button>') +
      '<div class="panel"><div class="panel__body"><div class="form-grid">' +
        field('eyebrow', 'Надзаголовок', { value: b.eyebrow, placeholder: 'Новая коллекция · Лето' }) +
        field('active', 'Показывать на сайте', { value: b.active !== false, type: 'switch' }) +
        field('title', 'Заголовок', { value: b.title, full: true, placeholder: 'Лён, который дышит вместе с вами' }) +
        field('text', 'Текст', { value: b.text, full: true, type: 'textarea', rows: 3 }) +
        field('ctaText', 'Кнопка — надпись', { value: b.ctaText, placeholder: 'Смотреть коллекцию' }) +
        field('ctaLink', 'Кнопка — ссылка', { value: b.ctaLink, placeholder: 'catalog.html' }) +
        field('ctaText2', 'Вторая кнопка — надпись', { value: b.ctaText2, hint: 'Необязательно' }) +
        field('ctaLink2', 'Вторая кнопка — ссылка', { value: b.ctaLink2 }) +
        uploadsBlock(b.image ? [b.image] : [], false) +
      '</div><div class="editor-actions">' +
        '<button class="btn btn--primary" data-save>Сохранить</button>' +
        '<button class="btn btn--ghost" data-back>Отмена</button>' +
      '</div></div></div>';

    paintUploads(false);
    bindFileInput(false);

    main.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.hasAttribute('data-back')) { view.editing = null; render(); }
      if (t.hasAttribute('data-save')) {
        var title = String(val('title')).trim();
        if (!title) { UI.toast('Нужен заголовок', 'warn'); return; }
        if (uploading) { UI.toast('Подождите, картинка ещё загружается', 'warn'); return; }
        commit(t, Store.upsert('banners', Object.assign({}, b, {
          eyebrow: val('eyebrow'), title: title, text: val('text'),
          ctaText: val('ctaText'), ctaLink: val('ctaLink'),
          ctaText2: val('ctaText2'), ctaLink2: val('ctaLink2'),
          active: !!val('active'),
          image: uploadBuffer[0] || '',
          order: b.order || (Store.all().banners.length + 1)
        })), 'Баннер сохранён');
      }
    });
  }

  /* ================= Страницы ================= */

  var PAGE_KEYS = [
    ['about', 'О мастерской'],
    ['delivery', 'Доставка и оплата'],
    ['care', 'Уход за изделиями'],
    ['contacts', 'Контакты'],
    ['terms', 'Условия продажи и возврата'],
    ['privacy', 'Политика конфиденциальности']
  ];

  function sectionPages(main) {
    if (view.editing !== null && view.editType === 'page') return editPage(main);

    main.innerHTML =
      head('Страницы', 'Тексты, которые не меняются каждый день, но всё же меняются.') +
      '<div class="panel"><div class="rows">' +
      PAGE_KEYS.map(function (k) {
        var pg = Store.page(k[0]) || {};
        return '<div class="row row--flat">' +
          '<div class="row__body"><div class="row__title">' + esc(pg.title || k[1]) + '</div>' +
          '<div class="row__sub">' + esc((pg.subtitle || '').slice(0, 90)) + '</div></div>' +
          '<div class="row__actions">' +
            '<a class="icon-btn" href="' + (k[0] === 'contacts' ? 'contacts.html' : 'page.html?p=' + k[0]) + '" target="_blank" title="Посмотреть">↗</a>' +
            '<button class="icon-btn" data-edit="' + k[0] + '">✎</button>' +
          '</div></div>';
      }).join('') + '</div></div>';

    main.addEventListener('click', function (e) {
      var t = e.target.closest('button[data-edit]');
      if (!t) return;
      view.editType = 'page';
      view.editing = Object.assign({ key: t.dataset.edit }, Store.page(t.dataset.edit));
      render();
    });
  }

  function editPage(main) {
    var pg = view.editing;
    var label = (PAGE_KEYS.filter(function (k) { return k[0] === pg.key; })[0] || ['', ''])[1];

    main.innerHTML =
      head('Страница: ' + label, '', '<button class="btn btn--ghost" data-back>← К списку</button>') +
      '<div class="panel"><div class="panel__body"><div class="form-grid">' +
        field('title', 'Заголовок', { value: pg.title, full: true }) +
        field('subtitle', 'Подзаголовок', { value: pg.subtitle, full: true, type: 'textarea', rows: 2 }) +
        (pg.key === 'about' ? uploadsBlock(pg.image ? [pg.image] : [], false) : '') +
        mdEditor('body', 'Текст страницы', pg.body, 14) +
      '</div><div class="editor-actions">' +
        '<button class="btn btn--primary" data-save>Сохранить</button>' +
        '<button class="btn btn--ghost" data-back>Отмена</button>' +
      '</div></div></div>';

    if (pg.key === 'about') { paintUploads(false); bindFileInput(false); }
    bindMd('body');

    main.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.hasAttribute('data-back')) { view.editing = null; render(); }
      if (t.hasAttribute('data-save')) {
        if (pg.key === 'about' && uploading) { UI.toast('Подождите, картинка ещё загружается', 'warn'); return; }
        var next = { title: val('title'), subtitle: val('subtitle'), body: val('body') };
        if (pg.key === 'about') next.image = uploadBuffer[0] || '';
        commit(t, Store.savePage(pg.key, next), 'Страница сохранена');
      }
    });
  }

  /* ================= Заявки ================= */

  function sectionRequests(main) {
    var list = Store.requests();

    main.innerHTML =
      head('Заявки', 'Всё, что оставили через формы на сайте — с любого устройства, из любого браузера.') +
      '<div class="panel"><div class="rows">' +
      (list.length ? list.map(function (r) {
        var goods = (r.items && r.items.length)
          ? '<div class="row__sub" style="margin-top:6px;color:var(--ink-soft)">' +
            r.items.map(function (i) {
              return '• ' + esc(i.title) + (i.size ? ', размер ' + esc(i.size) : '') +
                (i.qty > 1 ? ' — ' + i.qty + ' шт' : '') + ' — ' + UI.price(i.price * (i.qty || 1));
            }).join('<br>') +
            (r.total ? '<br><strong>Итого: ' + UI.price(r.total) + '</strong>' : '') + '</div>'
          : '';
        return '<div class="row row--flat">' +
          '<div class="row__body"><div class="row__title">' + esc(r.name) + ' · ' + esc(r.contact) + '</div>' +
            '<div class="row__sub">' + esc(r.productTitle) + (r.size ? ' · размер ' + esc(r.size) : '') +
            (r.delivery ? ' · ' + esc(r.delivery) : '') + ' · ' + esc(UI.dateRu(r.createdAt)) + '</div>' +
            goods +
            (r.comment ? '<div class="row__sub" style="margin-top:4px;color:var(--ink-soft)">' + esc(r.comment) + '</div>' : '') +
          '</div>' +
          '<div class="row__tags"><span class="tag ' + (r.status === 'new' ? 'tag--new' : 'tag--off') + '">' +
            (r.status === 'new' ? 'новая' : 'обработана') + '</span></div>' +
          '<div class="row__actions">' +
            '<button class="icon-btn" data-toggle="' + r.id + '" title="Отметить">✓</button>' +
            '<button class="icon-btn icon-btn--danger" data-del="' + r.id + '">✕</button>' +
          '</div></div>';
      }).join('') : '<div class="panel__body muted">Заявок пока нет.</div>') +
      '</div></div>';

    main.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.toggle) {
        var r = Store.requests().filter(function (x) { return x.id === t.dataset.toggle; })[0];
        if (!r) return;
        t.disabled = true;
        Store.setRequestStatus(r.id, r.status === 'new' ? 'done' : 'new').then(function (res) {
          if (!res.ok) { t.disabled = false; UI.toast(res.message, 'warn'); return; }
          render();
        });
      } else if (t.dataset.del) {
        confirmDelete('Заявка', function () { done(Store.remove('requests', t.dataset.del), 'Заявка удалена'); });
      }
    });
  }

  /* ================= Настройки ================= */

  function sectionSettings(main) {
    var s = Store.settings();
    main.innerHTML =
      head('Настройки', 'Название, контакты и пароль от этой панели.') +
      '<div class="panel"><div class="panel__body"><div class="form-grid">' +
        field('siteName', 'Название магазина', { value: s.siteName }) +
        field('tagline', 'Подпись под названием', { value: s.tagline }) +
        field('slogan', 'Слоган в подвале', { value: s.slogan, full: true }) +
        field('phone', 'Телефон', { value: s.phone }) +
        field('email', 'Почта', { value: s.email }) +
        field('vk', 'ВКонтакте', { value: s.vk, hint: 'Ссылка или имя: vk.com/club163698701 или club163698701' }) +
        field('telegram', 'Telegram', { value: s.telegram, hint: 'Без @, например klever_shop. Пусто — кнопки не будет' }) +
        field('whatsapp', 'WhatsApp', { value: s.whatsapp, hint: 'Только цифры: 79109759336. Пусто — кнопки не будет' }) +
        field('instagram', 'Instagram', { value: s.instagram, hint: 'Пусто — кнопки не будет' }) +
        field('workHours', 'Часы работы', { value: s.workHours }) +
        field('address', 'Адрес', { value: s.address, full: true }) +
        field('legal', 'Реквизиты продавца', { value: s.legal, full: true,
          hint: 'Показываются в подвале на каждой странице: ИП, ОГРНИП, ИНН' }) +
      '</div><div class="editor-actions">' +
        '<button class="btn btn--primary" data-save>Сохранить</button>' +
      '</div></div></div>' +

      '<div class="panel"><div class="panel__head"><h3>Пароль от панели</h3></div><div class="panel__body">' +
        (Store.usesDefaultPassword()
          ? '<div class="hint-box hint-box--warn" style="margin-bottom:20px">' +
            '<strong>Пароль всё ещё демонстрационный.</strong> Смените его — сейчас войти в панель ' +
            'может любой, кто знает, что сайт сделан на «Клевере».</div>'
          : '<div class="hint-box" style="margin-bottom:20px">Пароль хранится на сервере в виде ' +
            'необратимого отпечатка (scrypt) — прочитать его из базы нельзя. После смены ' +
            'все открытые сессии закрываются, кроме этой.</div>') +
        '<div class="form-grid">' +
          field('pwCurrent', 'Текущий пароль', { value: '', type: 'password' }) +
          field('pwNext', 'Новый пароль', { value: '', type: 'password', hint: 'Не короче шести знаков' }) +
        '</div>' +
        '<div class="editor-actions">' +
          '<button class="btn btn--primary" data-save-password>Сменить пароль</button>' +
        '</div>' +
      '</div></div>' +

      '<div class="panel"><div class="panel__head"><h3>Письма о заказах</h3></div><div class="panel__body">' +
        '<div class="hint-box" style="margin-bottom:20px">' +
          'Каждый заказ и так падает в раздел «Заявки» — письмо нужно только чтобы узнать о нём сразу, не заходя в панель. ' +
          '<strong>Web3Forms</strong> — заведите бесплатный ключ на web3forms.com, ваш адрес почты в коде страницы виден не будет. ' +
          '<strong>FormSubmit</strong> — без регистрации, но адрес почты будет виден в коде; первое письмо придёт с просьбой подтвердить адрес. ' +
          'Если письмо не дойдёт, заказ всё равно останется в «Заявках» — потерять его нельзя.' +
        '</div>' +
        '<div class="form-grid">' +
          field('mailProvider', 'Как отправлять', {
            value: s.mailProvider || 'none', type: 'select', options: [
              { value: 'none', label: 'Не отправлять — только копить заявки' },
              { value: 'web3forms', label: 'Web3Forms (нужен ключ)' },
              { value: 'formsubmit', label: 'FormSubmit (без регистрации)' }
            ]
          }) +
          field('mailTo', 'Адрес почты для заказов', { value: s.mailTo,
            hint: 'Обязателен для FormSubmit' }) +
          field('mailKey', 'Ключ Web3Forms (access key)', { value: s.mailKey, full: true,
            hint: 'Строка вида 1a2b3c4d-... из письма после регистрации на web3forms.com' }) +
        '</div>' +
        '<div class="editor-actions">' +
          '<button class="btn btn--primary" data-save-mail>Сохранить</button>' +
          '<button class="btn btn--ghost" data-test-mail>Отправить пробное письмо</button>' +
        '</div>' +
      '</div></div>';

    function collect(keys) {
      var next = {};
      keys.forEach(function (k) { next[k] = val(k); });
      return next;
    }

    main.addEventListener('click', function (e) {
      var save = e.target.closest('[data-save]');
      if (save) {
        commit(save, Store.saveSettings(collect(['siteName','tagline','slogan','phone','email','vk','telegram',
          'whatsapp','instagram','workHours','address','legal'])), 'Настройки сохранены');
        return;
      }

      var saveMail = e.target.closest('[data-save-mail]');
      if (saveMail) {
        commit(saveMail, Store.saveSettings(collect(['mailProvider','mailTo','mailKey'])), 'Настройки почты сохранены');
        return;
      }

      var savePw = e.target.closest('[data-save-password]');
      if (savePw) {
        var current = String(val('pwCurrent'));
        var next = String(val('pwNext'));
        if (next.length < 6) { UI.toast('Новый пароль короче шести знаков', 'warn'); return; }
        savePw.disabled = true;
        savePw.textContent = 'Меняем…';
        Store.changePassword(current, next).then(function (res) {
          savePw.disabled = false;
          savePw.textContent = 'Сменить пароль';
          if (!res.ok) { UI.toast(res.message || 'Не удалось сменить пароль', 'warn'); return; }
          UI.toast('Пароль изменён. Запишите его — восстановить его нельзя.');
          render();
        });
        return;
      }

      var test = e.target.closest('[data-test-mail]');
      if (test) {
        test.disabled = true;
        test.textContent = 'Отправляем…';

        /* Сначала дожидаемся сохранения — Mail.send читает настройки из Store,
           и без этого проверялись бы прежние, а не только что введённые. */
        Store.saveSettings(collect(['mailProvider','mailTo','mailKey'])).then(function (saved) {
          if (!saved.ok) throw new Error(saved.message || 'Не удалось сохранить настройки почты');
          return Mail.send({
            siteName: Store.settings().siteName,
            name: 'Проверка связи',
            contact: Store.settings().email || 'проверка',
            delivery: 'Самовывоз из мастерской',
            comment: 'Это пробное письмо из админ-панели. Если оно дошло — отправка заказов настроена.',
            items: [{ title: 'Пробный товар', size: 'M', qty: 1, price: 1000 }],
            total: 1000
          });
        }).then(function (res) {
          UI.toast(res.ok ? 'Письмо ушло — проверьте почту (и папку «Спам»)' : res.message, res.ok ? '' : 'warn');
        }).catch(function (err) {
          UI.toast(err.message, 'warn');
        }).then(function () {
          test.disabled = false;
          test.textContent = 'Отправить пробное письмо';
        });
      }
    });
  }

  /* ================= Данные ================= */

  function sectionData(main) {
    var st = stats || {};

    main.innerHTML =
      head('Данные', 'Наполнение сайта лежит в базе на сервере. Выгрузка нужна для переноса и как страховка.') +

      '<div class="panel"><div class="panel__head"><h3>Сколько всего накопилось</h3></div><div class="panel__body">' +
        '<div class="stats" style="margin-bottom:0">' +
          statTile('База данных', kb(st.dbBytes)) +
          statTile('Фотографии', kb(st.uploadBytes) + ' · ' + (st.uploadCount || 0) + ' шт') +
          statTile('Товаров', st.products || 0) +
          statTile('Заявок', (st.requests || 0) + (st.newRequests ? ' (новых ' + st.newRequests + ')' : '')) +
        '</div>' +
        '<div class="hint-box" style="margin-top:20px">' +
          'Сервер сам делает копию базы раз в сутки и хранит две недели — в папке ' +
          '<code>server/backups</code>. Это защита от случайного удаления, но не от потери всего сервера: ' +
          'выгружайте файл время от времени и держите его у себя.' +
        '</div>' +
      '</div></div>' +

      '<div class="panel"><div class="panel__head"><h3>Перенос и страховка</h3></div><div class="panel__body">' +
        '<p class="muted" style="font-size:0.9rem;margin-top:0">Выгрузка — один JSON со всем наполнением ' +
        'и заявками. Фотографии в него не входят: они лежат файлами в папке <code>uploads</code>, ' +
        'её копируют отдельно.</p>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">' +
          '<a class="btn btn--primary" id="export" href="' + Store.exportURL() + '" download>Выгрузить файл</a>' +
          '<button class="btn btn--ghost" id="import">Загрузить из файла</button>' +
          '<button class="btn btn--quiet" id="reset">Вернуть демо-наполнение</button>' +
        '</div>' +
        '<input type="file" id="import-file" accept="application/json,.json" hidden>' +
      '</div></div>' +

      '<div class="panel"><div class="panel__head"><h3>Неиспользуемые фотографии</h3></div><div class="panel__body">' +
        '<p class="muted" style="font-size:0.9rem;margin-top:0">' +
        (st.unusedCount
          ? 'Нашлось <strong>' + st.unusedCount + '</strong> ' +
            UI.plural(st.unusedCount, ['файл', 'файла', 'файлов']) +
            ', на которые больше не ссылается ни один товар, баннер или страница. ' +
            'Обычно это снимки, которые заменили другими.'
          : 'Все загруженные снимки где-то используются — чистить нечего.') +
        '</p>' +
        (st.unusedCount
          ? '<div style="margin-top:16px"><button class="btn btn--quiet" id="cleanup">Удалить лишние файлы</button></div>'
          : '') +
      '</div></div>';

    document.getElementById('import').addEventListener('click', function () {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        confirmAction('Заменить наполнение?',
          'Товары, категории, баннеры, страницы и заявки на сайте будут заменены содержимым файла. ' +
          'Отменить это нельзя — если сомневаетесь, сначала выгрузите нынешнее наполнение.',
          'Да, заменить', function () {
          Store.importJSON(reader.result).then(function (res) {
            if (!res.ok) { UI.toast(res.message, 'warn'); return; }
            UI.toast('Наполнение загружено');
            refreshStats().then(render);
          });
        });
      };
      reader.readAsText(f);
    });

    document.getElementById('reset').addEventListener('click', function () {
      confirmAction('Вернуть демо-наполнение?',
        'Все ваши товары, категории, баннеры, тексты страниц и все заявки будут удалены, ' +
        'а на их место встанет демонстрационный набор. Вернуть их будет нельзя.',
        'Да, вернуть демо', function () {
        Store.reset().then(function (res) {
          if (!res.ok) { UI.toast(res.message, 'warn'); return; }
          UI.toast('Вернули демо-наполнение');
          refreshStats().then(render);
        });
      });
    });

    var cleanup = document.getElementById('cleanup');
    if (cleanup) cleanup.addEventListener('click', function () {
      confirmDelete(st.unusedCount + ' ' + UI.plural(st.unusedCount, ['файл', 'файла', 'файлов']) +
        ' без ссылок', function () {
        cleanup.disabled = true;
        Store.cleanup().then(function (res) {
          if (!res.ok) { cleanup.disabled = false; UI.toast(res.message, 'warn'); return; }
          UI.toast('Удалено файлов: ' + res.removed);
          refreshStats().then(render);
        });
      });
    });
  }

  function statTile(label, value) {
    return '<div class="stat"><div class="stat__n stat__n--small">' + esc(String(value)) + '</div>' +
      '<div class="stat__l">' + esc(label) + '</div></div>';
  }

  function refreshStats() {
    return Store.stats().then(function (res) {
      if (res.ok) stats = res.stats;
      return res;
    });
  }

  /* ================= Роутер ================= */

  var RENDERERS = {
    dashboard: sectionDashboard,
    products: sectionProducts,
    categories: sectionCategories,
    banners: sectionBanners,
    pages: sectionPages,
    requests: sectionRequests,
    settings: sectionSettings,
    data: sectionData
  };

  /* Размер базы и папки с фото нужен только в «Обзоре» и «Данных».
     Тянем его с сервера при заходе в раздел и перерисовываем, когда придёт. */
  var STATS_SECTIONS = { dashboard: true, data: true };
  var statsAt = 0;

  function render() {
    if (!Store.isAdmin()) { renderLogin(); return; }
    renderShell();
    var main = document.getElementById('admin-main');
    (RENDERERS[view.section] || sectionDashboard)(main);
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (STATS_SECTIONS[view.section] && Date.now() - statsAt > 10000) {
      statsAt = Date.now();
      refreshStats().then(render);
    }
  }

  /* Пока сервер отвечает, кто мы такие, показываем не пустой экран */
  app.innerHTML = '<div class="login-wrap"><div class="login-card">' +
    UI.cloverSVG('logo__mark') + '<p class="muted" style="font-size:0.9rem">Загружаем панель…</p>' +
    '</div></div>';

  Store.boot().then(render);
})();
