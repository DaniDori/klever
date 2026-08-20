/* Клевер — корзина.
   Живёт в localStorage отдельно от контента сайта (ключ klever.cart),
   чтобы наполнение из админки и покупки покупателя не мешали друг другу. */

window.Cart = (function () {
  var KEY = 'klever.cart';
  var items = null;
  var listeners = [];

  function load() {
    if (items) return items;
    try {
      items = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(items)) items = [];
    } catch (e) { items = []; }
    return items;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); }
    catch (e) { /* корзина маленькая, но если места нет — просто не сохраним */ }
    listeners.forEach(function (fn) { fn(api.items()); });
  }

  /* Один и тот же товар в разных размерах — разные строки */
  function keyOf(id, size) { return id + '::' + (size || ''); }

  var api = {
    items: function () {
      /* Данные о товаре берём из каталога — цена и название всегда актуальные */
      return load().map(function (row) {
        var p = Store.product(row.id);
        return {
          key: keyOf(row.id, row.size),
          id: row.id,
          size: row.size || '',
          qty: row.qty || 1,
          title: p ? p.title : (row.title || 'Товар удалён'),
          price: p ? p.price : (row.price || 0),
          slug: p ? (p.slug || p.id) : row.id,
          missing: !p,
          product: p
        };
      });
    },

    count: function () {
      return load().reduce(function (n, r) { return n + (r.qty || 1); }, 0);
    },

    total: function () {
      return api.items().reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    },

    isEmpty: function () { return load().length === 0; },

    add: function (product, size, qty) {
      if (!product) return;
      load();
      qty = qty || 1;
      var k = keyOf(product.id, size);
      var row = items.filter(function (r) { return keyOf(r.id, r.size) === k; })[0];
      if (row) row.qty += qty;
      else items.push({ id: product.id, size: size || '', qty: qty, title: product.title, price: product.price });
      save();
    },

    setQty: function (key, qty) {
      load();
      var row = items.filter(function (r) { return keyOf(r.id, r.size) === key; })[0];
      if (!row) return;
      row.qty = Math.max(1, Math.min(99, qty));
      save();
    },

    remove: function (key) {
      items = load().filter(function (r) { return keyOf(r.id, r.size) !== key; });
      save();
    },

    clear: function () { items = []; save(); },

    onChange: function (fn) { listeners.push(fn); }
  };

  return api;
})();
