# 🔒 Настройка HTTPS с Nginx и Let's Encrypt

## Автоматическая настройка SSL (рекомендуется)

### Для Linux/Mac

```bash
# Сделать скрипт исполняемым
chmod +x init-letsencrypt.sh

# Запустить инициализацию SSL
./init-letsencrypt.sh nvk-driver.ru admin@nvk-driver.ru
```

### Для Windows (PowerShell)

Выполните команды вручную:

```powershell
# 1. Создать директории для сертификатов
New-Item -ItemType Directory -Force -Path certbot/conf
New-Item -ItemType Directory -Force -Path certbot/www

# 2. Обновить nginx.conf (домен уже установлен: nvk-driver.ru)

# 3. Создать временный self-signed сертификат
docker-compose run --rm --entrypoint "openssl req -x509 -nodes -newkey rsa:2048 -days 1 -keyout '/etc/letsencrypt/live/nvk-driver.ru/privkey.pem' -out '/etc/letsencrypt/live/nvk-driver.ru/fullchain.pem' -subj '/CN=localhost'" certbot

# 4. Запустить nginx
docker-compose up -d nginx

# 5. Удалить временный сертификат
docker-compose run --rm --entrypoint "rm -rf /etc/letsencrypt/live/ваш-домен.com && rm -rf /etc/letsencrypt/archive/ваш-домен.com && rm -rf /etc/letsencrypt/renewal/ваш-домен.com.conf" certbot
nvk-driver.ru && rm -rf /etc/letsencrypt/archive/nvk-driver.ru && rm -rf /etc/letsencrypt/renewal/nvk-driver.ru.conf" certbot

# 6. Получить настоящий сертификат от Let's Encrypt
docker-compose run --rm --entrypoint "certbot certonly --webroot -w /var/www/certbot --email admin@nvk-driver.ru --agree-tos --no-eff-email -d nvk-driver.ru
# 7. Перезапустить nginx
docker-compose restart nginx
```

## Ручная настройка SSL

### 1. Подготовка

```bash
# Создать директории
mkdir -p certbot/conf
mkdir -p certbot/www

# Домен уже настроен в nginx.conf: nvk-driver.ru
```

### 2. Запуск без SSL (только HTTP)

Временно закомментируйте HTTPS блок в `nginx.conf`:

```nginx
# Закомментируйте весь блок server { listen 443 ssl http2; ... }
```

Запустите сервисы:

```bash
docker-compose up -d
```

### 3. Получение SSL сертификата

```bash
# Получить сертификат от Let's Encrypt
docker-compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email ваш-email@example.com \
  --agree-tos \
  --no-effadmin@nvk-driver.ru \
  --agree-tos \
  --no-eff-email \
  -d nvk-driver.ru
### 4. Включение HTTPS

Раскомментируйте HTTPS блок в `nginx.conf` и перезапустите:

```bash
docker-compose restart nginx
```

## Проверка статуса SSL

```bash
# Проверить статус сертификата
docker-compose run --rm certbot certificates

# Проверить автообновление
docker-compose run --rm certbot renew --dry-run

# Просмотр логов nginx
docker-compose logs nginx

# Тест HTTPS соединения
curl -I https://ваш-домен.com
```
nvk-driver.ru
## Автоматическое обновление сертификатов

Certbot контейнер автоматически обновляет сертификаты каждые 12 часов. Сертификаты Let's Encrypt действительны 90 дней и обновляются за 30 дней до истечения.

Проверить логи обновления:

```bash
docker-compose logs certbot
```

## Самоподписанный сертификат для тестирования

Если у вас нет домена или вы хотите протестировать локально:

```bash
# Создать self-signed сертификат (только для локального тестирования)
mkdir -p certbot/conf/live/localhost

docker run --rm -v $(pwd)/certbot/conf:/etc/letsencrypt \
  nginx:alpine sh -c "openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/letsencrypt/live/localhost/privkey.pem \
  -out /etc/letsencrypt/live/localhost/fullchain.pem \
  -subj '/CN=localhost'"

# Временно замените nvk-driver.ru на localhost в nginx.conf
# Перезапустить
docker-compose restart nginx
```

⚠️ **Важно**: Браузеры будут показывать предупреждение о небезопасном соединении при использовании self-signed сертификатов.

## Настройка DNS

Для получения сертификата от Let's Encrypt ваш домен должен указывать на IP сервера:

```bash
# Проверить DNS запись
dig nvk-driver.ru +short
nslookup nvk-driver.ru
```

Убедитесь, что A-запись домена указывает на публичный IP вашего сервера.

## Настройка Telegram Bot

После получения SSL сертификата обновите переменные окружения:

```bash
# В .env файле
APP_URL=https://nvk-driver.ru
```

Перезапустите приложение:

```bash
docker-compose restart nvk-driver
```

Telegram автоматически установит webhook на новый HTTPS URL.

## Troubleshooting

### Ошибка "Challenge failed"

Убедитесь что:
- Порт 80 открыт в файерволе
- DNS запись указывает на правильный IP
- Nginx запущен и доступен по HTTP

```bash
# Проверка доступности
curl http://nvk-driver.ru/.well-known/acme-challenge/test
```

### Ошибка "nginx: [emerg] cannot load certificate"

Сначала получите сертификат или используйте временный self-signed:

```bash
./init-letsencrypt.sh nvk-driver.ru admin@nvk-driver.ru
```

### Сертификат не обновляется автоматически

Проверьте логи certbot:

```bash
docker-compose logs certbot
```

Принудительное обновление:

```bash
docker-compose run --rm certbot renew --force-renewal
docker-compose restart nginx
```

## Полезные команды

```bash
# Полная перезагрузка с пересборкой
docker-compose down
docker-compose up -d --build

# Просмотр всех логов
docker-compose logs -f

# Проверка конфигурации nginx
docker-compose exec nginx nginx -t

# Перезагрузка конфигурации nginx без даунтайма
docker-compose exec nginx nginx -s reload

# Информация о сертификате
openssl s_client -connect nvk-driver.ru:443 -servername nvk-driver.ru < /dev/null 2>/dev/null | openssl x509 -noout -dates
```

## Структура файлов после настройки

```
project/
├── certbot/
│   ├── conf/
│   │   ├── live/
│   │   │   └── nvk-driver.ru/
│   │   │       ├── fullchain.pem
│   │   │       └── privkey.pem
│   │   └── renewal/
│   └── www/
├── nginx.conf
├── docker-compose.yml
└── init-letsencrypt.sh
```

## Безопасность

Рекомендации:
- Используйте сильные SSL настройки (уже настроены в nginx.conf)
- Регулярно обновляйте Docker образы
- Мониторьте срок действия сертификатов
- Используйте HSTS (уже включен)
- Настройте файервол (только 80, 443 порты)

```bash
# Пример настройки UFW файервола
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```
