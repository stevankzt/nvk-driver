# Dockerfile для NVK-Driver приложения
FROM node:18-alpine

# Установка рабочей директории
WORKDIR /app

# Копирование package.json
COPY package.json ./

# Установка зависимостей
RUN npm install --omit=dev

# Копирование исходного кода
COPY ./backend ./backend
COPY ./public ./public

# Создание директории для базы данных
RUN mkdir -p /app/data

# Установка прав
RUN chown -R node:node /app

# Переключение на непривилегированного пользователя
USER node

# Открытие порта
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Запуск приложения
CMD ["node", "backend/server.js"]
