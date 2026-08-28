/* Клевер — то, что видит поисковик.

   Витрину рисует JavaScript, а роботы Яндекса его почти не исполняют: до
   этого файла страница товара приходила пустой — один заголовок «Товар».
   Поэтому сервер подставляет в HTML заголовки, описание, микроразметку
   и сам текст ещё до отдачи. Браузер потом перерисует то же самое —
   расхождения нет, просто у робота уже всё есть. */

'use strict';

var db = require('./db');
var routes = require('../assets/js/routes');

/* ---------- Мелочи ---------- */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Описание для сниппета: без разметки, одним абзацем, не длиннее предела.
   Обрезаем по границе слова — обрубок посреди слова выглядит неряшливо. */
function snippet(text, limit) {
  limit = limit || 300;
  var s = String(text || '')
    .replace(/\r/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[->]\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= limit) return s;
  var cut = s.slice(0, limit);
  var space = cut.lastIndexOf(' ');
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[,.;:—-]+$/, '') + '…';
}

function money(v) {
  return new Intl.NumberFormat('ru-RU').format(v || 0) + ' ₽';
}

function abs(base, path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return base + '/' + String(path).replace(/^\/+/, '');
}

/* Простая разметка страниц — тот же набор, что понимает витрина */
function markup(text) {
  var lines = String(text || '').split(/\r?\n/);
  var out = [], list = null, para = [];

  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  }
  function flushPara() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
  function flushList() { if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; } }

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

function jsonLd(obj) {
  /* </script> внутри данных закрыл бы тег раньше времени */
  var text = JSON.stringify(obj).replace(/</g, '\\u003c');
  return '<script type="application/ld+json">' + text + '</script>';
}

/* ---------- Общие куски разметки ---------- */

function organization(base, s) {
  var o = {
    '@context': 'https://schema.org',
    '@type': 'ClothingStore',
    name: s.siteName,
    alternateName: s.tagline,
    url: base + '/',
    description: s.slogan || '',
    image: abs(base, 'img/dress-fern.jpg'),
    priceRange: '3900–13500 ₽'
  };
  if (s.phone) o.telephone = s.phone;
  if (s.email) o.email = s.email;
  if (s.address) {
    o.address = {
      '@type': 'PostalAddress',
      addressLocality: String(s.address).split(',')[0].trim(),
      streetAddress: String(s.address).split(',').slice(1).join(',').trim(),
      addressCountry: 'RU'
    };
  }
  if (s.workHours) o.openingHours = s.workHours;
  var same = [];
  if (s.vk) same.push('https://vk.com/' + String(s.vk).replace(/^https?:\/\/(www\.)?vk\.(com|ru)\//i, '').replace(/\/+$/, ''));
  if (s.telegram) same.push('https://t.me/' + s.telegram);
  if (same.length) o.sameAs = same;
  return o;
}

function breadcrumbs(base, trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(function (t, i) {
      return { '@type': 'ListItem', position: i + 1, name: t.name, item: abs(base, t.url) };
    })
  };
}

/* ---------- Страницы ---------- */

var GENDER = { women: 'Женщинам', men: 'Мужчинам' };

function forProduct(base, s, slug) {
  var p = db.list('products').filter(function (x) { return x.slug === slug || x.id === slug; })[0];
  if (!p) return null;

  var cat = db.list('categories').filter(function (c) { return c.slug === p.category; })[0];
  var image = abs(base, (p.images || [])[0] || p.thumb || 'img/dress-fern.jpg');
  var url = base + routes.product(p.slug || p.id);
  var desc = snippet(p.description || (p.fabric + '. ' + p.color), 300);

  var offer = {
    '@type': 'Offer',
    url: url,
    price: p.price,
    priceCurrency: 'RUB',
    availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: s.siteName }
  };

  var product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.title,
    description: desc,
    image: [image],
    sku: p.id,
    category: cat ? cat.title : '',
    offers: offer
  };
  if (p.fabric) product.material = p.fabric;
  if (p.color) product.color = p.color;
  if ((p.sizes || []).length) product.size = p.sizes;
  product.brand = { '@type': 'Brand', name: s.siteName };

  var trail = [{ name: 'Главная', url: routes.home() }, { name: 'Каталог', url: routes.catalog() }];
  if (cat) trail.push({ name: cat.title, url: routes.catalog(cat.slug) });
  trail.push({ name: p.title, url: routes.product(p.slug || p.id) });

  /* Тот же текст, что покажет витрина, — робот получает его сразу */
  var main =
    '<div class="product__gallery"><img src="' + esc(image) + '" alt="' + esc(p.title) + '" width="1200" height="1500"></div>' +
    '<div class="product__panel">' +
      '<h1>' + esc(p.title) + '</h1>' +
      '<p class="product__price">' + esc(money(p.price)) +
        (p.oldPrice ? ' <s>' + esc(money(p.oldPrice)) + '</s>' : '') + '</p>' +
      (p.fabric ? '<p>' + esc(p.fabric) + '</p>' : '') +
      (p.color ? '<p>Цвет: ' + esc(p.color) + '</p>' : '') +
      ((p.sizes || []).length ? '<p>Размеры: ' + esc(p.sizes.join(', ')) + '</p>' : '') +
      '<p>' + (p.inStock ? 'В наличии' : 'Шьётся под заказ') + '</p>' +
      '<div class="prose">' + markup(p.description) + '</div>' +
      (p.care ? '<p>Уход: ' + esc(p.care) + '</p>' : '') +
    '</div>';

  return {
    title: p.title + ' — ' + s.siteName,
    /* Не режем повторно: snippet уже закончил на границе слова */
    description: snippet(p.description || (p.fabric + '. ' + p.color), 200),
    canonical: url,
    image: image,
    ogType: 'product',
    jsonld: [product, breadcrumbs(base, trail)],
    fill: { product: main, crumbs: crumbHtml(trail) }
  };
}

function crumbHtml(trail) {
  return trail.map(function (t, i) {
    return i === trail.length - 1
      ? '<span>' + esc(t.name) + '</span>'
      : '<a href="' + esc(t.url) + '">' + esc(t.name) + '</a><span>/</span>';
  }).join('');
}

function forCatalog(base, s, catSlug, q) {
  var cat = catSlug ? db.list('categories').filter(function (c) { return c.slug === catSlug; })[0] : null;
  var gender = q.get('gender');
  var products = db.list('products').filter(function (p) {
    if (cat && p.category !== cat.slug) return false;
    if (gender && p.gender !== gender) return false;
    return true;
  });

  var name = cat ? cat.title : (GENDER[gender] || 'Каталог');
  var title = (cat ? cat.title : (gender ? GENDER[gender] : 'Каталог')) + ' — ' + s.siteName;
  var desc = cat
    ? cat.title + ': ' + (cat.description || 'одежда ручной работы') + '. ' +
      products.length + ' ' + plural(products.length, ['вещь', 'вещи', 'вещей']) + ' в наличии и под заказ.'
    : 'Одежда ручной работы из льна, хлопка и мериноса: платья, блузы, вязаное, палантины, сумки и костюмы. Пошив по индивидуальным меркам.';

  /* Остальные фильтры (размер, цена) в канонический адрес не берём:
     иначе каждая комбинация галочек стала бы отдельной страницей. */
  var url = base + routes.catalog(cat ? cat.slug : '', gender ? { gender: gender } : null);

  var list = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: name,
    numberOfItems: products.length,
    itemListElement: products.slice(0, 30).map(function (p, i) {
      return {
        '@type': 'ListItem',
        position: i + 1,
        url: base + routes.product(p.slug || p.id),
        name: p.title
      };
    })
  };

  var trail = [{ name: 'Главная', url: routes.home() }, { name: 'Каталог', url: routes.catalog() }];
  if (cat) trail.push({ name: cat.title, url: routes.catalog(cat.slug) });

  /* Ссылки на товары — чтобы робот нашёл карточки, даже не исполняя скрипты */
  var grid = products.map(function (p) {
    return '<a class="card" href="' + esc(routes.product(p.slug || p.id)) + '">' +
      '<img src="' + esc(p.thumb || (p.images || [])[0] || 'img/dress-fern-sm.jpg') + '" alt="' + esc(p.title) + '" loading="lazy">' +
      '<span class="card__title">' + esc(p.title) + '</span>' +
      '<span class="card__meta">' + esc(p.fabric || '') + '</span>' +
      '<span class="card__price">' + esc(money(p.price)) + '</span></a>';
  }).join('');

  return {
    title: title,
    description: snippet(desc, 200),
    canonical: url,
    image: abs(base, (products[0] && ((products[0].images || [])[0] || products[0].thumb)) || 'img/dress-fern.jpg'),
    jsonld: [list, breadcrumbs(base, trail)],
    fill: { grid: grid, 'cat-title': esc(name) }
  };
}

function plural(n, forms) {
  var n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

function forPage(base, s, key) {
  var pages = db.pages();
  var pg = pages[key];
  if (!pg) return null;

  var trail = [{ name: 'Главная', url: routes.home() }, { name: pg.title, url: routes.page(key) }];
  var main =
    '<section class="page-head"><div class="container container--narrow">' +
      '<h1>' + esc(pg.title) + '</h1>' +
      (pg.subtitle ? '<p class="lead">' + esc(pg.subtitle) + '</p>' : '') +
    '</div></section>' +
    '<section class="section--tight"><div class="container container--narrow">' +
      '<div class="prose">' + markup(pg.body) + '</div>' +
    '</div></section>';

  return {
    title: pg.title + ' — ' + s.siteName,
    description: snippet(pg.subtitle || pg.body, 200),
    canonical: base + routes.page(key),
    image: abs(base, pg.image || 'img/dress-fern.jpg'),
    /* Юридические тексты в поиске не нужны, но робот должен их видеть */
    noindex: key === 'privacy' || key === 'terms',
    jsonld: [breadcrumbs(base, trail)],
    fill: { page: main }
  };
}

function forHome(base, s) {
  var products = db.list('products');
  return {
    title: s.siteName + ' — мастерская ' + String(s.tagline || '').replace(/^Мастерская\s+/i, ''),
    description: snippet((s.slogan ? s.slogan + '. ' : '') +
      'Платья, блузы, вязаное, палантины и сумки ручной работы из льна, хлопка и мериноса. ' +
      'Пошив по индивидуальным меркам. ' + (s.address || ''), 200),
    canonical: base + '/',
    image: abs(base, (products[0] && (products[0].images || [])[0]) || 'img/dress-fern.jpg'),
    jsonld: [organization(base, s), {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: s.siteName,
      url: base + '/'
    }]
  };
}

function forContacts(base, s) {
  var pg = db.pages().contacts || {};
  return {
    title: 'Контакты — ' + s.siteName,
    description: snippet('Как связаться с мастерской: ' +
      [s.phone, s.email, s.address].filter(Boolean).join(', ') + '. ' + (pg.subtitle || ''), 200),
    canonical: base + routes.contacts(),
    image: abs(base, 'img/dress-fern.jpg'),
    jsonld: [organization(base, s), breadcrumbs(base, [
      { name: 'Главная', url: routes.home() }, { name: 'Контакты', url: routes.contacts() }
    ])]
  };
}

/* ---------- Сборка ---------- */

function metaFor(pathname, query, base) {
  var s = db.settings();

  if (/admin\.html$/.test(pathname)) return { noindex: true, skip: true };

  var route = routes.parse(pathname);
  if (!route) return null;

  if (route.type === 'home') return forHome(base, s);
  if (route.type === 'catalog') return forCatalog(base, s, route.cat, query);
  if (route.type === 'contacts') return forContacts(base, s);
  if (route.type === 'product') return forProduct(base, s, route.slug);
  if (route.type === 'page') return forPage(base, s, route.page);
  return null;
}

function headTags(meta, base, s) {
  var out = [];
  if (meta.description) out.push('<meta name="description" content="' + esc(meta.description) + '">');
  if (meta.canonical) out.push('<link rel="canonical" href="' + esc(meta.canonical) + '">');
  if (meta.noindex) out.push('<meta name="robots" content="noindex, follow">');

  out.push('<meta property="og:type" content="' + esc(meta.ogType || 'website') + '">');
  out.push('<meta property="og:site_name" content="' + esc(s.siteName) + '">');
  out.push('<meta property="og:locale" content="ru_RU">');
  if (meta.title) out.push('<meta property="og:title" content="' + esc(meta.title) + '">');
  if (meta.description) out.push('<meta property="og:description" content="' + esc(meta.description) + '">');
  if (meta.canonical) out.push('<meta property="og:url" content="' + esc(meta.canonical) + '">');
  if (meta.image) out.push('<meta property="og:image" content="' + esc(meta.image) + '">');
  out.push('<meta name="twitter:card" content="summary_large_image">');

  (meta.jsonld || []).forEach(function (obj) { out.push(jsonLd(obj)); });
  return out.join('\n');
}

/* Вставляем всё в готовый HTML: заголовок, теги в <head>, текст в контейнеры */
function apply(html, pathname, query, base) {
  var meta = metaFor(pathname, query, base);
  if (!meta) return html;

  var s = db.settings();

  if (meta.skip) {
    return html.replace('</head>', '<meta name="robots" content="noindex, nofollow">\n</head>');
  }

  if (meta.title) {
    html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + esc(meta.title) + '</title>');
  }
  /* Своё описание уже есть в файле — заменяем, чтобы не было двух */
  html = html.replace(/\s*<meta\s+name="description"[^>]*>/i, '');
  html = html.replace('</head>', headTags(meta, base, s) + '\n</head>');

  Object.keys(meta.fill || {}).forEach(function (id) {
    /* Имя тега может содержать цифру — h1, h2. Без этого «</h1>» не считался
       закрывающим, и замена съедала разметку до следующего «</p>». */
    var re = new RegExp('(<([a-z][a-z0-9]*)[^>]*\\sid="' + id + '"[^>]*>)([\\s\\S]*?)(</\\2>)', 'i');
    html = html.replace(re, function (all, open, tag, inner, close) {
      return open + meta.fill[id] + close;
    });
  });

  return html;
}

/* ---------- robots.txt и карта сайта ---------- */

function robots(base) {
  return [
    'User-agent: *',
    'Disallow: /admin.html',
    'Disallow: /api/',
    /* uploads не закрываем: там лежат фотографии товаров,
       и они должны попадать в поиск по картинкам */
    'Allow: /',
    '',
    'Sitemap: ' + base + '/sitemap.xml',
    ''
  ].join('\n');
}

function sitemap(base) {
  var today = new Date().toISOString().slice(0, 10);
  var urls = [];

  function add(loc, priority, freq, lastmod) {
    urls.push('  <url>\n' +
      '    <loc>' + esc(loc) + '</loc>\n' +
      '    <lastmod>' + (lastmod || today) + '</lastmod>\n' +
      '    <changefreq>' + freq + '</changefreq>\n' +
      '    <priority>' + priority + '</priority>\n' +
      '  </url>');
  }

  add(base + routes.home(), '1.0', 'weekly');
  add(base + routes.catalog(), '0.9', 'weekly');
  add(base + routes.contacts(), '0.5', 'monthly');

  db.list('categories').forEach(function (c) {
    add(base + routes.catalog(c.slug), '0.7', 'weekly');
  });

  ['women', 'men'].forEach(function (g) {
    var n = db.list('products').filter(function (p) { return p.gender === g; }).length;
    if (n) add(base + routes.catalog('', { gender: g }), '0.7', 'weekly');
  });

  db.list('products').forEach(function (p) {
    add(base + routes.product(p.slug || p.id), '0.8', 'monthly',
      /^\d{4}-\d{2}-\d{2}/.test(p.createdAt) ? p.createdAt.slice(0, 10) : today);
  });

  /* Юридические страницы в карту не кладём: они помечены noindex */
  ['about', 'delivery', 'care'].forEach(function (k) {
    if (db.pages()[k]) add(base + routes.page(k), '0.5', 'monthly');
  });

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n</urlset>\n';
}

module.exports = { apply: apply, robots: robots, sitemap: sitemap, snippet: snippet };
