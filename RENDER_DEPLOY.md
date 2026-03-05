# 🚀 ПОШАГОВАЯ ИНСТРУКЦИЯ: Деплой на Render.com

## Шаг 1: Подготовка GitHub репозитория

1. **Убедитесь что все изменения закоммичены:**
```bash
git status
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

## Шаг 2: Создание PostgreSQL базы на Render

1. Войдите на https://render.com
2. Нажмите **"New +"** → **"PostgreSQL"**
3. Заполните форму:
   - **Name**: `mtszn-forms-db` (или любое имя)
   - **Database**: `forms_db`
   - **User**: (автоматически)
   - **Region**: выберите ближайший регион (Frankfurt или Stockholm для Европы)
   - **Plan**: **Free**
4. Нажмите **"Create Database"**
5. **ВАЖНО**: Скопируйте **Internal Database URL** (будет нужно для Web Service)

## Шаг 3: Инициализация базы данных

1. В разделе вашей базы на Render найдите **"Connect"**
2. Скопируйте **"PSQL Command"**
3. Откройте терминал на вашем компьютере и выполните эту команду (нужен psql клиент)
   
   **Или используйте веб-интерфейс:**
   - Зайдите в раздел **"Shell"** вашей базы на Render
   - Выполните SQL из файла `init.sql`:
     ```sql
     -- Скопируйте и вставьте содержимое init.sql
     ```

4. **Создайте админские аккаунты с хешированными паролями:**
   
   На вашем компьютере запустите:
   ```bash
   node -e "const bcrypt = require('bcryptjs'); console.log('admin:', bcrypt.hashSync('admin', 10)); console.log('admin2:', bcrypt.hashSync('admin2', 10));"
   ```
   
   Скопируйте хеши и обновите INSERT в базе данных.

## Шаг 4: Создание Web Service на Render

1. Нажмите **"New +"** → **"Web Service"**
2. Подключите ваш GitHub репозиторий
3. Заполните настройки:
   - **Name**: `mtszn-forms` (или любое имя)
   - **Region**: тот же что и база данных
   - **Branch**: `main`
   - **Runtime**: **Node**
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: **Free**

4. **Добавьте переменные окружения (Environment Variables):**
   - Нажмите **"Advanced"**
   - Добавьте переменные:
     ```
     DATABASE_URL = [Internal Database URL из шага 2]
     JWT_SECRET = [любая случайная строка, например: my-super-secret-jwt-key-2024]
     NODE_ENV = production
     PORT = 3000
     ```

5. Нажмите **"Create Web Service"**

## Шаг 5: Ожидание деплоя

Render автоматически:
1. Склонирует ваш репозиторий
2. Установит зависимости (`npm install`)
3. Запустит сервер (`npm start`)
4. Присвоит URL вида: `https://mtszn-forms.onrender.com`

**Процесс займет 2-5 минут.**

## Шаг 6: Проверка работы

1. Откройте URL вашего сервиса (будет на странице Web Service)
2. Перейдите на `/login.html`
3. Войдите с учетными данными: `admin / admin`

## 🔧 Важные моменты:

### ⚠️ Free план Render:
- Сервер "засыпает" после 15 минут неактивности
- При первом запросе "просыпается" (~30 секунд)
- База данных работает 90 дней бесплатно, потом $7/месяц

### 📁 Загрузка файлов:
На Free плане файловая система **эфемерная** (файлы удаляются при рестарте).
Для постоянного хранения файлов нужно использовать:
- **Cloudinary** (бесплатно до 25GB)
- **AWS S3**
- **Render Persistent Disks** (платно)

Пока файлы будут храниться в БД или временно на диске.

### 🔄 Автообновление:
Render автоматически обновляет сервис при каждом push в main ветку!

## 🎯 После успешного деплоя:

Ваш сайт будет доступен по адресу: `https://your-service-name.onrender.com`

## ❓ Проблемы?

Проверьте логи:
1. Откройте ваш Web Service на Render
2. Перейдите во вкладку **"Logs"**
3. Посмотрите ошибки

---

**Готово!** 🎉 Ваш сайт работает в интернете!
