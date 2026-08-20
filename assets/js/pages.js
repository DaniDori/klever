/* Клевер — журнал, статья, текстовые страницы, контакты.
   Один файл на четыре шаблона: работает та ветка, чьи блоки есть в разметке. */

(function () {
  UI.init();
  var esc = UI.esc;

  /* ================= Текстовая страница ================= */

  var pageHost = document.getElementById('page');
  if (pageHost) {
    var key = new URLSearchParams(location.search).get('p') || 'about';
    var pg = Store.page(key);

    if (!pg) {
      pageHost.innerHTML =
        '<section class="section"><div class="container"><div class="empty-state">' + UI.cloverSVG('') +
        '<h2>Страница не найдена</h2><a class="btn btn--ghost" href="index.html">На главную</a>' +
        '</div></div></section>';
    } else {
      document.title = pg.title + ' — Клевер';
      var media = key === 'about'
        ? '<section class="section--tight"><div class="container reveal">' +
          '<div style="border-radius:var(--r-xl);overflow:hidden;aspect-ratio:16/9;background:var(--white);box-shadow:var(--shadow-md)">' +
          '<img src="' + (pg.image || UI.placeholder('masterskaya-klever-wide', 1600, 900)) + '" alt="" ' +
          'style="width:100%;height:100%;object-fit:contain"></div>' +
          '</div></section>'
        : '';

      pageHost.innerHTML =
        '<section class="page-head"><div class="container container--narrow">' +
          '<nav class="crumbs"><a href="index.html">Главная</a><span>/</span><span>' + esc(pg.title) + '</span></nav>' +
          '<span class="eyebrow">Клевер</span>' +
          '<h1>' + esc(pg.title) + '</h1>' +
          '<p class="lead">' + esc(pg.subtitle || '') + '</p>' +
        '</div></section>' +
        media +
        '<section class="section--tight"><div class="container container--narrow">' +
          '<div class="prose reveal">' + UI.markup(pg.body) + '</div>' +
        '</div></section>';
    }
    var div = document.getElementById('page-divider');
    if (div) div.innerHTML = UI.cloverSVG('');
    UI.reveal();
  }

  /* ================= Контакты ================= */

  var cForm = document.getElementById('contact-form');
  if (cForm) {
    var s = Store.settings();
    var pgC = Store.page('contacts') || {};
    document.getElementById('c-title').textContent = pgC.title || 'Контакты';
    document.getElementById('c-sub').textContent = pgC.subtitle || '';
    document.getElementById('c-body').innerHTML = UI.markup(pgC.body);

    var rows = [
      ['Телефон', '<a href="tel:' + esc(String(s.phone).replace(/[^\d+]/g, '')) + '">' + esc(s.phone) + '</a>'],
      ['Почта', '<a href="mailto:' + esc(s.email) + '">' + esc(s.email) + '</a>'],
      ['Адрес', esc(s.address)],
      ['Часы работы', esc(s.workHours)]
    ].filter(function (r) { return r[1]; });

    document.getElementById('c-list').innerHTML = rows.map(function (r) {
      return '<div class="spec"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
    }).join('');

    document.getElementById('c-buttons').innerHTML =
      (s.telegram ? '<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://t.me/' + esc(s.telegram) + '">Telegram</a>' : '') +
      (s.whatsapp ? '<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(s.whatsapp) + '">WhatsApp</a>' : '') +
      (s.instagram ? '<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener" href="https://instagram.com/' + esc(s.instagram) + '">Instagram</a>' : '');

    cForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      ['name', 'contact'].forEach(function (n) {
        var field = cForm[n].closest('.field');
        field.classList.remove('field--error');
        var old = field.querySelector('.field__error');
        if (old) old.remove();
        if (!cForm[n].value.trim()) {
          ok = false;
          field.classList.add('field--error');
          var d = document.createElement('div');
          d.className = 'field__error';
          d.textContent = 'Без этого мы не сможем ответить';
          field.appendChild(d);
        }
      });
      if (!ok) return;

      var submit = cForm.querySelector('button[type="submit"]');
      var label = submit ? submit.textContent : '';
      if (submit) { submit.disabled = true; submit.textContent = 'Отправляем…'; }

      Store.addRequest({
        productId: '', productTitle: 'Сообщение со страницы контактов',
        name: cForm.name.value.trim(),
        contact: cForm.contact.value.trim(),
        size: '',
        comment: cForm.comment.value.trim(),
        source: 'contacts'
      }).then(function (res) {
        if (submit) { submit.disabled = false; submit.textContent = label; }
        if (res.ok) {
          cForm.reset();
          UI.toast('Спасибо! Сообщение отправлено, мы ответим в течение дня.');
        } else {
          UI.toast(res.message || 'Не удалось отправить сообщение', 'warn');
        }
      });
    });
    UI.reveal();
  }
})();
