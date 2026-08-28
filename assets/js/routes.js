/* Клевер — адреса страниц.

   Один файл на всех: браузер подключает его тегом script, сервер — через
   require. Иначе таблица адресов разъехалась бы между витриной, админкой
   и генератором карты сайта, и ссылки начали бы вести в никуда.

   Схема:
     /                          главная
     /katalog                   весь каталог
     /katalog/dresses           категория
     /tovar/dress-poleva        карточка товара
     /kontakty                  контакты
     /dostavka, /uhod, …        текстовые страницы
*/

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Routes = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var CATALOG = 'katalog';
  var PRODUCT = 'tovar';
  var CONTACTS = 'kontakty';

  /* Ключ страницы в базе → адрес. Адреса человеческие: их видно в выдаче
     и в строке браузера, поэтому «dostavka», а не «page?p=delivery». */
  var PAGES = {
    about: 'o-masterskoy',
    delivery: 'dostavka',
    care: 'uhod',
    terms: 'usloviya-prodazhi',
    privacy: 'politika-konfidencialnosti'
  };

  var PAGE_BY_URL = {};
  Object.keys(PAGES).forEach(function (k) { PAGE_BY_URL[PAGES[k]] = k; });

  function clean(s) { return String(s || '').replace(/^\/+|\/+$/g, ''); }

  function query(params) {
    if (!params) return '';
    var parts = [];
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === '' || v == null) return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  var api = {
    home: function () { return '/'; },

    catalog: function (catSlug, params) {
      return '/' + CATALOG + (catSlug ? '/' + encodeURIComponent(catSlug) : '') + query(params);
    },

    product: function (slug) {
      return '/' + PRODUCT + '/' + encodeURIComponent(slug || '');
    },

    page: function (key) {
      if (key === 'contacts') return '/' + CONTACTS;
      return '/' + (PAGES[key] || clean(key));
    },

    contacts: function () { return '/' + CONTACTS; },

    /* Какой странице соответствует адрес. Возвращает { type, … } либо null.
       Этим пользуются и сервер (что отдавать), и витрина (что рисовать). */
    parse: function (pathname) {
      var parts = clean(pathname).split('/').filter(Boolean).map(decodeURIComponent);

      if (!parts.length) return { type: 'home', file: 'index.html' };

      if (parts[0] === CATALOG) {
        return { type: 'catalog', file: 'catalog.html', cat: parts[1] || '' };
      }
      if (parts[0] === PRODUCT && parts[1]) {
        return { type: 'product', file: 'product.html', slug: parts[1] };
      }
      if (parts[0] === CONTACTS && parts.length === 1) {
        return { type: 'contacts', file: 'contacts.html', page: 'contacts' };
      }
      if (parts.length === 1 && PAGE_BY_URL[parts[0]]) {
        return { type: 'page', file: 'page.html', page: PAGE_BY_URL[parts[0]] };
      }
      return null;
    },

    /* Старый адрес → новый. Нужно, чтобы уже разосланные ссылки
       и то, что успели проиндексировать, не превращались в 404. */
    legacy: function (pathname, search) {
      var file = clean(pathname).split('/').pop();
      var q = new URLSearchParams(search || '');

      if (file === 'index.html') return '/';
      if (file === 'contacts.html') return api.contacts();
      if (file === 'product.html') {
        return q.get('id') ? api.product(q.get('id')) : api.catalog();
      }
      if (file === 'catalog.html') {
        var rest = {};
        q.forEach(function (v, k) { if (k !== 'cat') rest[k] = v; });
        return api.catalog(q.get('cat') || '', rest);
      }
      if (file === 'page.html') return api.page(q.get('p') || 'about');
      return null;
    },

    pageKeys: PAGES,
    pageUrls: PAGE_BY_URL
  };

  return api;
});
