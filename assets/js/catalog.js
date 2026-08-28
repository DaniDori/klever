/* Клевер — каталог с фильтрами */

(function () {
  UI.init();

  var esc = UI.esc;
  var all = Store.products();
  var cats = Store.categories();
  var params = new URLSearchParams(location.search);
  var route = Routes.parse(location.pathname) || {};

  var maxPrice = all.reduce(function (m, p) { return Math.max(m, p.price || 0); }, 0);
  maxPrice = Math.ceil(maxPrice / 1000) * 1000 || 20000;

  var GENDERS = [
    { value: '', label: 'Всем' },
    { value: 'women', label: 'Женщинам' },
    { value: 'men', label: 'Мужчинам' }
  ];

  var state = {
    gender: params.get('gender') || '',
    /* Категория теперь в самом адресе: /katalog/dresses */
    cat: route.cat || '',
    price: maxPrice,
    sizes: [],
    stockOnly: false,
    sort: 'default'
  };

  /* ---------- Заголовок страницы ---------- */

  function genderLabel() {
    var g = GENDERS.filter(function (x) { return x.value === state.gender; })[0];
    return g && g.value ? g.label : '';
  }

  function syncHead() {
    var c = state.cat ? Store.category(state.cat) : null;
    var g = genderLabel();
    var title = c ? c.title : (g || 'Все вещи');
    if (c && g) title = c.title + ' — ' + g.toLowerCase();
    document.getElementById('cat-title').textContent = title;
    document.getElementById('crumb').textContent = c ? c.title : (g || 'Каталог');
    if (c && c.description) document.getElementById('cat-desc').textContent = c.description;
  }

  /* Адрес отражает выбранную категорию и «кому», чтобы ссылкой можно было
     поделиться. Размер и цена в него не идут — это временные фильтры. */
  function syncUrl() {
    history.replaceState(null, '',
      Routes.catalog(state.cat, state.gender ? { gender: state.gender } : null));
  }

  function renderGenders() {
    document.getElementById('f-gender').innerHTML = GENDERS.map(function (g) {
      return '<button class="chip' + (state.gender === g.value ? ' is-active' : '') + '"' +
        ' data-gender="' + esc(g.value) + '">' + esc(g.label) + '</button>';
    }).join('');
  }

  /* ---------- Фильтры ---------- */

  function inGender(p) {
    return !state.gender || (p.gender || 'women') === state.gender;
  }

  function countIn(slug) {
    return all.filter(function (p) {
      return inGender(p) && (!slug || p.category === slug);
    }).length;
  }

  /* Пустые категории из списка не выбрасываются, а гаснут. Раньше они
     исчезали, столбец фильтров становился короче, и всё, что ниже —
     цена, размеры, наличие — прыгало вверх прямо под рукой у человека.
     Заодно видно, что в разделе сейчас ничего нет, а не что он пропал. */
  function renderCats() {
    var rows = [{ slug: '', title: 'Все вещи', n: countIn('') }].concat(cats.map(function (c) {
      return { slug: c.slug, title: c.title, n: countIn(c.slug) };
    }));
    document.getElementById('f-cats').innerHTML = rows.map(function (r) {
      /* Выбранную категорию не гасим, даже если в ней пусто: иначе из неё
         нельзя было бы выйти, да и непонятно, что именно выбрано. */
      var empty = !r.n && r.slug && state.cat !== r.slug;
      return '<button class="filter-row' + (state.cat === r.slug ? ' is-active' : '') +
        (empty ? ' is-empty' : '') + '" data-cat="' + esc(r.slug) + '"' +
        (empty ? ' disabled' : '') + '>' +
        '<span class="filter-row__label"><span class="filter-row__dot"></span>' + esc(r.title) + '</span>' +
        '<span class="chip__count">' + r.n + '</span></button>';
    }).join('');
  }

  function renderSizes() {
    var seen = [];
    all.forEach(function (p) {
      (p.sizes || []).forEach(function (s) { if (seen.indexOf(s) === -1) seen.push(s); });
    });
    var order = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
    seen.sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia > -1 && ib > -1) return ia - ib;
      if (ia > -1) return -1;
      if (ib > -1) return 1;
      return a.localeCompare(b, 'ru');
    });
    document.getElementById('f-sizes').innerHTML = seen.map(function (s) {
      return '<button class="chip' + (state.sizes.indexOf(s) > -1 ? ' is-active' : '') + '" data-size="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
  }

  var priceInput = document.getElementById('f-price');
  priceInput.max = maxPrice;
  priceInput.value = maxPrice;

  function syncPriceLabel() {
    document.getElementById('price-label').textContent =
      +priceInput.value >= maxPrice ? '— любой' : UI.price(+priceInput.value);
  }

  /* ---------- Отрисовка ---------- */

  function apply() {
    var list = all.filter(function (p) {
      if (!inGender(p)) return false;
      if (state.cat && p.category !== state.cat) return false;
      if ((p.price || 0) > state.price) return false;
      if (state.stockOnly && !p.inStock) return false;
      if (state.sizes.length) {
        var has = (p.sizes || []).some(function (s) { return state.sizes.indexOf(s) > -1; });
        if (!has) return false;
      }
      return true;
    });

    if (state.sort === 'price-asc')  list.sort(function (a, b) { return a.price - b.price; });
    if (state.sort === 'price-desc') list.sort(function (a, b) { return b.price - a.price; });
    if (state.sort === 'new')        list.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });

    var grid = document.getElementById('grid');
    grid.innerHTML = list.length
      ? list.map(UI.productCard).join('')
      : '<div class="empty-state" style="grid-column:1/-1">' + UI.cloverSVG('') +
        '<p>' + (state.gender === 'men'
          ? 'Мужскую линию мы пока шьём только под заказ.<br>Напишите — обсудим ткань, крой и мерки.'
          : 'Под эти условия ничего не нашлось.<br>Попробуйте смягчить фильтры — или напишите нам, сошьём под вас.') + '</p>' +
        '<button class="btn btn--ghost btn--sm" data-order="">Написать в мастерскую</button></div>';

    document.getElementById('count').textContent =
      list.length + ' ' + UI.plural(list.length, ['вещь', 'вещи', 'вещей']);

    UI.reveal(grid);
  }

  /* ---------- События ---------- */

  document.getElementById('f-cats').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]');
    if (!b) return;
    state.cat = b.dataset.cat;
    syncUrl();
    renderCats(); syncHead(); apply();
  });

  document.getElementById('f-gender').addEventListener('click', function (e) {
    var b = e.target.closest('[data-gender]');
    if (!b) return;
    state.gender = b.dataset.gender;
    syncUrl();
    renderGenders(); renderCats(); syncHead(); apply();
  });

  document.getElementById('f-sizes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-size]');
    if (!b) return;
    var s = b.dataset.size;
    var i = state.sizes.indexOf(s);
    if (i > -1) state.sizes.splice(i, 1); else state.sizes.push(s);
    renderSizes(); apply();
  });

  priceInput.addEventListener('input', function () {
    state.price = +priceInput.value;
    syncPriceLabel();
    apply();
  });

  document.getElementById('f-stock').addEventListener('change', function (e) {
    state.stockOnly = e.target.checked;
    apply();
  });

  document.getElementById('sort').addEventListener('change', function (e) {
    state.sort = e.target.value;
    apply();
  });

  document.getElementById('f-reset').addEventListener('click', function () {
    state = { gender: '', cat: '', price: maxPrice, sizes: [], stockOnly: false, sort: 'default' };
    priceInput.value = maxPrice;
    document.getElementById('f-stock').checked = false;
    document.getElementById('sort').value = 'default';
    syncUrl();
    syncPriceLabel(); renderGenders(); renderCats(); renderSizes(); syncHead(); apply();
  });

  syncHead();
  renderGenders();
  renderCats();
  renderSizes();
  syncPriceLabel();
  apply();
})();
