# Деплой на изолированный Linux сервер (ЕТС РК)

Инструкция для развёртывания приложения на Linux сервере во внутренней сети **без доступа к интернету**.

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│              Linux Server (ЕТС РК)                  │
├─────────────────────────────────────────────────────┤
│  ┌──────────────┐       ┌──────────────────────┐    │
│  │  PostgreSQL  │◄─────►│   Node.js App        │    │
│  │  (порт 5432) │       │   (порт 80)          │    │
│  └──────────────┘       └──────────────────────┘    │
│                                                     │
│  📁 /opt/forms/uploads/ - загруженные файлы        │
│  📁 /var/lib/postgresql/data/ - данные БД          │
└─────────────────────────────────────────────────────┘
```

---

## Вариант 1: Docker (Рекомендуется)

### Шаг 1: Подготовка на рабочем компьютере

**На вашем компьютере с интернетом** выполните:

```powershell
# 1. Скачайте Docker образы и сохраните в архивы
docker pull node:18-alpine
docker pull postgres:15-alpine

docker save node:18-alpine -o node-alpine.tar
docker save postgres:15-alpine -o postgres-alpine.tar

# 2. Запакуйте проект
# Удалите node_modules если есть
Remove-Item -Recurse -Force .\node_modules -ErrorAction SilentlyContinue

# Создайте архив
Compress-Archive -Path .\* -DestinationPath form-project.zip
```

Перенесите на Linux сервер:
- `node-alpine.tar`
- `postgres-alpine.tar`  
- `form-project.zip`

### Шаг 2: Установка Docker на сервере (если нет)

Если Docker уже установлен - пропустите этот шаг.

**Для RHEL/CentOS (офлайн):**
```bash
# Скачайте RPM пакеты на компьютере с интернетом и перенесите:
# docker-ce, docker-ce-cli, containerd.io, docker-compose-plugin

sudo yum localinstall ./docker-*.rpm
sudo systemctl start docker
sudo systemctl enable docker
```

**Для Ubuntu/Debian (офлайн):**
```bash
sudo dpkg -i ./docker-*.deb
sudo systemctl start docker
sudo systemctl enable docker
```

### Шаг 3: Загрузка образов на сервере

```bash
# Загружаем образы из архивов
sudo docker load -i node-alpine.tar
sudo docker load -i postgres-alpine.tar

# Проверяем
sudo docker images
```

### Шаг 4: Разворачивание проекта

```bash
# Создаём директорию
sudo mkdir -p /opt/forms
cd /opt/forms

# Распаковываем проект
sudo unzip /path/to/form-project.zip -d .

# Устанавливаем права
sudo chown -R $USER:$USER /opt/forms

# Собираем и запускаем
sudo docker compose build
sudo docker compose up -d

# Проверяем статус
sudo docker compose ps
sudo docker compose logs -f app
```

### Шаг 5: Проверка работы

```bash
# Проверяем порты
sudo ss -tulpn | grep -E '(80|5432)'

# Проверяем логи
sudo docker compose logs app
sudo docker compose logs db

# Тестируем подключение
curl http://localhost/api/user/profile
```

### Управление

```bash
# Остановить
sudo docker compose down

# Перезапустить
sudo docker compose restart

# Посмотреть логи
sudo docker compose logs -f

# Войти в контейнер БД
sudo docker compose exec db psql -U forms_user -d forms_db

# Бэкап базы данных
sudo docker compose exec db pg_dump -U forms_user forms_db > backup_$(date +%Y%m%d).sql

# Восстановление из бэкапа
cat backup.sql | sudo docker compose exec -T db psql -U forms_user -d forms_db
```

---

## Вариант 2: Без Docker (нативная установка)

### Шаг 1: Установка PostgreSQL

```bash
# RHEL/CentOS
sudo yum install postgresql15-server postgresql15

# Ubuntu/Debian  
sudo apt install postgresql postgresql-contrib

# Инициализация БД
sudo postgresql-setup --initdb   # CentOS/RHEL
# или
sudo pg_ctlcluster 15 main start # Ubuntu/Debian

sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Шаг 2: Настройка PostgreSQL

```bash
# Входим как postgres
sudo -u postgres psql

# Создаём БД и пользователя
CREATE DATABASE forms_db;
CREATE USER forms_user WITH ENCRYPTED PASSWORD 'forms_secure_password_2026';
GRANT ALL PRIVILEGES ON DATABASE forms_db TO forms_user;
\c forms_db
GRANT ALL ON SCHEMA public TO forms_user;
\q
```

### Шаг 3: Импорт схемы БД

```bash
# Находясь в директории проекта
sudo -u postgres psql -d forms_db -f init.sql
```

### Шаг 4: Установка Node.js (офлайн)

**На компьютере с интернетом:**
```bash
# Скачайте бинарник Node.js
# https://nodejs.org/dist/v18.19.0/node-v18.19.0-linux-x64.tar.xz
```

**На сервере:**
```bash
# Распаковываем Node.js
sudo tar -xf node-v18.19.0-linux-x64.tar.xz -C /opt/
sudo ln -s /opt/node-v18.19.0-linux-x64/bin/node /usr/local/bin/node
sudo ln -s /opt/node-v18.19.0-linux-x64/bin/npm /usr/local/bin/npm

# Проверяем
node --version
npm --version
```

### Шаг 5: Подготовка зависимостей (офлайн)

**На компьютере с интернетом:**
```powershell
cd C:\Users\a.zhartanov\Desktop\projects\form

# Устанавливаем pg модуль
npm install pg

# Упаковываем зависимости
npm pack
# Для каждой зависимости нужно скачать её .tgz файл
```

**Или проще - скопируйте весь `node_modules` с рабочего компьютера:**
```powershell
npm install
# Потом включите node_modules в архив
```

### Шаг 6: Настройка приложения

```bash
# Копируем проект
sudo mkdir -p /opt/forms
sudo cp -r /path/to/form-project/* /opt/forms/

# Создаём файл окружения
sudo nano /opt/forms/.env
```

Содержимое `.env`:
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://forms_user:forms_secure_password_2026@localhost:5432/forms_db
UPLOADS_DIR=/opt/forms/uploads
```

### Шаг 7: Создание systemd сервиса

```bash
sudo nano /etc/systemd/system/forms-app.service
```

Содержимое:
```ini
[Unit]
Description=Forms MTSZN Application
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/forms
EnvironmentFile=/opt/forms/.env
ExecStart=/usr/local/bin/node /opt/forms/server/server-postgres.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Шаг 8: Запуск сервиса

```bash
# Создаём директорию для загрузок
sudo mkdir -p /opt/forms/uploads
sudo chmod 755 /opt/forms/uploads

# Запускаем
sudo systemctl daemon-reload
sudo systemctl start forms-app
sudo systemctl enable forms-app

# Проверяем
sudo systemctl status forms-app
sudo journalctl -u forms-app -f
```

### Шаг 9: Настройка nginx (опционально, для 80 порта)

```bash
sudo yum install nginx  # CentOS
# или
sudo apt install nginx  # Ubuntu

sudo nano /etc/nginx/conf.d/forms.conf
```

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Доступ к сайту

После успешного развёртывания сайт будет доступен по адресу:

```
http://<IP-АДРЕС-СЕРВЕРА>/
```

**Логин и пароль:**
- Админ: `admin` / `admin`
- Админ 2 (планы): `admin2` / `admin2`

---

## Устранение проблем

### Проблема: Не подключается к БД

```bash
# Проверьте статус PostgreSQL
sudo systemctl status postgresql

# Проверьте логи
sudo docker compose logs db  # Docker
sudo journalctl -u postgresql  # Native

# Проверьте подключение
psql -h localhost -U forms_user -d forms_db
```

### Проблема: Порт 80 занят

```bash
# Узнаём что занимает порт
sudo ss -tulpn | grep :80

# В docker-compose.yml поменяйте порт:
ports:
  - "8080:3000"  # Будет доступен на порту 8080
```

### Проблема: Права на файлы

```bash
sudo chown -R 1000:1000 /opt/forms/uploads
sudo chmod -R 755 /opt/forms/uploads
```

### Бэкап и восстановление

```bash
# Docker: бэкап
sudo docker compose exec db pg_dump -U forms_user forms_db > backup.sql

# Docker: восстановление
cat backup.sql | sudo docker compose exec -T db psql -U forms_user -d forms_db

# Native: бэкап
sudo -u postgres pg_dump forms_db > backup.sql

# Native: восстановление
sudo -u postgres psql forms_db < backup.sql
```

---

## Добавление пользователей

Для добавления региональных аккаунтов:

1. Войдите в админ-панель: `http://<IP>/admin`
2. Авторизуйтесь как `admin` / `admin`
3. Создайте пользователей через интерфейс

Или через SQL:

```sql
-- Подключаемся к БД
-- Docker: sudo docker compose exec db psql -U forms_user -d forms_db
-- Native: sudo -u postgres psql -d forms_db

-- Генерируем хеш пароля (замените YOUR_PASSWORD)
-- Используйте bcrypt.hash('YOUR_PASSWORD', 10) в Node.js

INSERT INTO users (id, username, email, password, full_name, organization, role, form_type)
VALUES (
    'user_id_here',
    'karaganda_trud',
    'karaganda_trud@mtszn.kz',
    '$2a$10$BCRYPT_HASH_HERE',
    'Инспекция труда Карагандинской области',
    'Департамент инспекции труда по Карагандинской области',
    'user',
    'standard'
);
```

---

## Контакты

При возникновении проблем обращайтесь к разработчику.
