# Как поставить «Клевер» на сервер

Пошагово, без предположений о том, что вы уже что-то знаете. Всё, что нужно, —
VPS с Ubuntu 24.04 (подойдёт самый дешёвый: 1 ядро, 1 ГБ памяти) и домен.

Сервер «Клевера» не тянет ни одной внешней библиотеки: SQLite встроен в Node
начиная с версии 22.5. Поэтому `npm install` делать не нужно — его нечего
устанавливать.

---

## 1. Node.js

Сначала посмотрите, что предлагает сам дистрибутив:

```bash
apt-cache policy nodejs | head -3
```

На Ubuntu 26.04 в штатном репозитории лежит Node 22.22 — этого достаточно,
и ставится он одной командой:

```bash
sudo apt update && sudo apt install -y nodejs
```

Если версия в репозитории старее 22.5 (например, на Ubuntu 24.04 там Node 18),
подключите репозиторий NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

Проверьте, что встроенный SQLite на месте — от него зависит вся база:

```bash
node --no-warnings -e "require('node:sqlite'); console.log('node:sqlite работает')"
```

Если версия старее 22.5, сайт откажется запускаться и честно скажет почему.

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

## 6. Защита сервера

Три меры, которые стоит включить до того, как на сервере появятся заявки
покупателей. Вход по паролю при этом сохраняется — просто подбирать его
становится бессмысленно.

**Задержки и штрафы в sshd.** Создайте `/etc/ssh/sshd_config.d/70-klever.conf`:

```
MaxAuthTries 3
LoginGraceTime 30
PerSourcePenalties authfail:10s noauth:5s grace-exceeded:20s crash:120s refuseconnection:30s min:30s max:30m
```

`PerSourcePenalties` появился в OpenSSH 9.8: после неудачной попытки адрес
получает отказ в соединении на растущий срок, до получаса. Проверьте конфиг
и примените без разрыва текущей сессии:

```bash
sudo sshd -t && sudo systemctl reload ssh
```

**Пауза перед ответом «неверный пароль».** Без неё сервер отвечает мгновенно,
и перебор идёт со скоростью сети. Добавьте в `/etc/pam.d/sshd` перед строкой
`@include common-auth`:

```
auth optional pam_faildelay.so delay=4000000
```

**Бан за повторные попытки.** Создайте `/etc/fail2ban/jail.d/klever.local`:

```ini
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1
bantime  = 15m
findtime = 10m
maxretry = 4
bantime.increment = true
bantime.factor    = 2
bantime.maxtime   = 1d

[sshd]
enabled  = true
mode     = aggressive
maxretry = 4
```

```bash
sudo fail2ban-client -t && sudo systemctl restart fail2ban
```

Первый бан — 15 минут, каждый следующий вдвое дольше, потолок сутки.
Если забанили себя (четыре опечатки подряд), снять бан можно с консоли
хостера: `sudo fail2ban-client set sshd unbanip ВАШ_IP`.

**Firewall.** Порядок важен: сначала разрешить SSH, только потом включать.

```bash
sudo ufw default deny incoming && sudo ufw default allow outgoing
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw --force enable
```

Порт 80 нужен не только для сайта — без него certbot не выпустит сертификат.

**Автообновления безопасности.** Пакет `unattended-upgrades` обычно уже стоит,
осталось его включить:

```bash
sudo systemctl enable --now unattended-upgrades
```

## 7. Что сделать сразу после

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

Копию снимает сам SQLite (`VACUUM INTO`), поэтому она согласованная и включает
журнал. Обычным `cp` базу копировать нельзя: рядом с `klever.db` лежит журнал
`klever.db-wal`, куда попадает всё свежее, и файл базы сам по себе отстаёт —
иногда на всё содержимое сразу.

Чтобы копии уезжали с машины, добавьте задание в cron (`sudo crontab -e`).
Забираем готовые копии из `server/backups/`, а не сам файл базы:

```bash
0 4 * * * tar czf /root/klever-$(date +\%F).tar.gz -C /var/www/klever server/backups uploads
```

и настройте выгрузку этих архивов туда, где вы их точно найдёте.

Восстановление: остановить сервис, положить нужный файл на место
`server/klever.db`, удалить `server/klever.db-wal` и `-shm`, запустить сервис.

**Не подключайтесь к базе вторым соединением, пока сервер работает** —
ни `sqlite3 klever.db`, ни своим скриптом. Второе соединение при закрытии
решает, что оно последнее, сливает журнал и удаляет его; рабочий процесс
остаётся с файлом, которого больше нет в папке, и всё записанное дальше
живёт только в памяти ядра до ближайшей остановки. Смотреть данные надо
через API админки или по копии из `server/backups/`.

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
| SSH не пускает даже с верным паролем | fail2ban забанил адрес — `fail2ban-client status sshd` |
| Сайт открывается локально, но не снаружи | порт закрыт в ufw — `ufw status` |

---

## Если Node на хостинге поставить нельзя

SQLite требует постоянно работающего процесса. На хостинге, где есть только
раздача статики (GitHub Pages, Netlify без функций), этот сервер не заработает —
там нужен либо VPS, либо внешняя база вроде Supabase, и это уже другая работа.
