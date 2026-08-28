/* Клевер — общий слой интерфейса: шапка, подвал, модалки, плейсхолдеры, текст */

window.UI = (function () {

  /* ---------- Клевер-трилистник ---------- */

  /* Трилистник: три круга и стебель */
  function cloverSVG(cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 100 100" fill="none" aria-hidden="true">' +
      '<circle cx="50" cy="31" r="15" fill="currentColor" opacity="0.9"/>' +
      '<circle cx="33.5" cy="52" r="15" fill="currentColor" opacity="0.72"/>' +
      '<circle cx="66.5" cy="52" r="15" fill="currentColor" opacity="0.72"/>' +
      '<path d="M50 58c0 12-3 22-11 31" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>' +
      '</svg>';
  }

  var CLOVER_MASK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='31' r='15' fill='%23000'/%3E%3Ccircle cx='33.5' cy='52' r='15' fill='%23000'/%3E%3Ccircle cx='66.5' cy='52' r='15' fill='%23000'/%3E%3Cpath d='M50 58c0 12-3 22-11 31' stroke='%23000' stroke-width='3.4' stroke-linecap='round'/%3E%3C/svg%3E\")";

  var CARET = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238C8D82' stroke-width='1.2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")";

  /* ---------- Плейсхолдеры ---------- */

  var PALETTE = [
    ['#EDF2EA', '#C7D5C2'],
    ['#F7ECE7', '#E9D5CD'],
    ['#EEF3F1', '#D4DEDB'],
    ['#F4EFE5', '#E6DED0'],
    ['#F1F0E6', '#DCDCC4'],
    ['#F3EDF0', '#DFD0D8']
  ];

  function hash(str) {
    var h = 0, s = String(str || 'klever');
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return h;
  }

  function placeholder(seed, w, h) {
    var n = hash(seed);
    var pair = PALETTE[n % PALETTE.length];
    var rot = (n >> 3) % 36 - 18;
    /* Клевер держим ближе к центру: картинка обрезается под разные пропорции */
    var cx = 44 + ((n >> 5) % 13);
    var cy = 45 + ((n >> 7) % 11);
    var scale = 0.58 + (((n >> 9) % 22) / 100);
    w = w || 800; h = h || 1000;

    var lines = '';
    for (var i = 0; i < 7; i++) {
      var y = 8 + i * 13 + ((n >> (i + 2)) % 6);
      lines += '<path d="M-5 ' + y + ' Q 50 ' + (y + 3.5) + ' 105 ' + (y - 1) + '" stroke="' + pair[1] +
               '" stroke-width="0.22" fill="none" opacity="0.55"/>';
    }

    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" width="' + w + '" height="' + h + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + pair[0] + '"/><stop offset="1" stop-color="' + pair[1] + '"/>' +
      '</linearGradient></defs>' +
      '<rect width="100" height="100" fill="url(#g)"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (34 * scale).toFixed(1) + '" fill="' + pair[1] + '" opacity="0.45"/>' +
      lines +
      '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + rot + ') scale(' + scale.toFixed(2) + ') translate(-50 -50)" fill="#FFFFFF" opacity="0.62">' +
      '<circle cx="50" cy="31" r="15"/><circle cx="33.5" cy="52" r="15"/><circle cx="66.5" cy="52" r="15"/>' +
      '<path d="M50 58c0 12-3 22-11 31" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" fill="none"/>' +
      '</g></svg>';

    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function imageOf(item, index) {
    var imgs = (item && item.images) || [];
    var i = index || 0;
    if (imgs[i]) return imgs[i];
    if (item && item.cover) return item.cover;
    if (item && item.image) return item.image;
    return placeholder((item && (item.slug || item.id || item.title)) || 'klever');
  }

  /* ---------- Форматирование ---------- */

  function price(v) {
    if (!v && v !== 0) return '';
    return new Intl.NumberFormat('ru-RU').format(v) + ' ₽';
  }

  var MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  function dateRu(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function plural(n, forms) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ВКонтакте в настройках можно записать как угодно — «club163698701»,
     «vk.com/club…» или полной ссылкой. Приводим к одному виду, чтобы
     не приходилось помнить правильный формат. */
  function vkName(value) {
    return String(value || '').trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^(www\.)?vk\.(com|ru)\//i, '')
      .replace(/\/+$/, '');
  }
  function vkUrl(value) {
    var name = vkName(value);
    return name ? 'https://vk.com/' + name : '';
  }
  /* Диалог с сообществом: у ВК свой адрес для сообщений */
  function vkMessageUrl(value) {
    var name = vkName(value);
    return name ? 'https://vk.me/' + name : '';
  }

  /* Мини-разметка для статей и страниц: ## заголовки, - списки, > цитата, **жирный** */
  function markup(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [], list = null, para = [];

    function flushPara() {
      if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
    }
    function flushList() {
      if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; }
    }
    function inline(s) {
      return esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        /* Ссылка на чужой сайт открывается в новой вкладке: увести человека
           со страницы товара на карты — не то, чего он ждёт от текста. */
        .replace(/\[(.+?)\]\((.+?)\)/g, function (all, text, href) {
          var external = /^https?:\/\//i.test(href);
          return '<a href="' + href + '"' +
            (external ? ' target="_blank" rel="noopener"' : '') + '>' + text + '</a>';
        });
    }

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) { flushPara(); flushList(); return; }
      if (/^###\s+/.test(line)) { flushPara(); flushList(); out.push('<h3>' + inline(line.replace(/^###\s+/, '')) + '</h3>'); return; }
      if (/^##\s+/.test(line))  { flushPara(); flushList(); out.push('<h2>' + inline(line.replace(/^##\s+/, '')) + '</h2>'); return; }
      if (/^>\s?/.test(line))   { flushPara(); flushList(); out.push('<blockquote>' + inline(line.replace(/^>\s?/, '')) + '</blockquote>'); return; }
      if (/^[-•]\s+/.test(line)) { flushPara(); list = list || []; list.push('<li>' + inline(line.replace(/^[-•]\s+/, '')) + '</li>'); return; }
      flushList();
      para.push(line);
    });
    flushPara(); flushList();
    return out.join('\n');
  }

  /* ---------- Согласие на обработку данных ----------
     Галочка не отмечена заранее: преотмеченная не считается согласием,
     потому что человек ничего не выбирал. */

  function consentField(id) {
    return '<label class="consent" for="' + id + '">' +
      '<input type="checkbox" id="' + id + '">' +
      '<span>Согласен на обработку персональных данных и с ' +
      '<a href="' + Routes.page('privacy') + '" target="_blank" rel="noopener">политикой конфиденциальности</a></span>' +
      '</label>';
  }

  /* Возвращает true, если галочка стоит. Иначе подсвечивает её и объясняет. */
  function consentGiven(root, id) {
    var box = (root || document).querySelector('#' + id);
    if (!box) return true;
    var wrap = box.closest('.consent');
    var old = wrap.parentNode.querySelector('.consent__error');
    if (old) old.remove();
    wrap.classList.remove('consent--error');
    if (box.checked) return true;

    wrap.classList.add('consent--error');
    var d = document.createElement('div');
    d.className = 'field__error consent__error';
    d.textContent = 'Без согласия мы не можем принять заявку';
    wrap.parentNode.insertBefore(d, wrap.nextSibling);
    return false;
  }

  /* ---------- Шапка и подвал ---------- */

  var NAV = [
    { href: Routes.catalog(),     label: 'Каталог' },
    { href: Routes.page('about'), label: 'О мастерской' },
    { href: Routes.contacts(),    label: 'Контакты' }
  ];

  /* Какой раздел открыт сейчас. Адреса больше не имена файлов, поэтому
     сравниваем разделы: карточка товара подсвечивает «Каталог». */
  function currentSection() {
    var r = Routes.parse(location.pathname);
    if (!r) return '';
    if (r.type === 'product' || r.type === 'catalog') return Routes.catalog();
    if (r.type === 'contacts') return Routes.contacts();
    if (r.type === 'page') return Routes.page(r.page);
    return Routes.home();
  }

  function renderHeader() {
    var host = document.getElementById('site-header');
    if (!host) return;
    var s = Store.settings();
    var here = currentSection();

    var links = NAV.map(function (n) {
      var active = n.href === here;
      return '<a href="' + n.href + '"' + (active ? ' class="is-active"' : '') + '>' + esc(n.label) + '</a>';
    }).join('');

    host.className = 'site-header';
    host.innerHTML =
      '<div class="container site-header__inner">' +
        '<a class="logo" href="' + Routes.home() + '" aria-label="' + esc(s.siteName) + ' — на главную">' +
          cloverSVG('logo__mark') +
          '<span class="logo__text"><span class="logo__name">' + esc(s.siteName) + '</span>' +
          '<span class="logo__tag">' + esc(s.tagline) + '</span></span>' +
        '</a>' +
        '<nav class="nav" id="main-nav">' + links + '</nav>' +
        '<div class="header__actions">' +
          '<button class="cart-btn" id="cart-btn" aria-label="Корзина">' + bagSVG() +
            '<span class="cart-btn__label">Корзина</span>' +
            '<span class="cart-btn__n" id="cart-count" hidden></span>' +
          '</button>' +
          '<button class="burger" id="burger" aria-label="Меню" aria-expanded="false"><span></span></button>' +
        '</div>' +
      '</div>';

    document.getElementById('cart-btn').addEventListener('click', openCart);
    updateCartBadge();

    var burger = document.getElementById('burger');
    var nav = document.getElementById('main-nav');
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
    });

    var onScroll = function () { host.classList.toggle('is-stuck', window.scrollY > 12); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function renderFooter() {
    var host = document.getElementById('site-footer');
    if (!host) return;
    var s = Store.settings();
    var cats = Store.categories().slice(0, 5).map(function (c) {
      return '<li><a href="' + esc(Routes.catalog(c.slug)) + '">' + esc(c.title) + '</a></li>';
    }).join('');

    host.className = 'site-footer';
    host.innerHTML =
      '<div class="site-footer__watermark">' + cloverSVG('') + '</div>' +
      '<div class="container">' +
        '<div class="footer-grid">' +
          '<div class="footer-col">' +
            '<a class="logo" href="' + Routes.home() + '">' + cloverSVG('logo__mark') +
              '<span class="logo__text"><span class="logo__name">' + esc(s.siteName) + '</span>' +
              '<span class="logo__tag">' + esc(s.tagline) + '</span></span></a>' +
            '<p class="footer-note" style="margin-top:16px">' + esc(s.slogan) + '</p>' +
          '</div>' +
          '<div class="footer-col"><h4>Каталог</h4><ul>' + cats + '</ul></div>' +
          '<div class="footer-col"><h4>Покупателю</h4><ul>' +
            '<li><a href="' + Routes.page('delivery') + '">Доставка и оплата</a></li>' +
            '<li><a href="' + Routes.page('care') + '">Уход за изделиями</a></li>' +
            '<li><a href="' + Routes.page('about') + '">О мастерской</a></li>' +
            '<li><a href="' + Routes.page('terms') + '">Условия продажи и возврата</a></li>' +
          '</ul></div>' +
          '<div class="footer-col"><h4>Связь</h4><ul>' +
            '<li><a href="tel:' + esc(String(s.phone).replace(/[^\d+]/g, '')) + '">' + esc(s.phone) + '</a></li>' +
            '<li><a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a></li>' +
            (s.vk ? '<li><a href="' + esc(vkUrl(s.vk)) + '" target="_blank" rel="noopener">ВКонтакте</a></li>' : '') +
            (s.telegram ? '<li><a href="https://t.me/' + esc(s.telegram) + '" target="_blank" rel="noopener">Telegram</a></li>' : '') +
            (s.instagram ? '<li><a href="https://instagram.com/' + esc(s.instagram) + '" target="_blank" rel="noopener">Instagram</a></li>' : '') +
          '</ul></div>' +
        '</div>' +
        '<div class="footer-bottom">' +
          '<span>© ' + new Date().getFullYear() + ' ' + esc(s.siteName) + ' — сшито руками</span>' +
          /* Реквизиты продавца покупатель должен видеть с любой страницы */
          (s.legal ? '<span>' + esc(s.legal) + '</span>' : '') +
          '<span>' + esc(s.address) + '</span>' +
          '<a href="' + Routes.page('privacy') + '">Политика конфиденциальности</a>' +
        '</div>' +
      '</div>';
  }

  /* ---------- Появление при скролле ---------- */

  function reveal(root) {
    var nodes = (root || document).querySelectorAll('.reveal:not(.is-visible)');
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(function (n) { n.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    nodes.forEach(function (n, i) {
      n.style.transitionDelay = Math.min(i % 6, 5) * 60 + 'ms';
      io.observe(n);
    });
  }

  /* ---------- Тосты ---------- */

  function toast(message, kind) {
    var host = document.querySelector('.toasts');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toasts';
      document.body.appendChild(host);
    }
    var el = document.createElement('div');
    el.className = 'toast' + (kind === 'warn' ? ' toast--warn' : '');
    el.textContent = message;
    host.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 350);
    }, 3600);
  }

  /* ---------- Модалка ---------- */

  /* onClose вызывается при любом закрытии — крестиком, Escape или кликом мимо.
     Без него нельзя узнать, что человек передумал, а не просто ничего не выбрал. */
  function modal(html, onClose) {
    var back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { back.classList.add('is-open'); });

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      back.classList.remove('is-open');
      document.body.style.overflow = '';
      setTimeout(function () { back.remove(); }, 380);
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    back.addEventListener('click', function (e) {
      if (e.target === back || e.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', onKey);

    var first = back.querySelector('input, textarea, button');
    if (first) setTimeout(function () { first.focus(); }, 120);

    return { el: back, close: close };
  }

  /* ---------- Свайп ----------
     Пальцем на телефоне и перетаскиванием мышью на десктопе.
     handler получает 'left' (следующий) или 'right' (предыдущий). */

  var SWIPE_MIN = 40;

  function swipe(el, handler) {
    if (!el) return;
    var x0 = null, y0 = null, t0 = 0, dragging = false;

    function start(x, y) { x0 = x; y0 = y; t0 = Date.now(); }

    function finish(x, y) {
      if (x0 === null) return;
      var dx = x - x0, dy = y - y0;
      x0 = null;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dy) > Math.abs(dx)) return;
      if (Date.now() - t0 > 900) return;
      el.dataset.swipedAt = Date.now();
      handler(dx < 0 ? 'left' : 'right');
    }

    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      start(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    el.addEventListener('touchmove', function (e) {
      if (x0 === null || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
      /* Горизонтальный жест забираем себе, вертикальный оставляем прокрутке */
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) && e.cancelable) e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchend', function (e) {
      finish(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    });

    el.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      dragging = true;
      start(e.clientX, e.clientY);
    });

    el.addEventListener('mouseup', function (e) {
      if (!dragging) return;
      dragging = false;
      finish(e.clientX, e.clientY);
    });

    el.addEventListener('mouseleave', function () { dragging = false; x0 = null; });
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  /* Свайп внутри ссылки: не даём перейти по ней, если это был жест */
  function swipeGuard(el) {
    el.addEventListener('click', function (e) {
      var at = +(el.dataset.swipedAt || 0);
      if (Date.now() - at < 400) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  /* Листалка фото: набор картинок, точки под ними */
  function bindPhotoSwipe(box, images, opts) {
    opts = opts || {};
    if (!box || images.length < 2) return null;
    var i = 0;
    var img = box.querySelector('img');
    var dots = opts.dots || null;

    function paint() {
      img.src = images[i];
      if (dots) {
        dots.querySelectorAll('button').forEach(function (d, n) {
          d.classList.toggle('is-active', n === i);
        });
      }
      if (opts.onChange) opts.onChange(i);
    }

    if (dots) {
      dots.innerHTML = images.map(function (_, n) {
        return '<button class="photo-dot' + (n === 0 ? ' is-active' : '') + '" data-i="' + n + '" aria-label="Фото ' + (n + 1) + '"></button>';
      }).join('');
      dots.addEventListener('click', function (e) {
        var d = e.target.closest('[data-i]');
        if (!d) return;
        e.preventDefault();
        i = +d.dataset.i;
        paint();
      });
    }

    swipe(box, function (dir) {
      i = (i + (dir === 'left' ? 1 : -1) + images.length) % images.length;
      paint();
    });

    return { go: function (n) { i = n; paint(); }, index: function () { return i; } };
  }

  /* ---------- Корзина ---------- */

  function bagSVG() {
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M4 8h16l-1.2 12H5.2L4 8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M8.6 8V6.4a3.4 3.4 0 016.8 0V8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
      '</svg>';
  }

  function checkSVG() {
    return '<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">' +
      '<circle cx="24" cy="24" r="21" stroke="currentColor" stroke-width="1.6" opacity="0.4"/>' +
      '<path d="M15 24.5l6.5 6.5L33 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  }

  function updateCartBadge(bump) {
    var el = document.getElementById('cart-count');
    if (!el) return;
    var n = Cart.count();
    el.textContent = n || '';
    el.hidden = !n;
    if (bump) {
      var btn = document.getElementById('cart-btn');
      btn.classList.remove('is-bumped');
      void btn.offsetWidth;
      btn.classList.add('is-bumped');
    }
  }

  function addToCart(product, size, qty) {
    Cart.add(product, size, qty);
    updateCartBadge(true);
    toast('«' + product.title + '» в корзине');
  }

  var drawerRef = null;

  function openCart() {
    if (drawerRef) return;

    var back = document.createElement('div');
    back.className = 'drawer-backdrop';
    var panel = document.createElement('aside');
    panel.className = 'drawer';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Корзина');
    document.body.appendChild(back);
    document.body.appendChild(panel);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(function () {
      back.classList.add('is-open');
      panel.classList.add('is-open');
    });

    function close() {
      back.classList.remove('is-open');
      panel.classList.remove('is-open');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { back.remove(); panel.remove(); }, 440);
      drawerRef = null;
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    back.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) close();
    });

    drawerRef = { panel: panel, close: close };
    renderCartView();
  }

  function drawerShell(title, body, foot) {
    return '<div class="drawer__head"><h3>' + esc(title) + '</h3>' +
      '<button class="modal__close" data-close aria-label="Закрыть" style="position:static">✕</button></div>' +
      '<div class="drawer__body">' + body + '</div>' +
      (foot ? '<div class="drawer__foot">' + foot + '</div>' : '');
  }

  function renderCartView() {
    if (!drawerRef) return;
    var items = Cart.items();
    var panel = drawerRef.panel;

    if (!items.length) {
      panel.innerHTML = drawerShell('Корзина',
        '<div class="empty-state">' + cloverSVG('') +
        '<p>Пока пусто. Выберите что-нибудь — соберём заказ и отправим его нам одним письмом.</p>' +
        '<a class="btn btn--ghost btn--sm" href="' + Routes.catalog() + '">В каталог</a></div>');
      return;
    }

    var lines = items.map(function (i) {
      return '<div class="cart-line">' +
        '<img class="cart-line__img" src="' + imageOf(i.product || {}) + '" alt="">' +
        '<div>' +
          '<div class="cart-line__title">' + esc(i.title) + '</div>' +
          '<div class="cart-line__meta">' + (i.size ? 'Размер ' + esc(i.size) + ' · ' : '') + price(i.price) + '</div>' +
          '<div class="stepper">' +
            '<button data-minus="' + esc(i.key) + '" aria-label="Меньше">−</button>' +
            '<span>' + i.qty + '</span>' +
            '<button data-plus="' + esc(i.key) + '" aria-label="Больше">+</button>' +
          '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<button class="cart-line__x" data-remove="' + esc(i.key) + '" aria-label="Убрать">✕</button>' +
          '<div class="cart-line__price">' + price(i.price * i.qty) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    panel.innerHTML = drawerShell('Корзина', lines,
      '<div class="cart-total"><span>Итого</span><strong>' + price(Cart.total()) + '</strong></div>' +
      '<button class="btn btn--primary btn--wide" data-checkout>Оформить заказ</button>' +
      '<div class="send-note">Оплата не онлайн: мы получим заказ и напишем вам, чтобы подтвердить детали.</div>');

    panel.querySelector('.drawer__body').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var item;
      if (b.dataset.plus) {
        item = Cart.items().filter(function (x) { return x.key === b.dataset.plus; })[0];
        Cart.setQty(b.dataset.plus, item.qty + 1);
      } else if (b.dataset.minus) {
        item = Cart.items().filter(function (x) { return x.key === b.dataset.minus; })[0];
        if (item.qty <= 1) Cart.remove(b.dataset.minus);
        else Cart.setQty(b.dataset.minus, item.qty - 1);
      } else if (b.dataset.remove) {
        Cart.remove(b.dataset.remove);
      } else return;
      updateCartBadge();
      renderCartView();
    });

    panel.querySelector('[data-checkout]').addEventListener('click', function () {
      renderCheckoutView(Cart.items(), Cart.total(), true);
    });
  }

  /* Форма оформления — общая для корзины и для быстрого заказа одной вещи.
     Товар можно вычеркнуть крестиком; пять секунд его ещё можно вернуть. */
  var UNDO_MS = 5000;

  function renderCheckoutView(rawItems, total, fromCart) {
    if (!drawerRef) return;
    var panel = drawerRef.panel;

    /* Своя копия: правки в списке не трогают корзину, пока не истечёт возврат */
    var items = rawItems.map(function (i) {
      return { data: i, struck: false, gone: false, left: 0, timer: null, tick: null };
    });

    function active() {
      return items.filter(function (r) { return !r.struck && !r.gone; }).map(function (r) { return r.data; });
    }
    function sum() {
      return active().reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    }

    function strike(row) {
      row.struck = true;
      row.left = Math.round(UNDO_MS / 1000);
      row.tick = setInterval(function () {
        row.left--;
        var el = panel.querySelector('[data-undo="' + row.data.key + '"]');
        if (el) el.textContent = 'Вернуть · ' + row.left;
      }, 1000);
      row.timer = setTimeout(function () {
        clearInterval(row.tick);
        row.gone = true;
        /* Теперь убираем и из самой корзины */
        if (fromCart && row.data.key) { Cart.remove(row.data.key); updateCartBadge(); }
        paintList();
      }, UNDO_MS);
      paintList();
    }

    function undo(row) {
      clearTimeout(row.timer);
      clearInterval(row.tick);
      row.struck = false;
      paintList();
    }

    function paintList() {
      var host = panel.querySelector('#ch-list');
      if (!host) return;

      host.innerHTML = items.filter(function (r) { return !r.gone; }).map(function (r) {
        var i = r.data;
        var name = esc(i.title) + (i.size ? ' · ' + esc(i.size) : '') + (i.qty > 1 ? ' · ' + i.qty + ' шт' : '');
        if (r.struck) {
          return '<div class="spec spec--struck">' +
            '<dt>' + name + '</dt>' +
            '<dd><button class="undo-btn" data-undo="' + esc(i.key || i.id) + '">Вернуть · ' + r.left + '</button></dd>' +
          '</div>';
        }
        return '<div class="spec">' +
          '<dt>' + name + '</dt>' +
          '<dd class="spec__right">' + price(i.price * i.qty) +
            '<button class="spec__x" data-strike="' + esc(i.key || i.id) + '" aria-label="Убрать из заказа">✕</button>' +
          '</dd>' +
        '</div>';
      }).join('');

      var t = panel.querySelector('#ch-total');
      if (t) t.textContent = price(sum());

      var submit = panel.querySelector('#ch-submit');
      if (submit) {
        var empty = active().length === 0;
        submit.disabled = empty;
        submit.textContent = empty ? 'Нечего заказывать' : 'Отправить заказ';
      }
    }

    var list = '<dl class="specs" id="ch-list" style="margin-top:0"></dl>';

    panel.innerHTML = drawerShell('Оформление',
      list +
      '<form id="checkout-form" novalidate>' +
        '<div class="field"><label class="field__label" for="ch-name">Как вас зовут</label>' +
          '<input class="input" id="ch-name" name="name" autocomplete="name" placeholder="Анна"></div>' +
        '<div class="field"><label class="field__label" for="ch-contact">Телефон, почта или @телеграм</label>' +
          '<input class="input" id="ch-contact" name="contact" placeholder="+7 900 000-00-00"></div>' +
        '<div class="field"><label class="field__label" for="ch-comment">Комментарий</label>' +
          '<textarea class="textarea" id="ch-comment" name="comment" placeholder="Мерки, город, пожелания по цвету"></textarea></div>' +
      '</form>',
      '<div class="cart-total"><span>Итого</span><strong id="ch-total">' + price(total) + '</strong></div>' +
      consentField('ch-consent') +
      '<button class="btn btn--primary btn--wide" id="ch-submit">Отправить заказ</button>' +
      (fromCart ? '<button class="btn btn--quiet btn--wide" data-back-to-cart style="margin-top:8px">← Вернуться к корзине</button>' : ''));

    paintList();

    panel.querySelector('#ch-list').addEventListener('click', function (e) {
      var x = e.target.closest('[data-strike]');
      if (x) {
        var row = items.filter(function (r) { return (r.data.key || r.data.id) === x.dataset.strike; })[0];
        if (row) strike(row);
        return;
      }
      var u = e.target.closest('[data-undo]');
      if (u) {
        var back = items.filter(function (r) { return (r.data.key || r.data.id) === u.dataset.undo; })[0];
        if (back) undo(back);
      }
    });

    var backBtn = panel.querySelector('[data-back-to-cart]');
    if (backBtn) backBtn.addEventListener('click', function () {
      /* Вычеркнутое, но ещё не «дожатое» возвращаем в корзину как было */
      items.forEach(function (r) { clearTimeout(r.timer); clearInterval(r.tick); });
      renderCartView();
    });

    var form = panel.querySelector('#checkout-form');
    var submit = panel.querySelector('#ch-submit');

    submit.addEventListener('click', function () {
      var ok = true;
      ['name', 'contact'].forEach(function (n) {
        var field = form[n].closest('.field');
        field.classList.remove('field--error');
        var old = field.querySelector('.field__error');
        if (old) old.remove();
        if (!form[n].value.trim()) {
          ok = false;
          field.classList.add('field--error');
          var d = document.createElement('div');
          d.className = 'field__error';
          d.textContent = 'Без этого мы не сможем ответить';
          field.appendChild(d);
        }
      });
      if (!consentGiven(panel, 'ch-consent')) ok = false;
      if (!ok) return;

      /* Что осталось после вычёркиваний */
      var picked = active();
      var pickedTotal = sum();
      if (!picked.length) return;

      submit.disabled = true;
      submit.textContent = 'Отправляем…';

      /* Всё вычеркнутое убираем из корзины окончательно */
      items.forEach(function (r) {
        clearTimeout(r.timer);
        clearInterval(r.tick);
        if ((r.struck || r.gone) && fromCart && r.data.key) Cart.remove(r.data.key);
      });

      /* Способ доставки не спрашиваем: город, сроки и оплату всё равно
         обсуждают в переписке, а лишний список в форме только задерживает
         человека на полпути к отправке. Что важно — он напишет сам
         в комментарии. */
      var order = {
        siteName: Store.settings().siteName,
        name: form.name.value.trim(),
        contact: form.contact.value.trim(),
        comment: form.comment.value.trim(),
        items: picked,
        total: pickedTotal
      };

      /* Заказ пишем в базу мастерской и параллельно шлём письмо.
         Письмо может не дойти — заказ от этого не потеряется. */
      var saving = Store.addRequest({
        productId: picked.length === 1 ? picked[0].id : '',
        productTitle: Mail.buildSummary(order),
        name: order.name,
        contact: order.contact,
        size: picked.length === 1 ? picked[0].size : '',
        comment: order.comment,
        items: picked.map(function (i) {
          return { title: i.title, size: i.size, qty: i.qty, price: i.price };
        }),
        total: pickedTotal
      });

      Promise.all([saving, Mail.send(order)]).then(function (out) {
        var saved = out[0], res = out[1];
        if (fromCart) { Cart.clear(); updateCartBadge(); }
        renderResultView(order, res, saved);
      });
    });
  }

  function renderResultView(order, res, saved) {
    if (!drawerRef) return;
    var s = Store.settings();
    var link = Mail.messengerLink(order);

    var inBase = !!(saved && saved.ok);
    var messenger = (link ? '<a class="btn btn--primary" target="_blank" rel="noopener" href="' +
        esc(link.href) + '">' + esc(link.label) + '</a>' : '') +
      /* ВКонтакте открывает пустой диалог — без этой кнопки покупателю
         пришлось бы перепечатывать состав заказа руками. */
      (link && link.needsCopy
        ? '<button class="btn btn--ghost" data-copy-order>Скопировать текст заказа</button>' : '') +
      (s.phone ? '<div class="send-note">Или позвоните: ' + esc(s.phone) + '</div>' : '');

    var body;
    if (inBase && res.ok) {
      /* Долетело обоими путями — покупателю не о чем беспокоиться */
      body = '<div class="order-ok">' + checkSVG() +
        '<h3>Заказ отправлен</h3>' +
        '<p class="muted">Заказ у мастерской, письмо тоже ушло. Мы напишем вам на «' + esc(order.contact) +
        '» в течение дня, чтобы подтвердить детали и сроки.</p></div>';
    } else if (inBase) {
      /* Главное сделано: заказ лежит в базе. Письмо — приятное дополнение */
      body = '<div class="order-ok">' + checkSVG() +
        '<h3>Заказ принят</h3>' +
        '<p class="muted">Заказ записан в мастерской, мы его увидим. ' +
        (res.skipped
          ? 'Дублирующее письмо не настроено — если хочется быстрее, напишите нам ещё и в мессенджер.'
          : 'Письмо-дубль отправить не удалось (' + esc(res.message) + '), но на сам заказ это не влияет.') +
        '</p>' + messenger + '</div>';
    } else if (res.ok) {
      /* База не ответила, зато письмо ушло — заказ у мастерской всё равно есть */
      body = '<div class="order-ok">' + checkSVG() +
        '<h3>Заказ отправлен письмом</h3>' +
        '<p class="muted">Записать заказ на сайте не получилось, но письмо в мастерскую ушло — мы его увидим. ' +
        'Мы свяжемся с вами на «' + esc(order.contact) + '».</p></div>';
    } else {
      /* Оба пути отвалились — честно говорим и даём готовый текст в мессенджер */
      body = '<div class="order-ok">' + cloverSVG('') +
        '<h3>Заказ не дошёл</h3>' +
        '<p class="muted">Ни записать заказ, ни отправить письмо не получилось: ' +
        esc((saved && saved.message) || res.message || 'нет связи с сервером') +
        '. Отправьте заказ в мессенджер — текст уже готов, ничего набирать не нужно.</p>' +
        messenger + '</div>';
    }

    var title = inBase || res.ok ? 'Спасибо' : 'Не получилось';
    drawerRef.panel.innerHTML = drawerShell(title, body,
      '<button class="btn btn--ghost btn--wide" data-close>Закрыть</button>');

    var copyBtn = drawerRef.panel.querySelector('[data-copy-order]');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var text = Mail.buildText(order);
      var done = function () {
        copyBtn.textContent = 'Текст скопирован';
        copyBtn.disabled = true;
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
      } else {
        fallbackCopy(text, done);
      }
    });
  }

  /* Запасной способ для браузеров без буфера обмена или без HTTPS */
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { toast('Не удалось скопировать — выделите текст вручную', 'warn'); }
    document.body.removeChild(ta);
  }

  /* ---------- Тайный вход в админку ----------
     Пять быстрых нажатий на логотип. Обычный клик работает как раньше,
     просто с паузой в четверть секунды — за неё мы понимаем, что клик один. */

  var SECRET_CLICKS = 5;
  var SECRET_GAP = 450;

  function bindSecretAdmin() {
    var taps = 0;
    var timer = null;

    document.addEventListener('click', function (e) {
      var logo = e.target.closest('.logo');
      if (!logo) return;
      /* Не мешаем открыть в новой вкладке и не трогаем среднюю кнопку мыши */
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

      e.preventDefault();
      taps++;

      var mark = logo.querySelector('.logo__mark');
      if (mark) {
        mark.style.transition = 'transform 0.35s var(--ease)';
        mark.style.transform = taps >= 3 ? 'rotate(' + (taps - 2) * 12 + 'deg) scale(1.06)' : '';
      }

      if (taps >= SECRET_CLICKS) {
        clearTimeout(timer);
        taps = 0;
        location.href = 'admin.html';
        return;
      }

      clearTimeout(timer);
      timer = setTimeout(function () {
        taps = 0;
        if (mark) mark.style.transform = '';
        location.href = logo.getAttribute('href') || Routes.home();
      }, SECRET_GAP);
    });
  }

  /* ---------- Форма заявки ---------- */

  function orderModal(product) {
    var s = Store.settings();
    var sizes = (product && product.sizes) || [];
    var sizeField = sizes.length
      ? '<div class="field"><label class="field__label" for="o-size">Размер</label>' +
        '<select class="input select" id="o-size">' +
        sizes.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') +
        '<option>Не знаю, нужна помощь</option></select></div>'
      : '';

    var head = product
      ? '<div class="order-product"><img src="' + imageOf(product) + '" alt="">' +
        '<div><strong>' + esc(product.title) + '</strong><span>' + price(product.price) + ' · ' + esc(product.fabric || '') + '</span></div></div>'
      : '';

    var m = modal(
      '<div class="modal__head">' +
        '<button class="modal__close" data-close aria-label="Закрыть">✕</button>' +
        '<span class="eyebrow">Заявка</span>' +
        '<h3 style="margin-bottom:6px">' + (product ? 'Хочу эту вещь' : 'Напишите нам') + '</h3>' +
        '<p class="muted" style="font-size:0.9rem;margin:0">Ответим в течение дня и уточним детали. Ничего не списывается автоматически.</p>' +
      '</div>' +
      head +
      '<form id="order-form" novalidate>' +
        '<div class="field"><label class="field__label" for="o-name">Как вас зовут</label>' +
          '<input class="input" id="o-name" name="name" autocomplete="name" placeholder="Анна"></div>' +
        '<div class="field"><label class="field__label" for="o-contact">Телефон, почта или @телеграм</label>' +
          '<input class="input" id="o-contact" name="contact" placeholder="+7 900 000-00-00"></div>' +
        sizeField +
        '<div class="field"><label class="field__label" for="o-comment">Комментарий</label>' +
          '<textarea class="textarea" id="o-comment" name="comment" placeholder="Мерки, пожелания по цвету, срок"></textarea></div>' +
        consentField('o-consent') +
        '<button class="btn btn--primary btn--wide" type="submit">Отправить заявку</button>' +
        '<div class="contact-buttons">' +
          (s.vk ? '<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="' + esc(vkMessageUrl(s.vk)) + '">Написать во ВКонтакте</a>' : '') +
          (s.telegram ? '<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://t.me/' + esc(s.telegram) + '">Написать в Telegram</a>' : '') +
          (s.whatsapp ? '<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(s.whatsapp) + '">WhatsApp</a>' : '') +
        '</div>' +
      '</form>'
    );

    var form = m.el.querySelector('#order-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.name.value.trim();
      var contact = form.contact.value.trim();
      var ok = true;

      [['name', name], ['contact', contact]].forEach(function (pair) {
        var field = form[pair[0]].closest('.field');
        field.classList.remove('field--error');
        var err = field.querySelector('.field__error');
        if (err) err.remove();
        if (!pair[1]) {
          ok = false;
          field.classList.add('field--error');
          var d = document.createElement('div');
          d.className = 'field__error';
          d.textContent = 'Без этого мы не сможем ответить';
          field.appendChild(d);
        }
      });
      if (!consentGiven(m.el, 'o-consent')) ok = false;
      if (!ok) return;

      var submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Отправляем…';

      Store.addRequest({
        productId: product ? product.id : '',
        productTitle: product ? product.title : 'Общий вопрос',
        name: name,
        contact: contact,
        size: form.querySelector('#o-size') ? form.querySelector('#o-size').value : '',
        comment: form.comment.value.trim(),
        source: 'form'
      }).then(function (res) {
        if (res.ok) {
          m.close();
          toast('Заявка отправлена. Мы свяжемся с вами в ближайшее время.');
        } else {
          /* Модалку не закрываем: набранный текст жалко терять,
             можно нажать «Отправить» ещё раз или уйти в мессенджер */
          submit.disabled = false;
          submit.textContent = 'Отправить заявку';
          toast(res.message || 'Не удалось отправить заявку', 'warn');
        }
      });
    });
  }

  /* ---------- Карточки ---------- */

  function productCard(p) {
    var badge = !p.inStock
      ? '<span class="card__badge card__badge--out">Под заказ</span>'
      : (p.oldPrice ? '<span class="card__badge">Особая цена</span>' : '');
    var priceHtml = p.oldPrice
      ? '<s>' + price(p.oldPrice) + '</s>' + price(p.price)
      : price(p.price);
    var many = (p.images || []).length > 1;

    return '<a class="card reveal" href="' + esc(Routes.product(p.slug || p.id)) + '">' +
      /* В списке показываем облегчённую версию, если она есть */
      '<div class="card__media"' + (many ? ' data-photos="' + esc(p.id) + '"' : '') + '>' + badge +
        '<img src="' + (p.thumb || imageOf(p)) + '" alt="' + esc(p.title) + '" loading="lazy">' +
        (many ? '<div class="photo-dots" data-dots></div>' : '') +
      '</div>' +
      '<div>' +
        '<div class="card__title">' + esc(p.title) + '</div>' +
        '<div class="card__meta">' + esc(p.fabric || '') + '</div>' +
      '</div>' +
      '<div class="card__foot"><span class="card__price">' + priceHtml + '</span>' +
        '<span class="link-arrow" style="border:0;padding:0;font-size:0.8rem">Подробнее →</span></div>' +
    '</a>';
  }

  /* Листание фото прямо в карточках каталога — если у товара больше одного снимка */
  function bindCardPhotos(root) {
    (root || document).querySelectorAll('[data-photos]').forEach(function (box) {
      if (box.dataset.bound) return;
      box.dataset.bound = '1';
      var p = Store.product(box.dataset.photos);
      if (!p) return;
      bindPhotoSwipe(box, p.images, { dots: box.querySelector('[data-dots]') });
      swipeGuard(box);
    });
  }

  /* ---------- Инициализация страницы ---------- */

  /* Сервер не отдал наполнение — витрина будет пустой. Молча показывать
     пустой каталог нельзя: посетитель решит, что вещей просто нет. */
  function offlineNotice() {
    var bar = document.createElement('div');
    bar.className = 'offline-bar';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<strong>Сайт временно недоступен.</strong> ' +
      'Мы не смогли загрузить каталог — попробуйте обновить страницу через пару минут. ' +
      'Если нужно срочно, напишите нам в мессенджер.';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function init() {
    document.documentElement.style.setProperty('--clover-mask', CLOVER_MASK);
    document.documentElement.style.setProperty('--caret', CARET);
    if (Store.offline()) offlineNotice();
    renderHeader();
    renderFooter();
    var s = Store.settings();
    if (document.title.indexOf('—') === -1) document.title = document.title + ' — ' + s.siteName;

    /* Размер, выбранный на странице товара */
    function chosenSize(btn) {
      if (btn.dataset.size) return btn.dataset.size;
      var active = document.querySelector('.size-btn.is-active');
      return active ? active.dataset.size : '';
    }

    document.addEventListener('click', function (e) {
      var add = e.target.closest('[data-add]');
      if (add) {
        e.preventDefault();
        var prod = Store.product(add.getAttribute('data-add'));
        if (prod) addToCart(prod, chosenSize(add), 1);
        return;
      }

      var btn = e.target.closest('[data-order]');
      if (!btn) return;
      e.preventDefault();
      var id = btn.getAttribute('data-order');
      var p = id ? Store.product(id) : null;

      /* Быстрый заказ одной вещи — та же форма, что и у корзины, но мимо неё */
      if (p) {
        openCart();
        renderCheckoutView([{
          id: p.id, title: p.title, price: p.price,
          size: chosenSize(btn), qty: 1, product: p
        }], p.price, false);
        return;
      }
      orderModal(null);
    });

    bindSecretAdmin();
    bindCardPhotos();
    reveal();
  }

  return {
    init: init, reveal: reveal, toast: toast, modal: modal, orderModal: orderModal,
    openCart: openCart, addToCart: addToCart, updateCartBadge: updateCartBadge,
    swipe: swipe, swipeGuard: swipeGuard, bindPhotoSwipe: bindPhotoSwipe, bindCardPhotos: bindCardPhotos,
    placeholder: placeholder, imageOf: imageOf, cloverSVG: cloverSVG,
    consentField: consentField, consentGiven: consentGiven,
    vkUrl: vkUrl, vkMessageUrl: vkMessageUrl,
    price: price, dateRu: dateRu, plural: plural, esc: esc, markup: markup,
    productCard: productCard,
    renderFooter: renderFooter
  };
})();
