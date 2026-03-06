FROM node:18-alpine

# Установка рабочей директории
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем весь проект
COPY . .

# Создаём директорию для загруженных файлов
RUN mkdir -p /app/uploads && chmod 755 /app/uploads

# Создаём директорию uploads в server (для совместимости)
RUN mkdir -p /app/server/uploads && chmod 755 /app/server/uploads

# Порт приложения
EXPOSE 3000

# Запуск приложения
CMD ["node", "server/server-postgres.js"]
