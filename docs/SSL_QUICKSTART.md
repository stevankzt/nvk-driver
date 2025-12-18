# 🔐 Быстрая настройка SSL

## Шаг 1: Запуск без HTTPS

```bash
# Остановить все контейнеры
docker-compose down

# Создать директории
mkdir -p certbot/www certbot/conf

# Запустить (HTTPS блок уже закомментирован)
docker-compose up -d

# Проверить что всё работает
curl http://nvk-driver.ru/health
```

## Шаг 2: Получение SSL сертификата

```bash
# Получить сертификат от Let's Encrypt
docker-compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email stevankzt@gmail.com \
  --agree-tos \
  --no-eff-email \
  -d nvk-driver.ru

# Если успешно, увидите:
# Successfully received certificate.
# Certificate is saved at: /etc/letsencrypt/live/nvk-driver.ru/fullchain.pem
```

## Шаг 3: Включение HTTPS

Раскомментируйте HTTPS блок в `docker/nginx.conf`:

```nginx
# Перенаправление с HTTP на HTTPS
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS сервер
server {
    listen 443 ssl;
    http2 on;
    server_name _;

    ssl_certificate /etc/letsencrypt/live/nvk-driver.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nvk-driver.ru/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://nvk-driver:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://nvk-driver:3000;
        proxy_cache_valid 200 1d;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
}
```

## Шаг 4: Перезапуск

```bash
# Перезапустить nginx с новой конфигурацией
docker-compose restart nginx

# Проверить HTTPS
curl -I https://nvk-driver.ru
```

## Готово! ✅

Теперь:
- HTTP запросы редиректятся на HTTPS
- Сертификат автоматически обновляется каждые 12 часов
- Ваш сайт доступен по https://nvk-driver.ru
