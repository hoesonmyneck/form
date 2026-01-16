/**
 * БЭКЕНД ДЛЯ ФОРМ ОТЧЕТНОСТИ МТСЗН РК
 * Node.js + Express
 * 
 * Функции:
 * - Приём DOCX файлов от пользователей
 * - Хранение файлов на сервере
 * - API для админ-панели (список файлов, скачивание)
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// НАСТРОЙКИ
// =====================================================

// Папка для хранения загруженных документов
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(__dirname, 'documents.json');

// Создаём папку uploads если её нет
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Инициализируем "базу данных" (JSON файл)
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ documents: [] }, null, 2));
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());
app.use(express.json());

// Раздаём статику (фронтенд) из корневой папки проекта
const staticPath = path.join(__dirname, '..');
app.use(express.static(staticPath));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
});

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        // Генерируем уникальное имя файла
        const timestamp = Date.now();
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const safeName = originalName.replace(/[^a-zA-Zа-яА-Я0-9._-]/g, '_');
        cb(null, `${timestamp}_${safeName}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Макс 10MB
    fileFilter: (req, file, cb) => {
        // Разрешаем только DOCX файлы
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
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================

function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { documents: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// =====================================================
// API ENDPOINTS
// =====================================================

/**
 * POST /api/documents/upload
 * Загрузка нового документа
 */
app.post('/api/documents/upload', upload.single('document'), (req, res) => {
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

        // Создаём запись о документе
        const document = {
            id: generateId(),
            filename: req.file.filename,
            originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
            size: req.file.size,
            formNumber: metadata.formNumber || 'all',
            organization: metadata.organization || 'Не указано',
            submittedAt: metadata.submittedAt || new Date().toISOString(),
            uploadedAt: new Date().toISOString()
        };

        // Сохраняем в "базу данных"
        const db = readDB();
        db.documents.unshift(document); // Добавляем в начало
        writeDB(db);

        console.log(`✅ Загружен документ: ${document.originalName}`);

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
 * Получение списка всех документов
 */
app.get('/api/documents', (req, res) => {
    try {
        const db = readDB();
        res.json({
            success: true,
            count: db.documents.length,
            documents: db.documents
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
app.get('/api/documents/:id/download', (req, res) => {
    try {
        const db = readDB();
        const document = db.documents.find(d => d.id === req.params.id);

        if (!document) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        const filePath = path.join(UPLOADS_DIR, document.filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Файл не найден на сервере' });
        }

        // Устанавливаем правильное имя файла для скачивания
        const downloadName = encodeURIComponent(document.originalName);
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
 * Удаление документа по ID
 */
app.delete('/api/documents/:id', (req, res) => {
    try {
        const db = readDB();
        const index = db.documents.findIndex(d => d.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        const document = db.documents[index];
        const filePath = path.join(UPLOADS_DIR, document.filename);

        // Удаляем файл с диска
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Удаляем из базы
        db.documents.splice(index, 1);
        writeDB(db);

        console.log(`🗑️ Удалён документ: ${document.originalName}`);

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
app.get('/api/stats', (req, res) => {
    try {
        const db = readDB();
        
        // Считаем статистику
        const stats = {
            total: db.documents.length,
            byForm: {
                form1: db.documents.filter(d => d.formNumber === '1').length,
                form2: db.documents.filter(d => d.formNumber === '2').length,
                form3: db.documents.filter(d => d.formNumber === '3').length,
                form4: db.documents.filter(d => d.formNumber === '4').length,
                all: db.documents.filter(d => d.formNumber === 'all').length
            },
            totalSize: db.documents.reduce((sum, d) => sum + (d.size || 0), 0),
            lastUpload: db.documents[0]?.uploadedAt || null
        };

        res.json({ success: true, stats });

    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: 'Ошибка при получении статистики' });
    }
});

// =====================================================
// ЗАЩИТА АДМИН-ПАНЕЛИ (простая Basic Auth)
// =====================================================

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    const [type, credentials] = authHeader.split(' ');
    if (type !== 'Basic') {
        return res.status(401).json({ error: 'Неверный тип авторизации' });
    }

    const decoded = Buffer.from(credentials, 'base64').toString('utf8');
    const [user, pass] = decoded.split(':');

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
        res.status(401).json({ error: 'Неверные учётные данные' });
    }
}

// Защищённые роуты для админки
app.get('/admin', adminAuth, (req, res) => {
    res.sendFile(path.join(staticPath, 'admin.html'));
});

// =====================================================
// ЗАПУСК СЕРВЕРА
// =====================================================

app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ФОРМЫ ОТЧЕТНОСТИ МТСЗН РК - СЕРВЕР ЗАПУЩЕН            ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  🌐 Сайт:        http://localhost:${PORT}                      ║`);
    console.log(`║  🔐 Админка:     http://localhost:${PORT}/admin                ║`);
    console.log(`║  📁 Документы:   ${UPLOADS_DIR}  ║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  👤 Логин:       ${ADMIN_USER}                                     ║`);
    console.log(`║  🔑 Пароль:      ${ADMIN_PASS}                                  ║`);
    console.log('╚════════════════════════════════════════════════════════════╝');
});
