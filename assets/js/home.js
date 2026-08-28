/* Клевер — главная: плакаты, кнопки входа в каталог, ассортимент */

(function () {
  UI.init();

  var esc = UI.esc;

  /* ---------- Плакаты ---------- */

  var banners = Store.banners();
  var hero = document.getElementById('hero');
  var dots = document.getElementById('hero-dots');

  if (!banners.length) {
    banners = [{
      id: 'empty', eyebrow: 'Клевер', title: 'Скоро здесь появится плакат',
      text: 'Добавьте его в админ-панели.', ctaText: 'В каталог', ctaLink: Routes.catalog()
    }];
  }

  hero.innerHTML = banners.map(function (b, i) {
    var cta2 = b.ctaText2 && b.ctaLink2
      ? '<a class="btn btn--ghost" href="' + esc(b.ctaLink2) + '">' + esc(b.ctaText2) + '</a>' : '';
    var cta1 = b.ctaText
      ? '<a class="btn btn--primary" href="' + esc(b.ctaLink || Routes.catalog()) + '">' + esc(b.ctaText) + '</a>' : '';
    return '<div class="hero__slide' + (i === 0 ? ' is-active' : '') + '">' +
      '<div class="hero__body">' +
        (b.eyebrow ? '<span class="eyebrow">' + esc(b.eyebrow) + '</span>' : '') +
        '<h1>' + esc(b.title) + '</h1>' +
        '<p>' + esc(b.text || '') + '</p>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap">' + cta1 + cta2 + '</div>' +
      '</div>' +
      '<div class="hero__media"><img src="' + UI.imageOf({ image: b.image, slug: b.id + b.title }) + '" alt="' + esc(b.title) + '"></div>' +
    '</div>';
  }).join('');

  if (banners.length > 1) {
    dots.innerHTML = banners.map(function (b, i) {
      return '<button class="hero__dot' + (i === 0 ? ' is-active' : '') + '" data-i="' + i + '" aria-label="Плакат ' + (i + 1) + '"></button>';
    }).join('');

    var index = 0, timer = null;
    var slides = hero.querySelectorAll('.hero__slide');
    var dotEls = dots.querySelectorAll('.hero__dot');

    function show(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (s, n) { s.classList.toggle('is-active', n === index); });
      dotEls.forEach(function (d, n) { d.classList.toggle('is-active', n === index); });
    }
    function play() { stop(); timer = setInterval(function () { show(index + 1); }, 7000); }
    function stop() { if (timer) clearInterval(timer); }

    dots.addEventListener('click', function (e) {
      var d = e.target.closest('.hero__dot');
      if (!d) return;
      show(+d.dataset.i);
      play();
    });

    UI.swipe(hero, function (dir) {
      show(index + (dir === 'left' ? 1 : -1));
      play();
    });
    UI.swipeGuard(hero);

    hero.addEventListener('mouseenter', stop);
    hero.addEventListener('mouseleave', play);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) play();
  } else {
    dots.style.display = 'none';
  }

  /* ---------- Кнопки входа ---------- */

  var products = Store.products();
  function countFor(gender) {
    return gender
      ? products.filter(function (p) { return p.gender === gender; }).length
      : products.length;
  }

  var ENTRIES = [
    { href: Routes.catalog(), title: 'Каталог', note: 'Всё, что есть в мастерской', gender: '' },
    { href: Routes.catalog('', { gender: 'women' }), title: 'Женщинам', note: 'Платья, блузы, сарафаны', gender: 'women' },
    { href: Routes.catalog('', { gender: 'men' }), title: 'Мужчинам', note: 'Рубашки и костюмы', gender: 'men' }
  ];

  document.getElementById('entries').innerHTML = ENTRIES.map(function (e) {
    var n = countFor(e.gender);
    return '<a class="entry" href="' + esc(e.href) + '">' +
      UI.cloverSVG('entry__mark') +
      '<span class="entry__title">' + esc(e.title) + '</span>' +
      '<span class="entry__note">' + esc(e.note) + '</span>' +
      '<span class="entry__count">' + (n ? n + ' ' + UI.plural(n, ['вещь', 'вещи', 'вещей']) : 'скоро') + '</span>' +
    '</a>';
  }).join('');

  /* ---------- Ассортимент ---------- */

  var shown = products.slice(0, 8);
  document.getElementById('assortment').innerHTML = shown.length
    ? shown.map(UI.productCard).join('')
    : '<p class="muted">Товаров пока нет — добавьте их в админ-панели.</p>';

  UI.bindCardPhotos();
  UI.reveal();
})();
