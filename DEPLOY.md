# Как поставить «Клевер» на сервер

Пошагово, без предположений о том, что вы уже что-то знаете. Всё, что нужно, —
VPS с Ubuntu 24.04 (подойдёт самый дешёвый: 1 ядро, 1 ГБ памяти) и домен.

Сервер «Клевера» не тянет ни одной внешней библиотеки: SQLite встроен в Node
начиная с версии 22.5. Поэтому `npm install` делать не нужно — его нечего
устанавливать.

---

## 1. Node.js

Подключитесь к серверу по SSH и поставьте Node 22 LTS:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

Проверьте версию — должна быть 22.5 или выше:

```bash
node -v
```

Если версия старее, сайт откажется запускаться и честно скажет почему.

## 2. Файлы сайта

Заведите отдельного пользователя — так сайт не сможет ничего сломать в системе:

```bash
sudo adduser --system --group --home /var/www/klever klever
```

Скопируйте папку проекта в `/var/www/klever` (например, `scp` с ноутбука или
`git clone`, если проект в репозитории). Копировать нужно всё, кроме
`server/klever.db*`, `server/backups/` и `node_modules` — базу сервер создаст
сам. Затем отдайте файлы новому пользователю:

```bash
sudo chown -R klever:klever /var/www/klever
```

## 3. Первый запуск руками

Прежде чем настраивать автозапуск, убедитесь, что всё работает:

```bash
sudo -u klever ADMIN_PASSWORD='придумайте-длинный-пароль' node /var/www/klever/server/server.js
```

Сервер напечатает адреса и создаст базу. Остановите его через `Ctrl+C`.

Пароль задаётся **только один раз** — при создании пустой базы. Дальше он живёт
в базе, и переменная `ADMIN_PASSWORD` ни на что не влияет.

## 4. Автозапуск (systemd)

Чтобы сайт поднимался сам после перезагрузки и падений, создайте файл
`/etc/systemd/system/klever.service`:

```ini
[Unit]
Description=Клевер — магазин одежды
After=network.target

[Service]
Type=simple
User=klever
Group=klever
WorkingDirectory=/var/www/klever
ExecStart=/usr/bin/node /var/www/klever/server/server.js
Environment=PORT=8080
Environment=HOST=127.0.0.1
Environment=SECURE_COOKIES=1
Restart=always
RestartSec=3

# Сайту не нужен доступ никуда, кроме своей папки
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/www/klever/server /var/www/klever/uploads

[Install]
WantedBy=multi-user.target
```

`HOST=127.0.0.1` — важная строка: она закрывает сайт от прямого доступа
из интернета. Наружу его будет отдавать nginx, и только по HTTPS.

Включите и запустите:

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now klever && sudo systemctl status klever
```

## 5. nginx и HTTPS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Создайте `/etc/nginx/sites-available/klever` (замените `klever.ru` на свой домен):

```nginx
server {
    listen 80;
    server_name klever.ru www.klever.ru;

    # Фотографии и статику отдаём напрямую — быстрее, чем через Node
    location /uploads/ { root /var/www/klever; expires 1y; add_header Cache-Control "public, immutable"; }
    location /img/     { root /var/www/klever; expires 30d; }
    location /assets/  { root /var/www/klever; expires 10m; }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Фотография с телефона до сжатия бывает тяжёлой
    client_max_body_size 12M;
}
```

Заголовок `X-Forwarded-For` нужен, чтобы ограничения на перебор пароля и на
частоту заявок считались по адресу настоящего посетителя, а не по адресу nginx.

Включите сайт и выпустите сертификат:

```bash
sudo ln -s /etc/nginx/sites-available/klever /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

```bash
sudo certbot --nginx -d klever.ru -d www.klever.ru
```

Certbot сам перепишет конфиг под HTTPS и настроит продление. Откройте
`https://klever.ru/` — сайт на месте.

## 6. Что сделать сразу после

1. Зайдите в `https://klever.ru/admin.html`, смените пароль в «Настройках».
2. В «Данных» нажмите «Выгрузить файл» и сохраните его у себя — это точка,
   к которой можно вернуться.
3. Настройте почту о заказах («Настройки» → «Письма о заказах»), иначе
   про новый заказ вы узнаете, только зайдя в панель.

---

## Обновление сайта

```bash
sudo systemctl stop klever
```

Скопируйте новые файлы (базу и `uploads/` не трогайте), верните права
и запустите обратно:

```bash
sudo chown -R klever:klever /var/www/klever && sudo systemctl start klever
```

## Резервные копии

Сервер сам копирует базу раз в сутки в `server/backups/` и хранит две недели.
Это спасает от «удалил не тот товар», но не от потери сервера целиком.

Чтобы копии уезжали с машины, добавьте задание в cron (`sudo crontab -e`):

```bash
0 4 * * * tar czf /root/klever-$(date +\%F).tar.gz -C /var/www/klever server/klever.db uploads
```

и настройте выгрузку этих архивов туда, где вы их точно найдёте.

Восстановление: остановить сервис, положить нужный файл на место
`server/klever.db`, удалить `server/klever.db-wal` и `-shm`, запустить сервис.

## Забыли пароль от панели

Восстановить его нельзя — в базе лежит только отпечаток. Но можно задать новый:

```bash
sudo systemctl stop klever
sudo -u klever node --no-warnings -e "
  const db = require('/var/www/klever/server/db');
  const auth = require('/var/www/klever/server/auth');
  db.open('/var/www/klever/server/klever.db');
  auth.setPassword('новый-пароль');
  db.dropAllSessions();
  console.log('Готово. Пароль изменён.');
"
sudo systemctl start klever
```

## Что смотреть, если что-то пошло не так

```bash
sudo journalctl -u klever -n 50 --no-pager
```

Сервер пишет туда и ошибки, и строку про каждую новую заявку.

| Симптом | Обычная причина |
|---|---|
| Пустой сайт с полосой «временно недоступен» | сервис не запущен — `systemctl status klever` |
| «Нужен Node.js 22.5 или новее» | старый Node, см. шаг 1 |
| Не входит в панель, «Слишком много попыток» | сработала защита от перебора, подождите 15 минут |
| Фото не загружается, «Слишком большой запрос» | поднимите `client_max_body_size` в nginx |
| Вход слетает при каждом переходе | нет `SECURE_COOKIES=1` при HTTPS или не передаётся `X-Forwarded-Proto` |

---

## Если Node на хостинге поставить нельзя

SQLite требует постоянно работающего процесса. На хостинге, где есть только
раздача статики (GitHub Pages, Netlify без функций), этот сервер не заработает —
там нужен либо VPS, либо внешняя база вроде Supabase, и это уже другая работа.
