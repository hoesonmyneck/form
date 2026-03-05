# Инструкция по миграции на новую версию

## Что изменилось

### Версия 1.0 → 2.0

**Основные изменения:**

1. ✅ **База данных:** JSON файл → PostgreSQL
2. ✅ **Авторизация:** Basic Auth (только админ) → JWT токены для всех пользователей
3. ✅ **Контейнеризация:** Добавлен Docker + Docker Compose
4. ✅ **Безопасность:** Журнал аудита, rate limiting, bcrypt
5. ⏳ **Формы:** Ожидается замена на новые структуры (требуются DOCX файлы)

## Новые файлы

Создано:
- `server/server-new.js` - новый бэкенд с PostgreSQL и JWT
- `server/db.js` - модуль работы с PostgreSQL
- `server/auth.js` - модуль авторизации
- `login.html` - страница входа/регистрации
- `admin-new.html` - обновленная админ-панель
- `docker-compose.yml` - Docker Compose конфигурация
- `Dockerfile` - Docker образ
- `init.sql` - инициализация БД
- `.env.example` - пример переменных окружения
- `README.md` - документация
- `MIGRATION.md` - этот файл

## Шаги миграции

### Вариант 1: Запуск новой версии (рекомендуется)

Если вы хотите протестировать новую версию параллельно со старой:

1. **Переименуйте старый сервер:**
   ```bash
   mv server/server.js server/server-old.js
   mv admin.html admin-old.html
   ```

2. **Активируйте новый сервер:**
   ```bash
   mv server/server-new.js server/server.js
   mv admin-new.html admin.html
   ```

3. **Установите новые зависимости:**
   ```bash
   npm install
   ```

4. **Запустите через Docker:**
   ```bash
   docker-compose up -d
   ```

5. **Создайте первого пользователя:**
   - Откройте http://localhost:3000
   - Перейдите на регистрацию
   - Зарегистрируйтесь

6. **Дайте админские права (в БД):**
   ```bash
   docker exec -it forms_postgres psql -U forms_user -d forms_db
   ```
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
   \q
   ```

### Вариант 2: Полная замена

Если вы готовы полностью перейти на новую версию:

1. **Сделайте бэкап:**
   ```bash
   cp -r server/uploads server/uploads_backup
   cp server/documents.json server/documents_backup.json
   ```

2. **Замените файлы:**
   ```bash
   rm server/server.js admin.html
   mv server/server-new.js server/server.js
   mv admin-new.html admin.html
   ```

3. **Обновите зависимости:**
   ```bash
   npm install
   ```

4. **Создайте .env:**
   ```bash
   cp .env.example .env
   nano .env  # отредактируйте по необходимости
   ```

5. **Запустите:**
   ```bash
   docker-compose up -d
   ```

### Вариант 3: Миграция данных из JSON в PostgreSQL

Если у вас есть данные в старом `documents.json` и вы хотите их перенести:

1. **Создайте скрипт миграции** (`migrate-data.js`):

```javascript
const fs = require('fs');
const db = require('./server/db');

async function migrate() {
    try {
        // Читаем старые данные
        const oldData = JSON.parse(fs.readFileSync('./server/documents_backup.json', 'utf8'));
        
        console.log(`Найдено ${oldData.documents.length} документов для миграции`);
        
        // Создаем технического пользователя для старых документов
        let migrationUser;
        try {
            migrationUser = await db.findUserByUsername('migration');
            if (!migrationUser) {
                migrationUser = await db.createUser({
                    username: 'migration',
                    email: 'migration@system.local',
                    passwordHash: 'migrated_data',
                    fullName: 'Миграция данных',
                    organization: 'Система',
                    role: 'user'
                });
            }
        } catch (e) {
            console.error('Ошибка создания пользователя миграции:', e);
            return;
        }
        
        // Мигрируем каждый документ
        for (const doc of oldData.documents) {
            try {
                await db.createDocument({
                    userId: migrationUser.id,
                    filename: doc.filename,
                    originalName: doc.originalName,
                    fileSize: doc.size || 0,
                    formNumber: doc.formNumber || 'all',
                    organization: doc.organization || 'Не указано',
                    formData: {}
                });
                console.log(`✅ Мигрирован: ${doc.originalName}`);
            } catch (e) {
                console.error(`❌ Ошибка миграции ${doc.originalName}:`, e.message);
            }
        }
        
        console.log('Миграция завершена!');
        process.exit(0);
    } catch (error) {
        console.error('Ошибка миграции:', error);
        process.exit(1);
    }
}

migrate();
```

2. **Запустите миграцию:**
   ```bash
   node migrate-data.js
   ```

## Проверка после миграции

1. **Проверьте доступность:**
   - Откройте http://localhost:3000
   - Должна открыться страница входа

2. **Зарегистрируйтесь:**
   - Создайте учетную запись
   - Войдите в систему

3. **Проверьте формы:**
   - После входа должны открыться формы
   - Заполните тестовую форму
   - Нажмите "Сохранить"

4. **Проверьте админ-панель:**
   - Дайте себе роль admin (см. выше)
   - Откройте http://localhost:3000/admin
   - Проверьте список документов

5. **Проверьте БД:**
   ```bash
   docker exec -it forms_postgres psql -U forms_user -d forms_db
   ```
   ```sql
   -- Проверка пользователей
   SELECT id, username, email, role FROM users;
   
   -- Проверка документов
   SELECT id, original_name, form_number, submitted_at FROM documents;
   
   -- Проверка сессий
   SELECT COUNT(*) FROM sessions;
   
   \q
   ```

## Откат к старой версии

Если что-то пошло не так:

1. **Остановите Docker:**
   ```bash
   docker-compose down
   ```

2. **Восстановите старые файлы:**
   ```bash
   mv server/server-old.js server/server.js
   mv admin-old.html admin.html
   ```

3. **Восстановите данные:**
   ```bash
   cp server/documents_backup.json server/documents.json
   ```

4. **Запустите старую версию:**
   ```bash
   npm start
   ```

## Работа с формами

### Текущая ситуация

На данный момент формы остались старыми из-за того, что не удалось прочитать содержимое прикрепленных DOCX файлов (form1.docx, form2.docx, form3.docx, form4.docx).

### Что нужно сделать

Для замены форм на новые:

1. **Опишите структуру новых форм:**
   - Откройте каждый DOCX файл
   - Опишите структуру таблиц, полей, заголовков
   - Или скопируйте текстовое содержание

2. **Обновите `index.html`:**
   - Замените HTML структуру форм под новые

3. **Обновите `docx-generator.js`:**
   - Измените функции генерации DOCX под новые структуры

4. **Обновите `script.js`:**
   - Адаптируйте логику сбора данных под новые формы

## Полезные команды

```bash
# Просмотр логов
docker-compose logs -f app

# Перезапуск приложения
docker-compose restart app

# Проверка статуса
docker-compose ps

# Остановка всех контейнеров
docker-compose down

# Полная очистка (включая volumes)
docker-compose down -v

# Подключение к БД
docker exec -it forms_postgres psql -U forms_user -d forms_db

# Бэкап БД
docker exec forms_postgres pg_dump -U forms_user forms_db > backup_$(date +%Y%m%d).sql

# Восстановление БД
docker exec -i forms_postgres psql -U forms_user forms_db < backup.sql
```

## Что дальше?

### Для завершения проекта нужно:

1. **Получить структуру новых форм** (из DOCX файлов)
2. **Обновить HTML формы** в `index.html`
3. **Обновить генератор DOCX** в `docx-generator.js`
4. **Протестировать весь flow:**
   - Регистрация → Вход → Заполнение форм → Сохранение → Просмотр в админке

### Рекомендации:

- Тестируйте на тестовом сервере перед production
- Сделайте резервные копии БД
- Настройте автоматические бэкапы
- Настройте мониторинг
- Используйте HTTPS в production

## Поддержка

Если возникли проблемы:

1. Проверьте логи: `docker-compose logs -f`
2. Проверьте, что все контейнеры запущены: `docker-compose ps`
3. Проверьте настройки в `.env`
4. Убедитесь, что порты 3000 и 5432 свободны

---

**Дата миграции:** 2026-02-10  
**Версия:** 1.0 → 2.0
