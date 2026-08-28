/* Клевер — карточка товара */

(function () {
  UI.init();

  var esc = UI.esc;
  /* Адрес вида /tovar/dress-poleva: имя вещи теперь в пути, а не в ?id= */
  var id = (Routes.parse(location.pathname) || {}).slug || '';
  var p = id ? Store.product(id) : null;
  var host = document.getElementById('product');

  if (!p) {
    document.getElementById('crumbs').innerHTML =
      '<a href="' + Routes.home() + '">Главная</a><span>/</span><a href="' + Routes.catalog() + '">Каталог</a>';
    host.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1">' + UI.cloverSVG('') +
      '<h2>Вещь не найдена</h2>' +
      '<p>Возможно, её убрали из каталога.</p>' +
      '<a class="btn btn--ghost" href="' + Routes.catalog() + '">Вернуться в каталог</a></div>';
    return;
  }

  /* Заголовок ставит сервер (см. server/seo.js) — здесь только страховка
     на случай, если страницу открыли в обход него. */
  if (document.title.indexOf(p.title) === -1) {
    document.title = p.title + ' — ' + Store.settings().siteName;
  }

  var cat = Store.category(p.category);
  document.getElementById('crumbs').innerHTML =
    '<a href="' + Routes.home() + '">Главная</a><span>/</span>' +
    '<a href="' + Routes.catalog() + '">Каталог</a><span>/</span>' +
    (cat ? '<a href="' + esc(Routes.catalog(cat.slug)) + '">' + esc(cat.title) + '</a><span>/</span>' : '') +
    '<span>' + esc(p.title) + '</span>';

  /* ---------- Галерея ---------- */

  var images = (p.images && p.images.length) ? p.images.slice() : [
    UI.placeholder(p.slug + '-1'), UI.placeholder(p.slug + '-2'), UI.placeholder(p.slug + '-3')
  ];

  var thumbs = images.length > 1
    ? '<div class="gallery__thumbs">' + images.map(function (src, i) {
        return '<button class="gallery__thumb' + (i === 0 ? ' is-active' : '') + '" data-i="' + i + '">' +
          '<img src="' + src + '" alt=""></button>';
      }).join('') + '</div>'
    : '';

  var specs = [
    ['Ткань', p.fabric],
    ['Цвет', p.color],
    ['Размеры', (p.sizes || []).join(', ')],
    ['Изготовление', p.inStock ? 'Есть в наличии, отправим за 1–2 дня' : 'Под заказ, 7–14 дней'],
    ['Уход', p.care]
  ].filter(function (r) { return r[1]; });

  var priceHtml = p.oldPrice
    ? '<s>' + UI.price(p.oldPrice) + '</s>' + UI.price(p.price)
    : UI.price(p.price);

  host.innerHTML =
    '<div class="gallery reveal">' +
      '<div class="gallery__main" id="gallery-main">' +
        '<img id="main-img" src="' + images[0] + '" alt="' + esc(p.title) + '">' +
        (images.length > 1 ? '<div class="photo-dots" id="gallery-dots"></div>' : '') +
      '</div>' +
      thumbs +
    '</div>' +
    '<div class="product__panel reveal">' +
      (cat ? '<span class="eyebrow">' + esc(cat.title) + '</span>' : '') +
      '<h1 style="font-size:var(--fs-h2)">' + esc(p.title) + '</h1>' +
      '<div class="stock' + (p.inStock ? '' : ' stock--out') + '">' +
        (p.inStock ? 'В наличии' : 'Сошьём под заказ') + '</div>' +
      '<div class="product__price">' + priceHtml + '</div>' +
      ((p.sizes && p.sizes.length > 1)
        ? '<div class="field__label" style="margin-bottom:8px">Размер</div><div class="sizes">' +
          p.sizes.map(function (s, i) {
            return '<button class="size-btn' + (i === 0 ? ' is-active' : '') + '" data-size="' + esc(s) + '">' + esc(s) + '</button>';
          }).join('') + '</div>'
        : '') +
      '<button class="btn btn--primary btn--wide" data-add="' + esc(p.slug || p.id) + '">В корзину</button>' +
      '<button class="btn btn--ghost btn--wide" style="margin-top:10px" data-order="' + esc(p.slug || p.id) + '">Заказать сразу</button>' +
      '<p class="field__hint" style="margin-top:10px;text-align:center">Ответим в течение дня. Предоплата — только после согласования.</p>' +
      '<dl class="specs">' + specs.map(function (r) {
        return '<div class="spec"><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>';
      }).join('') + '</dl>' +
      '<div class="prose" style="font-size:1rem">' + UI.markup(p.description) + '</div>' +
    '</div>';

  /* Свайп по главному фото — и миниатюры едут следом */
  function markThumb(i) {
    host.querySelectorAll('.gallery__thumb').forEach(function (x, n) {
      x.classList.toggle('is-active', n === i);
    });
  }

  var gallery = UI.bindPhotoSwipe(document.getElementById('gallery-main'), images, {
    dots: document.getElementById('gallery-dots'),
    onChange: markThumb
  });

  host.addEventListener('click', function (e) {
    var t = e.target.closest('.gallery__thumb');
    if (t) {
      if (gallery) gallery.go(+t.dataset.i);
      else document.getElementById('main-img').src = images[+t.dataset.i];
      markThumb(+t.dataset.i);
      return;
    }
    var s = e.target.closest('.size-btn');
    if (s) {
      host.querySelectorAll('.size-btn').forEach(function (x) { x.classList.remove('is-active'); });
      s.classList.add('is-active');
    }
  });

  /* ---------- Похожие ---------- */

  var related = Store.products().filter(function (x) {
    return x.id !== p.id && x.category === p.category;
  }).slice(0, 4);

  if (related.length < 2) {
    related = Store.products().filter(function (x) { return x.id !== p.id; }).slice(0, 4);
  }
  if (related.length) {
    document.getElementById('related-section').hidden = false;
    document.getElementById('related').innerHTML = related.map(UI.productCard).join('');
  }

  UI.reveal();
})();
