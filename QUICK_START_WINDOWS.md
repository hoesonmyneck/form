# 🚀 Быстрый старт на Windows (БЕЗ Docker)

## Текущая ситуация

Docker не установлен на вашей Windows машине. **Это нормально!**

Docker нужен только для деплоя на Linux сервер. Для локального тестирования и разработки можно запустить проект без Docker.

## Два варианта запуска

### Вариант 1: С PostgreSQL (полная версия) 

Требуется установка PostgreSQL на Windows.

**Установка PostgreSQL:**

1. Скачайте PostgreSQL 15: https://www.postgresql.org/download/windows/
2. Установите с настройками по умолчанию
3. Запомните пароль для пользователя `postgres`

**Настройка БД:**

```powershell
# Подключитесь к PostgreSQL
psql -U postgres

# Создайте БД и пользователя
CREATE DATABASE forms_db;
CREATE USER forms_user WITH PASSWORD 'forms_password_2024';
GRANT ALL PRIVILEGES ON DATABASE forms_db TO forms_user;
\q

# Инициализируйте схему
psql -U forms_user -d forms_db -f init.sql
```

**Запуск приложения:**

```powershell
# Создайте .env файл
Copy-Item .env.example .env

# Отредактируйте .env (если нужно)
notepad .env

# Запустите сервер
npm start
```

Откройте: **http://localhost:3000**

---

### Вариант 2: Без PostgreSQL (упрощенная версия) ⭐ РЕКОМЕНДУЮ

Используем старую версию сервера с JSON файлом для тестирования форм и фронтенда.

**Шаги:**

1. **Вернитесь к старой версии (временно):**

```powershell
# Переименуйте файлы обратно
Rename-Item -Path "server\server.js" -NewName "server-new-temp.js"
Rename-Item -Path "server\server-old.js" -NewName "server.js"
Rename-Item -Path "admin.html" -NewName "admin-new-temp.html"
Rename-Item -Path "admin-old.html" -NewName "admin.html"
```

2. **Запустите старый сервер:**

```powershell
npm start
```

3. **Откройте в браузере:**

http://localhost:3000

4. **Протестируйте формы:**
   - Заполните формы
   - Скачайте DOCX
   - Проверьте админ-панель (admin / admin123)

5. **После тестирования вернитесь к новой версии:**

```powershell
# Остановите сервер (Ctrl+C)

# Вернитесь к новой версии
Rename-Item -Path "server\server.js" -NewName "server-old.js" -Force
Rename-Item -Path "server\server-new-temp.js" -NewName "server.js" -Force
Rename-Item -Path "admin.html" -NewName "admin-old.html" -Force
Rename-Item -Path "admin-new-temp.html" -NewName "admin.html" -Force
```

---

## Вариант 3: Деплой на Linux сервер (production)

Для production деплоя на Linux сервере:

1. **Скопируйте проект на Linux сервер:**

```bash
# На Linux сервере
git clone <your-repo> /opt/mtszn-forms
cd /opt/mtszn-forms
```

2. **Установите Docker на Linux:**

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt install docker-compose-plugin -y
```

3. **Создайте .env:**

```bash
cp .env.example .env
nano .env  # отредактируйте
```

4. **Запустите:**

```bash
docker compose up -d
```

5. **Проверьте:**

```bash
docker compose ps
docker compose logs -f app
```

---

## Текущее состояние проекта

### ✅ Что работает СЕЙЧАС (без Docker):

Старая версия с JSON файлом:
- ✅ Все 4 формы
- ✅ Генерация DOCX
- ✅ Админ-панель (Basic Auth)
- ✅ Сохранение в JSON файл

**Запуск:**
```powershell
npm start
```

Откройте: http://localhost:3000

### 🚀 Что готово для production (с Docker):

Новая версия с PostgreSQL:
- ✅ PostgreSQL база данных
- ✅ JWT авторизация
- ✅ REST API
- ✅ Журнал аудита
- ✅ Docker контейнеризация

**Деплой на Linux сервере:**
```bash
docker compose up -d
```

---

## Рекомендация

**Для локального тестирования (Windows без Docker):**
- Используйте **Вариант 2** (старая версия с JSON)
- Протестируйте формы, генерацию DOCX
- Убедитесь, что всё работает

**Для production (Linux сервер):**
- Используйте **новую версию с Docker**
- Полная функциональность с PostgreSQL и JWT

---

## Быстрый тест (СЕЙЧАС)

```powershell
# Если сервер не запущен
npm start

# Если порт 3000 занят, измените в server/server.js:
# const PORT = process.env.PORT || 3001;
```

Откройте: **http://localhost:3000**

1. Заполните любую форму
2. Нажмите "Скачать текущую форму"
3. Проверьте, что DOCX сгенерировался корректно
4. Нажмите "Сохранить"
5. Откройте админ-панель: http://localhost:3000/admin
   - Логин: `admin`
   - Пароль: `admin123`
6. Проверьте список документов

---

## Проблемы и решения

### Проблема: bcrypt не устанавливается

**Решение:** ✅ УЖЕ ИСПРАВЛЕНО - заменен на `bcryptjs`

### Проблема: Docker не установлен

**Решение:** Не нужен для локального тестирования. Используйте Вариант 2.

### Проблема: PostgreSQL не установлен

**Решение:** Используйте Вариант 2 (старая версия) или установите PostgreSQL.

### Проблема: Порт 3000 занят

**Решение:** Измените порт в `server/server.js`:
```javascript
const PORT = process.env.PORT || 3001;
```

---

## Что дальше?

1. **Протестируйте на Windows** (Вариант 2)
2. **Задеплойте на Linux сервер** с Docker
3. **Наслаждайтесь** работой системы! 🎉

---

**Дата:** 10 февраля 2026  
**Версия:** 2.0.0  
**Платформа:** Windows (локальная разработка)
