/* Клевер — отправка заказа на почту без своего сервера.
   Поддерживаются два бесплатных сервиса-посредника; какой использовать,
   выбирается в админке (Настройки → Почта).

   web3forms  — нужен бесплатный ключ с web3forms.com, адрес почты в коде не светится
   formsubmit — без регистрации, но адрес почты виден в коде страницы
   none       — ничего не отправляем, заказ просто ложится в «Заявки» */

window.Mail = (function () {

  var TIMEOUT = 15000;

  function money(v) {
    return new Intl.NumberFormat('ru-RU').format(v || 0) + ' руб.';
  }

  /* Текст письма. Простой список — так его читает и человек, и телефон */
  function buildText(order) {
    var lines = [];
    lines.push('Новый заказ с сайта «' + (order.siteName || 'Клевер') + '»');
    lines.push('');
    lines.push('Имя: ' + order.name);
    lines.push('Связь: ' + order.contact);
    if (order.delivery) lines.push('Доставка: ' + order.delivery);
    lines.push('');
    lines.push('Товары:');
    (order.items || []).forEach(function (i, n) {
      lines.push(
        (n + 1) + '. ' + i.title +
        (i.size ? ' — размер ' + i.size : '') +
        ' — ' + i.qty + ' шт. — ' + money(i.price * i.qty)
      );
    });
    lines.push('');
    lines.push('Итого: ' + money(order.total));
    if (order.comment) {
      lines.push('');
      lines.push('Комментарий покупателя:');
      lines.push(order.comment);
    }
    lines.push('');
    lines.push('Отправлено ' + new Date().toLocaleString('ru-RU'));
    return lines.join('\n');
  }

  /* Короткая строка для списка заявок в админке */
  function buildSummary(order) {
    return (order.items || []).map(function (i) {
      return i.title + (i.size ? ' (' + i.size + ')' : '') + (i.qty > 1 ? ' ×' + i.qty : '');
    }).join(', ');
  }

  function looksLikeEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
  }

  function post(url, body) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT) : null;

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.json().catch(function () { return { success: res.ok }; });
    }).catch(function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  /* Возвращает { ok, skipped, message } и никогда не выбрасывает исключение */
  function send(order) {
    var s = Store.settings();
    var provider = s.mailProvider || 'none';
    var text = buildText(order);
    var subject = 'Заказ с сайта' +
      (s.siteName ? ' «' + s.siteName + '»' : '') +
      (order.name ? ' — ' + order.name : '');

    if (provider === 'none') {
      return Promise.resolve({ ok: false, skipped: true, message: 'Отправка писем не настроена' });
    }

    if (provider === 'web3forms') {
      if (!s.mailKey) {
        return Promise.resolve({ ok: false, skipped: true, message: 'Не указан ключ Web3Forms' });
      }
      var payload = {
        access_key: s.mailKey,
        subject: subject,
        from_name: order.name || 'Покупатель',
        message: text,
        botcheck: ''
      };
      /* Если покупатель оставил почту — ответить можно будет прямо из письма */
      if (looksLikeEmail(order.contact)) payload.email = order.contact.trim();
      if (s.mailTo) payload.to = s.mailTo;

      return post('https://api.web3forms.com/submit', payload)
        .then(function (r) {
          return r && r.success
            ? { ok: true, message: 'Письмо отправлено' }
            : { ok: false, message: (r && r.message) || 'Сервис отклонил письмо' };
        })
        .catch(function (e) {
          return { ok: false, message: 'Не получилось связаться с сервисом: ' + (e.message || e) };
        });
    }

    if (provider === 'formsubmit') {
      if (!s.mailTo) {
        return Promise.resolve({ ok: false, skipped: true, message: 'Не указан адрес почты' });
      }
      return post('https://formsubmit.co/ajax/' + encodeURIComponent(s.mailTo), {
        _subject: subject,
        _captcha: 'false',
        _template: 'box',
        name: order.name || 'Покупатель',
        contact: order.contact || '',
        message: text
      })
        .then(function (r) {
          var ok = r && (r.success === true || r.success === 'true');
          return ok
            ? { ok: true, message: 'Письмо отправлено' }
            : { ok: false, message: (r && r.message) || 'Сервис отклонил письмо' };
        })
        .catch(function (e) {
          return { ok: false, message: 'Не получилось связаться с сервисом: ' + (e.message || e) };
        });
    }

    return Promise.resolve({ ok: false, skipped: true, message: 'Неизвестный сервис отправки' });
  }

  /* Тот же текст, но для мессенджера — запасной путь, если письмо не ушло.
     WhatsApp и Telegram умеют принимать текст прямо в ссылке, ВКонтакте нет:
     там открывается пустой диалог, поэтому текст даём скопировать. */
  function messengerLink(order) {
    var s = Store.settings();
    var text = encodeURIComponent(buildText(order));
    if (s.whatsapp) return { label: 'Отправить в WhatsApp', href: 'https://wa.me/' + s.whatsapp + '?text=' + text };
    if (s.telegram) return { label: 'Отправить в Telegram', href: 'https://t.me/' + s.telegram };
    if (s.vk) return { label: 'Написать во ВКонтакте', href: UI.vkMessageUrl(s.vk), needsCopy: true };
    return null;
  }

  return { send: send, buildText: buildText, buildSummary: buildSummary, messengerLink: messengerLink };
})();
