# ⚡ БЫСТРЫЙ СТАРТ: Деплой на Render.com

## 📋 Что уже сделано:
- ✅ `.env.example` - пример переменных окружения
- ✅ `init.sql` - SQL скрипт для инициализации базы
- ✅ `.gitignore` - настроен правильно
- ✅ `package.json` - готов к деплою
- ✅ `uploads/` - папка создана

## 🚀 Действия (5 минут):

### 1. Сгенерируйте хеши паролей
```bash
node -e "const bcrypt = require('bcryptjs'); console.log('Hash for admin:', bcrypt.hashSync('admin', 10)); console.log('Hash for admin2:', bcrypt.hashSync('admin2', 10));"
```
Сохраните эти хеши - они понадобятся!

### 2. Загрузите на GitHub
```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### 3. Создайте PostgreSQL на Render
1. Зайдите на https://render.com
2. **New +** → **PostgreSQL**
3. Name: `mtszn-forms-db`
4. Free план
5. **Create** → Скопируйте **Internal Database URL**

### 4. Инициализируйте базу
На странице базы → **Shell** → Вставьте содержимое `init.sql`
Замените `$2a$10$YourHashedPasswordHere` на хеши из шага 1!

### 5. Создайте Web Service
1. **New +** → **Web Service**
2. Выберите ваш GitHub репозиторий
3. Name: `mtszn-forms`
4. Runtime: **Node**
5. Build: `npm install`
6. Start: `npm start`

### 6. Добавьте переменные окружения
В разделе **Environment**:
```
DATABASE_URL = [ваш Internal Database URL]
JWT_SECRET = super-secret-key-2024-change-this
NODE_ENV = production
PORT = 3000
```

### 7. Deploy!
Нажмите **Create Web Service** → Ждите 2-5 минут

## ✅ Готово!
Ваш сайт будет доступен по адресу: `https://your-service.onrender.com`

---

📖 **Подробная инструкция**: см. `RENDER_DEPLOY.md`
