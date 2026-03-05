/**
 * БЭКЕНД ДЛЯ ФОРМ ОТЧЕТНОСТИ МТСЗН РК - v2.0
 * Node.js + Express + PostgreSQL + JWT Auth
 * 
 * Функции:
 * - Регистрация и авторизация пользователей
 * - Приём DOCX файлов от авторизованных пользователей
 * - Хранение файлов на сервере и данных в PostgreSQL
 * - API для админ-панели (список файлов, скачивание, статистика)
 * - Журнал аудита действий
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const db = require('./db');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// =====================================================
// НАСТРОЙКИ
// =====================================================

const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Создаём папку uploads если её нет
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting для защиты от брутфорса
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // 5 попыток
    message: { error: 'Слишком много попыток входа. Попробуйте позже.' }
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Слишком много запросов. Попробуйте позже.' }
});

// Логирование запросов
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${auth.getIpAddress(req)}`);
    next();
});

// Раздаём статику (фронтенд) из корневой папки проекта
const staticPath = path.join(__dirname, '..');
app.use(express.static(staticPath));

// =====================================================
// НАСТРОЙКА MULTER ДЛЯ ЗАГРУЗКИ ФАЙЛОВ
// =====================================================

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const userId = req.user ? req.user.userId : 'anonymous';
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const safeName = originalName.replace(/[^a-zA-Zа-яА-Я0-9._-]/g, '_');
        cb(null, `${timestamp}_${userId}_${safeName}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Макс 10MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/octet-stream'
        ];
        if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.docx')) {
            cb(null, true);
        } else {
            cb(new Error('Разрешены только DOCX файлы'), false);
        }
    }
});

// =====================================================
// ПУБЛИЧНЫЕ РОУТЫ (БЕЗ АВТОРИЗАЦИИ)
// =====================================================

// Главная страница - редирект на страницу входа
app.get('/', (req, res) => {
    res.sendFile(path.join(staticPath, 'login.html'));
});

/**
 * POST /api/auth/register
 * Регистрация нового пользователя
 */
app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { username, email, password, fullName, organization } = req.body;
        
        // Валидация
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Заполните все обязательные поля' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
        }
        
        const result = await auth.register({ username, email, password, fullName, organization });
        
        // Логируем регистрацию
        await db.addAuditLog({
            userId: result.user.id,
            action: 'register',
            entityType: 'user',
            entityId: result.user.id,
            details: { username, email },
            ipAddress: auth.getIpAddress(req),
        });
        
        res.json({
            success: true,
            message: 'Регистрация успешна',
            ...result
        });
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/auth/login
 * Вход пользователя
 */
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Введите email и пароль' });
        }
        
        const result = await auth.login({
            email,
            password,
            ipAddress: auth.getIpAddress(req),
            userAgent: auth.getUserAgent(req),
        });
        
        res.json({
            success: true,
            message: 'Вход выполнен успешно',
            ...result
        });
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        
        // Логируем неудачную попытку входа
        await db.addAuditLog({
            userId: null,
            action: 'login_failed',
            entityType: 'user',
            entityId: null,
            details: { email: req.body.email, error: error.message },
            ipAddress: auth.getIpAddress(req),
        });
        
        res.status(401).json({ error: error.message });
    }
});

/**
 * POST /api/auth/refresh
 * Обновление токенов
 */
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token не предоставлен' });
        }
        
        const result = await auth.refreshTokens(refreshToken);
        
        res.json({
            success: true,
            ...result
        });
        
    } catch (error) {
        console.error('Ошибка обновления токена:', error);
        res.status(403).json({ error: error.message });
    }
});

/**
 * POST /api/auth/logout
 * Выход пользователя
 */
app.post('/api/auth/logout', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (refreshToken) {
            await auth.logout(refreshToken, auth.getIpAddress(req));
        }
        
        res.json({
            success: true,
            message: 'Выход выполнен успешно'
        });
        
    } catch (error) {
        console.error('Ошибка выхода:', error);
        res.status(500).json({ error: 'Ошибка при выходе' });
    }
});

// =====================================================
// ЗАЩИЩЁННЫЕ РОУТЫ (ТРЕБУЕТСЯ АВТОРИЗАЦИЯ)
// =====================================================

/**
 * GET /api/user/profile
 * Получение профиля текущего пользователя
 */
app.get('/api/user/profile', auth.authenticateToken, async (req, res) => {
    try {
        const user = await db.findUserById(req.user.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        res.json({
            success: true,
            user
        });
        
    } catch (error) {
        console.error('Ошибка получения профиля:', error);
        res.status(500).json({ error: 'Ошибка при получении профиля' });
    }
});

/**
 * GET /api/forms
 * Главная страница форм (после авторизации)
 */
app.get('/api/forms', auth.authenticateToken, (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
});

/**
 * POST /api/documents/upload
 * Загрузка нового документа (только для авторизованных пользователей)
 */
app.post('/api/documents/upload', auth.authenticateToken, apiLimiter, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }
        
        // Парсим метаданные
        let metadata = {};
        try {
            metadata = JSON.parse(req.body.metadata || '{}');
        } catch (e) {
            metadata = {};
        }
        
        // Создаём запись о документе в БД
        const document = await db.createDocument({
            userId: req.user.userId,
            filename: req.file.filename,
            originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
            fileSize: req.file.size,
            formNumber: metadata.formNumber || 'all',
            organization: metadata.organization || req.user.organization || 'Не указано',
            formData: metadata.formData || {},
        });
        
        // Логируем загрузку
        await db.addAuditLog({
            userId: req.user.userId,
            action: 'upload',
            entityType: 'document',
            entityId: document.id,
            details: { filename: document.original_name, formNumber: document.form_number },
            ipAddress: auth.getIpAddress(req),
        });
        
        console.log(`✅ Загружен документ: ${document.original_name} (Пользователь: ${req.user.username})`);
        
        res.json({
            success: true,
            message: 'Документ успешно загружен',
            document
        });
        
    } catch (error) {
        console.error('Ошибка загрузки:', error);
        res.status(500).json({ error: 'Ошибка при загрузке файла' });
    }
});

/**
 * GET /api/documents
 * Получение списка документов (для админа - все, для пользователя - только свои)
 */
app.get('/api/documents', auth.authenticateToken, apiLimiter, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        
        let documents;
        
        if (req.user.role === 'admin') {
            // Админ видит все документы
            documents = await db.getAllDocuments(limit, offset);
        } else {
            // Обычный пользователь видит только свои
            documents = await db.getUserDocuments(req.user.userId, limit, offset);
        }
        
        res.json({
            success: true,
            count: documents.length,
            documents
        });
        
    } catch (error) {
        console.error('Ошибка получения списка:', error);
        res.status(500).json({ error: 'Ошибка при получении списка документов' });
    }
});

/**
 * GET /api/documents/:id/download
 * Скачивание документа по ID
 */
app.get('/api/documents/:id/download', auth.authenticateToken, async (req, res) => {
    try {
        const document = await db.findDocumentById(req.params.id);
        
        if (!document) {
            return res.status(404).json({ error: 'Документ не найден' });
        }
        
        // Проверка прав доступа (пользователь может скачать только свои документы, админ - любые)
        if (req.user.role !== 'admin' && document.user_id !== req.user.userId) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        
        const filePath = path.join(UPLOADS_DIR, document.filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Файл не найден на сервере' });
        }
        
        // Логируем скачивание
        await db.addAuditLog({
            userId: req.user.userId,
            action: 'download',
            entityType: 'document',
            entityId: document.id,
            details: { filename: document.original_name },
            ipAddress: auth.getIpAddress(req),
        });
        
        const downloadName = encodeURIComponent(document.original_name);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${downloadName}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        
        res.sendFile(filePath);
        
    } catch (error) {
        console.error('Ошибка скачивания:', error);
        res.status(500).json({ error: 'Ошибка при скачивании файла' });
    }
});

/**
 * DELETE /api/documents/:id
 * Удаление документа (только админ)
 */
app.delete('/api/documents/:id', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
    try {
        const document = await db.findDocumentById(req.params.id);
        
        if (!document) {
            return res.status(404).json({ error: 'Документ не найден' });
        }
        
        const filePath = path.join(UPLOADS_DIR, document.filename);
        
        // Удаляем файл с диска
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        // Удаляем из базы
        await db.deleteDocument(req.params.id);
        
        // Логируем удаление
        await db.addAuditLog({
            userId: req.user.userId,
            action: 'delete',
            entityType: 'document',
            entityId: document.id,
            details: { filename: document.original_name },
            ipAddress: auth.getIpAddress(req),
        });
        
        console.log(`🗑️ Удалён документ: ${document.original_name}`);
        
        res.json({
            success: true,
            message: 'Документ удалён'
        });
        
    } catch (error) {
        console.error('Ошибка удаления:', error);
        res.status(500).json({ error: 'Ошибка при удалении документа' });
    }
});

/**
 * GET /api/stats
 * Статистика по документам
 */
app.get('/api/stats', auth.authenticateToken, async (req, res) => {
    try {
        const stats = await db.getDocumentsStats();
        
        res.json({ 
            success: true, 
            stats: {
                total: parseInt(stats.total) || 0,
                byForm: {
                    form1: parseInt(stats.form1) || 0,
                    form2: parseInt(stats.form2) || 0,
                    form3: parseInt(stats.form3) || 0,
                    form4: parseInt(stats.form4) || 0,
                    all: parseInt(stats.all_forms) || 0,
                },
                totalSize: parseInt(stats.total_size) || 0,
                lastUpload: stats.last_upload
            }
        });
        
    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: 'Ошибка при получении статистики' });
    }
});

// =====================================================
// АДМИНСКИЕ РОУТЫ
// =====================================================

/**
 * GET /admin
 * Админ-панель
 */
app.get('/admin', auth.authenticateToken, auth.requireAdmin, (req, res) => {
    res.sendFile(path.join(staticPath, 'admin.html'));
});

/**
 * GET /api/admin/users
 * Получение списка всех пользователей (только для админа)
 */
app.get('/api/admin/users', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
    try {
        const users = await db.getAllUsers();
        
        res.json({
            success: true,
            count: users.length,
            users
        });
        
    } catch (error) {
        console.error('Ошибка получения пользователей:', error);
        res.status(500).json({ error: 'Ошибка при получении списка пользователей' });
    }
});

/**
 * GET /api/admin/audit-log
 * Получение журнала аудита (только для админа)
 */
app.get('/api/admin/audit-log', auth.authenticateToken, auth.requireAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        
        const logs = await db.getAuditLog(limit, offset);
        
        res.json({
            success: true,
            count: logs.length,
            logs
        });
        
    } catch (error) {
        console.error('Ошибка получения журнала:', error);
        res.status(500).json({ error: 'Ошибка при получении журнала аудита' });
    }
});

// =====================================================
// ОБРАБОТКА ОШИБОК
// =====================================================

// 404
app.use((req, res) => {
    res.status(404).json({ error: 'Страница не найдена' });
});

// Общий обработчик ошибок
app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// =====================================================
// ЗАПУСК СЕРВЕРА
// =====================================================

async function startServer() {
    try {
        // Проверяем подключение к БД
        await db.query('SELECT NOW()');
        console.log('✅ База данных доступна');
        
        // Очищаем устаревшие сессии при старте
        await db.cleanExpiredSessions();
        
        // Запускаем сервер
        app.listen(PORT, () => {
            console.log('╔═══════════════════════════════════════════════════════════════╗');
            console.log('║     ФОРМЫ ОТЧЕТНОСТИ МТСЗН РК v2.0 - СЕРВЕР ЗАПУЩЕН           ║');
            console.log('╠═══════════════════════════════════════════════════════════════╣');
            console.log(`║  🌐 Сайт:        http://localhost:${PORT}                          ║`);
            console.log(`║  🔐 Админка:     http://localhost:${PORT}/admin                    ║`);
            console.log(`║  📁 Документы:   ${UPLOADS_DIR}                  ║`);
            console.log('╠═══════════════════════════════════════════════════════════════╣');
            console.log(`║  🔧 Режим:       ${NODE_ENV}                                  ║`);
            console.log(`║  🗄️  База:       PostgreSQL                                     ║`);
            console.log('╚═══════════════════════════════════════════════════════════════╝');
        });
        
        // Периодическая очистка устаревших сессий (каждый час)
        setInterval(() => {
            db.cleanExpiredSessions().catch(console.error);
        }, 60 * 60 * 1000);
        
    } catch (error) {
        console.error('❌ Ошибка запуска сервера:', error);
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('⚠️  SIGTERM получен. Завершаем работу...');
    await db.pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('⚠️  SIGINT получен. Завершаем работу...');
    await db.pool.end();
    process.exit(0);
});
