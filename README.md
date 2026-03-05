# Система форм отчетности МТСЗН РК v2.0

Веб-приложение для заполнения и управления формами отчетности Министерства труда и социальной защиты населения Республики Казахстан.

## 🚀 Возможности

- ✅ **Авторизация пользователей** - JWT токены, регистрация/вход
- ✅ **4 формы отчетности** - заполнение онлайн с динамическими таблицами
- ✅ **Генерация DOCX** - автоматическое создание Word документов
- ✅ **База данных PostgreSQL** - надежное хранение данных
- ✅ **Админ-панель** - просмотр, скачивание и удаление документов
- ✅ **Журнал аудита** - отслеживание действий пользователей
- ✅ **Docker контейнеризация** - простое развертывание

## 📋 Требования

- Docker >= 20.10
- Docker Compose >= 2.0
- Node.js >= 18 (для локальной разработки)
- PostgreSQL >= 15 (если запуск без Docker)

## 🐳 Быстрый старт с Docker

### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd form
```

### 2. Настройка переменных окружения

Скопируйте файл с примером и отредактируйте при необходимости:

```bash
cp .env.example .env
```

⚠️ **ВАЖНО:** В production обязательно измените:
- `JWT_SECRET` - секретный ключ для JWT
- `DB_PASSWORD` - пароль базы данных
- `ADMIN_PASS` - пароль администратора

### 3. Запуск с Docker Compose

```bash
# Сборка и запуск
docker-compose up -d

# Просмотр логов
docker-compose logs -f app

# Остановка
docker-compose down
```

Приложение будет доступно по адресу: **http://localhost:3000**

### 4. Первый вход

**Администратор по умолчанию:**
- Email: `admin@mtszn.kz`
- Пароль: `admin123`

⚠️ **Обязательно смените пароль после первого входа!**

## 💻 Локальная разработка (без Docker)

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка PostgreSQL

Создайте базу данных и пользователя:

```sql
CREATE DATABASE forms_db;
CREATE USER forms_user WITH PASSWORD 'forms_password_2024';
GRANT ALL PRIVILEGES ON DATABASE forms_db TO forms_user;
```

Выполните инициализационный скрипт:

```bash
psql -U forms_user -d forms_db -f init.sql
```

### 3. Настройка переменных окружения

Создайте файл `.env`:

```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=forms_db
DB_USER=forms_user
DB_PASSWORD=forms_password_2024
JWT_SECRET=your_secret_key
ADMIN_USER=admin
ADMIN_PASS=admin123
```

### 4. Запуск

```bash
# Режим разработки (с автоперезагрузкой)
npm run dev

# Обычный запуск
npm start
```

## 📁 Структура проекта

```
form/
├── server/
│   ├── server.js           # Новый сервер с PostgreSQL
│   ├── db.js               # Модуль работы с БД
│   ├── auth.js             # Модуль авторизации
│   ├── uploads/            # Загруженные документы
│   └── documents.json      # Старая БД (не используется)
├── index.html              # Главная страница с формами
├── login.html              # Страница входа/регистрации
├── admin-new.html          # Обновленная админ-панель
├── script.js               # Логика форм
├── docx-generator.js       # Генератор DOCX документов
├── styles.css              # Стили
├── docker-compose.yml      # Конфигурация Docker
├── Dockerfile              # Docker образ приложения
├── init.sql                # Инициализация БД
├── package.json            # Зависимости Node.js
└── README.md               # Документация
```

## 🔐 Безопасность

### JWT Токены

- **Access Token:** действует 15 минут
- **Refresh Token:** действует 7 дней, хранится в БД

### Защита

- Bcrypt для хеширования паролей (10 раундов)
- Rate limiting для предотвращения брутфорса
- Валидация всех входных данных
- Журнал аудита всех действий

### Рекомендации

1. Используйте сильные пароли
2. Регулярно обновляйте зависимости: `npm audit fix`
3. Настройте HTTPS для production
4. Регулярно делайте бэкапы БД

## 🗄️ База данных

### Таблицы

- **users** - пользователи системы
- **sessions** - активные сессии (refresh токены)
- **documents** - загруженные документы
- **audit_log** - журнал действий

### Бэкап БД

```bash
# Создание бэкапа
docker exec forms_postgres pg_dump -U forms_user forms_db > backup.sql

# Восстановление из бэкапа
docker exec -i forms_postgres psql -U forms_user forms_db < backup.sql
```

## 📝 API Endpoints

### Публичные (без авторизации)

- `POST /api/auth/register` - Регистрация
- `POST /api/auth/login` - Вход
- `POST /api/auth/refresh` - Обновление токена
- `POST /api/auth/logout` - Выход

### Защищенные (требуется авторизация)

- `GET /api/user/profile` - Профиль пользователя
- `GET /api/documents` - Список документов
- `POST /api/documents/upload` - Загрузка документа
- `GET /api/documents/:id/download` - Скачивание документа
- `GET /api/stats` - Статистика

### Только для админа

- `DELETE /api/documents/:id` - Удаление документа
- `GET /api/admin/users` - Список пользователей
- `GET /api/admin/audit-log` - Журнал аудита

## 🛠️ Скрипты

```bash
# Запуск приложения
npm start

# Разработка с автоперезагрузкой
npm run dev

# Docker команды
npm run docker:build    # Сборка образа
npm run docker:up       # Запуск контейнеров
npm run docker:down     # Остановка контейнеров
npm run docker:logs     # Просмотр логов
```

## 🚀 Деплой на Linux сервер

### Шаг 1: Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Установка Docker Compose
sudo apt install docker-compose-plugin -y

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER
```

### Шаг 2: Загрузка проекта

```bash
# Клонирование репозитория
git clone <repository-url> /opt/mtszn-forms
cd /opt/mtszn-forms

# Настройка прав
sudo chown -R $USER:$USER /opt/mtszn-forms
```

### Шаг 3: Конфигурация

Создайте `.env` с production настройками:

```bash
nano .env
```

### Шаг 4: Запуск

```bash
# Сборка и запуск
docker-compose up -d

# Проверка статуса
docker-compose ps
docker-compose logs -f app
```

### Шаг 5: Настройка Nginx (опционально)

Для работы через домен с HTTPS:

```nginx
server {
    listen 80;
    server_name your-domain.kz;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Установка SSL с Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.kz
```

### Шаг 6: Автозапуск

Создайте systemd сервис для автозапуска:

```bash
sudo nano /etc/systemd/system/mtszn-forms.service
```

Содержимое:

```ini
[Unit]
Description=MTSZN Forms Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/mtszn-forms
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Активация:

```bash
sudo systemctl enable mtszn-forms
sudo systemctl start mtszn-forms
```

## 📊 Мониторинг

### Просмотр логов

```bash
# Логи приложения
docker-compose logs -f app

# Логи PostgreSQL
docker-compose logs -f postgres

# Последние 100 строк
docker-compose logs --tail=100 app
```

### Статистика контейнеров

```bash
docker stats
```

### Проверка здоровья

```bash
# Проверка доступности
curl http://localhost:3000

# Проверка БД
docker exec forms_postgres psql -U forms_user -d forms_db -c "SELECT COUNT(*) FROM documents;"
```

## 🐛 Устранение неполадок

### Приложение не запускается

```bash
# Проверка логов
docker-compose logs app

# Проверка подключения к БД
docker-compose logs postgres
```

### БД недоступна

```bash
# Перезапуск контейнера БД
docker-compose restart postgres

# Проверка здоровья БД
docker exec forms_postgres pg_isready -U forms_user
```

### Ошибки авторизации

- Проверьте правильность JWT_SECRET в `.env`
- Убедитесь, что токены не истекли
- Очистите localStorage в браузере

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи: `docker-compose logs -f`
2. Убедитесь, что все контейнеры запущены: `docker-compose ps`
3. Проверьте настройки в `.env`

## 📄 Лицензия

MIT License

## 👥 Автор

Разработано для Министерства труда и социальной защиты населения Республики Казахстан

---

**Версия:** 2.0.0  
**Дата:** 2026  
**Node.js:** >=18.0.0  
**PostgreSQL:** 15+
