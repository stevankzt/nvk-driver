#!/bin/bash

# Скрипт для первоначальной настройки SSL сертификатов
# Использование: ./init-letsencrypt.sh your-domain.com stevankzt@gmail.com

DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Usage: ./init-letsencrypt.sh nvk-driver.ru stevankzt@gmail.com"
    exit 1
fi

echo "### Инициализация SSL сертификата для домена: $DOMAIN"

# Создание необходимых директорий
mkdir -p certbot/conf
mkdir -p certbot/www

# Обновление nginx.conf с правильным доменом
sed -i "s/your-domain.com/$DOMAIN/g" nginx.conf

# Получение dummy сертификата для первоначального запуска nginx
echo "### Создание временного сертификата..."
docker-compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:2048 -days 1\
    -keyout '/etc/letsencrypt/live/$DOMAIN/privkey.pem' \
    -out '/etc/letsencrypt/live/$DOMAIN/fullchain.pem' \
    -subj '/CN=localhost'" certbot

echo "### Запуск nginx..."
docker-compose up -d nginx

echo "### Удаление временного сертификата..."
docker-compose run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/$DOMAIN && \
  rm -rf /etc/letsencrypt/archive/$DOMAIN && \
  rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

echo "### Получение настоящего SSL сертификата от Let's Encrypt..."
docker-compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN" certbot

echo "### Перезапуск nginx..."
docker-compose restart nginx

echo "### Готово! SSL сертификат успешно установлен для домена: $DOMAIN"
