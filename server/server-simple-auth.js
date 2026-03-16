/**
 * БЭКЕНД ДЛЯ ФОРМ ОТЧЕТНОСТИ МТСЗН РК - Упрощенная версия с авторизацией
 * Node.js + Express + JSON + Simple Auth
 * 
 * Для тестирования БЕЗ PostgreSQL
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

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(__dirname, 'documents.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// Создаём папку uploads если её нет
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Инициализируем "базу данных" документов
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ documents: [] }, null, 2));
}

// Инициализируем "базу данных" пользователей
if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = {
        users: [
            {
                id: 'admin001',
                username: 'admin',
                email: 'admin',
                password: 'admin', // В реальности нужно хешировать!
                fullName: 'Администратор системы',
                organization: 'МТСЗН РК',
                role: 'admin',
                createdAt: new Date().toISOString()
            }
        ],
        sessions: []
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

function readUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return { users: [], sessions: [] };
    }
}

function writeUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function generateToken() {
    return Math.random().toString(36).substr(2) + Date.now().toString(36);
}

// Простая проверка токена
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    console.log('🔍 Запрос:', req.method, req.url);
    console.log('🔍 Authorization header:', authHeader);
    
    const token = authHeader?.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
        console.log('❌ Токен не найден в заголовках');
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    console.log('🔑 Извлеченный токен:', token);
    
    const usersData = readUsers();
    const session = usersData.sessions.find(s => s.token === token && new Date(s.expiresAt) > new Date());
    
    if (!session) {
        console.log('❌ Токен недействителен:', token.substring(0, 10) + '...');
        console.log('   Всего сессий в БД:', usersData.sessions.length);
        console.log('   Токены в БД:', usersData.sessions.map(s => s.token.substring(0, 10) + '...'));
        return res.status(403).json({ error: 'Недействительный или истекший токен' });
    }
    
    const user = usersData.users.find(u => u.id === session.userId);
    if (!user) {
        console.log('❌ Пользователь не найден для сессии:', session.userId);
        return res.status(403).json({ error: 'Пользователь не найден' });
    }
    
    console.log('✅ Авторизован:', user.username, 'для', req.url);
    req.user = user;
    next();
}

// Проверка роли админа
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора.' });
    }
    next();
}

// =====================================================
// ПУБЛИЧНЫЕ РОУТЫ
// =====================================================

// Главная страница - редирект на логин
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

// Регистрация отключена - все пользователи создаются админом

/**
 * POST /api/auth/login
 * Вход (можно по email или username)
 */
app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Введите логин и пароль' });
        }
        
        const usersData = readUsers();
        // Ищем пользователя по email или username
        const user = usersData.users.find(u => 
            (u.email === email || u.username === email) && u.password === password
        );
        
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        // Создаём токен
        const token = generateToken();
        const session = {
            userId: user.id,
            token,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        
        usersData.sessions.push(session);
        writeUsers(usersData);
        
        res.json({
            success: true,
            message: 'Вход выполнен успешно',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                organization: user.organization,
                role: user.role
            },
            accessToken: token,
            refreshToken: token
        });
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/auth/logout
 * Выход
 */
app.post('/api/auth/logout', (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (refreshToken) {
            const usersData = readUsers();
            usersData.sessions = usersData.sessions.filter(s => s.token !== refreshToken);
            writeUsers(usersData);
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
// ЗАЩИЩЁННЫЕ РОУТЫ
// =====================================================

// Настройка multer для загрузки файлов (с информацией о пользователе)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // Просто используем оригинальное имя без преобразований
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB макс
});

/**
 * POST /api/forms/save
 * Сохранение данных формы в JSON с прикреплёнными файлами (требуется авторизация)
 */
app.post('/api/forms/save', authenticateToken, upload.any(), (req, res) => {
    try {
        const { formNumber, formData } = req.body;
        
        if (!formNumber) {
            return res.status(400).json({ error: 'Отсутствует номер формы' });
        }
        
        // Парсим formData если это строка
        let parsedFormData;
        try {
            parsedFormData = typeof formData === 'string' ? JSON.parse(formData) : formData;
        } catch (e) {
            return res.status(400).json({ error: 'Неверный формат данных формы' });
        }

        const db = readDB();
        
        // Ищем существующую запись для этого пользователя и формы
        const existingIndex = db.documents.findIndex(
            doc => doc.userId === req.user.id && 
                   doc.formNumber === formNumber && 
                   doc.type === 'json'
        );

        // Обрабатываем прикреплённые файлы
        const attachedFiles = {};
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                // Извлекаем section из fieldname (например: files_form1-plaintiffs)
                const match = file.fieldname.match(/files_(.+)/);
                if (match) {
                    const section = match[1];
                    if (!attachedFiles[section]) {
                        attachedFiles[section] = [];
                    }
                    // Декодируем имя файла из latin1 в UTF-8
                    const decodedOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
                    attachedFiles[section].push({
                        originalName: decodedOriginalName,
                        filename: file.filename,
                        size: file.size,
                        mimetype: file.mimetype,
                        uploadedAt: new Date().toISOString()
                    });
                }
            });
        }

        // Обрабатываем файлы на удаление
        const filesToDelete = {};
        for (const key in req.body) {
            if (key.startsWith('delete_')) {
                const section = key.replace('delete_', '');
                try {
                    filesToDelete[section] = JSON.parse(req.body[key]);
                } catch (e) {
                    console.warn('Ошибка парсинга списка удаляемых файлов:', e);
                }
            }
        }

        const document = {
            id: existingIndex >= 0 ? db.documents[existingIndex].id : generateId(),
            type: 'json',
            formNumber: formNumber,
            formData: parsedFormData,
            attachedFiles: attachedFiles, // Добавляем файлы
            organization: req.user.organization || 'Не указано',
            submittedAt: new Date().toISOString(),
            uploadedAt: new Date().toISOString(),
            userId: req.user.id,
            username: req.user.username,
            userFullName: req.user.fullName,
            userEmail: req.user.email,
            userOrganization: req.user.organization
        };

        if (existingIndex >= 0) {
            // Объединяем файлы со старыми (если есть)
            const oldFiles = db.documents[existingIndex].attachedFiles || {};
            document.attachedFiles = { ...oldFiles };
            
            // Удаляем файлы помеченные на удаление
            for (const section in filesToDelete) {
                const deleteList = filesToDelete[section] || [];
                if (document.attachedFiles[section]) {
                    document.attachedFiles[section] = document.attachedFiles[section].filter(file => {
                        const shouldDelete = deleteList.includes(file.filename);
                        if (shouldDelete) {
                            // Удаляем физический файл
                            const filePath = path.join(UPLOADS_DIR, file.filename);
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                                console.log(`🗑️ Удален файл: ${file.filename}`);
                            }
                        }
                        return !shouldDelete;
                    });
                    // Удаляем пустые секции
                    if (document.attachedFiles[section].length === 0) {
                        delete document.attachedFiles[section];
                    }
                }
            }
            
            // Добавляем новые файлы
            for (const section in attachedFiles) {
                if (!document.attachedFiles[section]) {
                    document.attachedFiles[section] = [];
                }
                document.attachedFiles[section].push(...attachedFiles[section]);
            }
            
            db.documents[existingIndex] = document;
            console.log(`📝 Обновлена форма №${formNumber} (Пользователь: ${req.user.username}, Новых файлов: ${req.files?.length || 0}, Удалено: ${Object.values(filesToDelete).flat().length})`);
        } else {
            db.documents.unshift(document);
            console.log(`✅ Сохранена форма №${formNumber} (Пользователь: ${req.user.username}, Файлов: ${req.files?.length || 0})`);
        }

        writeDB(db);

        res.json({
            success: true,
            message: 'Форма успешно сохранена',
            document
        });

    } catch (error) {
        console.error('Ошибка сохранения формы:', error);
        res.status(500).json({ error: 'Ошибка при сохранении формы' });
    }
});

/**
 * GET /api/forms/:formNumber
 * Получение сохранённых данных формы (требуется авторизация)
 */
app.get('/api/forms/:formNumber', authenticateToken, (req, res) => {
    try {
        const { formNumber } = req.params;
        const db = readDB();
        
        // Ищем сохранённую форму для этого пользователя
        const document = db.documents.find(
            doc => doc.userId === req.user.id && 
                   doc.formNumber === formNumber && 
                   doc.type === 'json'
        );

        if (!document) {
            return res.json({
                success: true,
                found: false,
                formData: null
            });
        }

        res.json({
            success: true,
            found: true,
            formData: document.formData,
            attachedFiles: document.attachedFiles || {},
            lastSaved: document.uploadedAt
        });

    } catch (error) {
        console.error('Ошибка получения формы:', error);
        res.status(500).json({ error: 'Ошибка при получении формы' });
    }
});

/**
 * GET /api/files/:filename
 * Скачивание прикреплённого файла (требуется авторизация)
 */
app.get('/api/files/:filename', authenticateToken, (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(UPLOADS_DIR, filename);
        
        console.log('📥 Запрос на скачивание файла:', filename);
        console.log('📁 Полный путь:', filePath);
        console.log('✅ Файл существует:', fs.existsSync(filePath));
        
        // Проверяем существование файла
        if (!fs.existsSync(filePath)) {
            console.log('❌ Файл не найден:', filePath);
            return res.status(404).json({ error: 'Файл не найден' });
        }
        
        // Извлекаем оригинальное имя (после timestamp-randomNumber-)
        const originalName = filename.split('-').slice(2).join('-');
        
        console.log('📤 Отправка файла:', originalName);
        
        // Читаем файл и отправляем как blob
        const fileBuffer = fs.readFileSync(filePath);
        
        // Устанавливаем правильные заголовки для скачивания
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
        res.setHeader('Content-Length', fileBuffer.length);
        
        res.send(fileBuffer);
        console.log('✅ Файл отправлен:', originalName);
        
    } catch (error) {
        console.error('❌ Ошибка скачивания файла:', error);
        res.status(500).json({ error: 'Ошибка при скачивании файла' });
    }
});

/**
 * POST /api/documents/upload
 * Загрузка документа (требуется авторизация)
 */
app.post('/api/documents/upload', authenticateToken, upload.single('document'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        let metadata = {};
        try {
            metadata = JSON.parse(req.body.metadata || '{}');
        } catch (e) {
            metadata = {};
        }

        // Создаём запись о документе с информацией о пользователе
        const document = {
            id: generateId(),
            filename: req.file.filename,
            originalName: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
            size: req.file.size,
            formNumber: metadata.formNumber || 'all',
            organization: metadata.organization || req.user.organization || 'Не указано',
            submittedAt: metadata.submittedAt || new Date().toISOString(),
            uploadedAt: new Date().toISOString(),
            // Информация о пользователе
            userId: req.user.id,
            username: req.user.username,
            userFullName: req.user.fullName,
            userEmail: req.user.email,
            userOrganization: req.user.organization
        };

        // Сохраняем в "базу данных"
        const db = readDB();
        db.documents.unshift(document);
        writeDB(db);

        console.log(`✅ Загружен документ: ${document.originalName} (Пользователь: ${req.user.username})`);

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
 * Получение списка документов
 */
app.get('/api/documents', authenticateToken, (req, res) => {
    try {
        const db = readDB();
        
        let documents = db.documents;
        
        // ВСЕ пользователи (и админы, и обычные) видят все документы
        // Фильтрация убрана
        
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
 * Скачивание документа
 */
app.get('/api/documents/:id/download', authenticateToken, (req, res) => {
    try {
        const db = readDB();
        const document = db.documents.find(d => d.id === req.params.id);

        if (!document) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        // Проверка прав доступа
        if (req.user.role !== 'admin' && document.userId !== req.user.id) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        const filePath = path.join(UPLOADS_DIR, document.filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Файл не найден на сервере' });
        }

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
 * DELETE /api/forms/my — пользователь удаляет все свои JSON-формы
 */
app.delete('/api/forms/my', authenticateToken, (req, res) => {
    try {
        const db = readDB();
        const toDelete = db.documents.filter(d => d.userId === req.user.id && d.type === 'json');

        // Удаляем файлы с диска
        toDelete.forEach(doc => {
            if (doc.attachedFiles) {
                for (const section in doc.attachedFiles) {
                    for (const file of doc.attachedFiles[section]) {
                        const filePath = path.join(UPLOADS_DIR, file.filename);
                        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    }
                }
            }
        });

        db.documents = db.documents.filter(d => !(d.userId === req.user.id && d.type === 'json'));
        writeDB(db);

        res.json({ success: true, message: 'Ваши ответы удалены из общей базы', deletedCount: toDelete.length });
    } catch (error) {
        console.error('Ошибка удаления форм:', error);
        res.status(500).json({ error: 'Ошибка при удалении' });
    }
});

/**
 * DELETE /api/documents/:id
 * Удаление документа (только админ)
 */
app.delete('/api/documents/:id', authenticateToken, requireAdmin, (req, res) => {
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
 * Статистика
 */
app.get('/api/stats', authenticateToken, (req, res) => {
    try {
        const db = readDB();
        
        let documents = db.documents;
        
        // Для обычного пользователя - только его документы
        if (req.user.role !== 'admin') {
            documents = documents.filter(d => d.userId === req.user.id);
        }
        
        const stats = {
            total: documents.length,
            byForm: {
                form1: documents.filter(d => d.formNumber === '1').length,
                form2: documents.filter(d => d.formNumber === '2').length,
                form3: documents.filter(d => d.formNumber === '3').length,
                form4: documents.filter(d => d.formNumber === '4').length,
                all: documents.filter(d => d.formNumber === 'all').length
            },
            totalSize: documents.reduce((sum, d) => sum + (d.size || 0), 0),
            lastUpload: documents[0]?.uploadedAt || null
        };

        res.json({ success: true, stats });

    } catch (error) {
        console.error('Ошибка получения статистики:', error);
        res.status(500).json({ error: 'Ошибка при получении статистики' });
    }
});

/**
 * GET /api/user/profile
 * Профиль пользователя
 */
app.get('/api/user/profile', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            fullName: req.user.fullName,
            organization: req.user.organization,
            role: req.user.role
        }
    });
});

/**
 * GET /api/admin/users
 * Получить список всех пользователей (только админ)
 */
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const usersData = readUsers();
        const users = usersData.users.map(u => ({
            id: u.id,
            username: u.username,
            email: u.email,
            fullName: u.fullName,
            organization: u.organization,
            role: u.role,
            createdAt: u.createdAt
        }));
        
        res.json({
            success: true,
            users
        });
    } catch (error) {
        console.error('Ошибка получения пользователей:', error);
        res.status(500).json({ error: 'Ошибка при получении списка пользователей' });
    }
});

/**
 * POST /api/admin/users
 * Создать нового пользователя (только админ)
 */
app.post('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
    try {
        const { username, email, password, fullName, organization, role } = req.body;
        
        if (!username || !email || !password || !fullName) {
            return res.status(400).json({ error: 'Заполните все обязательные поля' });
        }
        
        const usersData = readUsers();
        
        // Проверка существования
        if (usersData.users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }
        
        if (usersData.users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
        }
        
        // Создаём пользователя
        const user = {
            id: generateId(),
            username,
            email,
            password, // В реальности нужно хешировать!
            fullName,
            organization: organization || 'Не указано',
            role: role || 'user',
            createdAt: new Date().toISOString()
        };
        
        usersData.users.push(user);
        writeUsers(usersData);
        
        console.log(`✅ Создан пользователь: ${user.username} (${user.email})`);
        
        res.json({
            success: true,
            message: 'Пользователь создан',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                organization: user.organization,
                role: user.role,
                createdAt: user.createdAt
            }
        });
        
    } catch (error) {
        console.error('Ошибка создания пользователя:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/admin/users/:id
 * Удалить пользователя (только админ)
 */
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, (req, res) => {
    try {
        const usersData = readUsers();
        const index = usersData.users.findIndex(u => u.id === req.params.id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const user = usersData.users[index];
        
        // Нельзя удалить самого себя
        if (user.id === req.user.id) {
            return res.status(400).json({ error: 'Нельзя удалить свой собственный аккаунт' });
        }
        
        // Удаляем пользователя
        usersData.users.splice(index, 1);
        
        // Удаляем его сессии
        usersData.sessions = usersData.sessions.filter(s => s.userId !== req.params.id);
        
        writeUsers(usersData);
        
        console.log(`🗑️ Удалён пользователь: ${user.username}`);
        
        res.json({
            success: true,
            message: 'Пользователь удалён'
        });
        
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        res.status(500).json({ error: 'Ошибка при удалении пользователя' });
    }
});

// =====================================================
// API ДЛЯ НОВЫХ ФОРМ (ПЛАНЫ РАБОТЫ)
// =====================================================

/**
 * POST /api/plans/save
 * Сохранение планов работы территориальных департаментов
 */
app.post('/api/plans/save', authenticateToken, (req, res) => {
    try {
        const { plans, notes } = req.body;
        
        if (!plans) {
            return res.status(400).json({ error: 'Отсутствуют данные планов' });
        }
        
        const db = readDB();
        
        // Ищем существующую запись для этого пользователя
        const existingIndex = db.documents.findIndex(
            doc => doc.userId === req.user.id && doc.type === 'plans'
        );
        
        const document = {
            id: existingIndex >= 0 ? db.documents[existingIndex].id : generateId(),
            type: 'plans',
            plans: plans,
            notes: notes || {},
            organization: req.user.organization || 'Не указано',
            submittedAt: new Date().toISOString(),
            uploadedAt: new Date().toISOString(),
            userId: req.user.id,
            username: req.user.username,
            userFullName: req.user.fullName,
            userEmail: req.user.email,
            userOrganization: req.user.organization
        };
        
        if (existingIndex >= 0) {
            db.documents[existingIndex] = document;
            console.log(`📝 Обновлены планы (Пользователь: ${req.user.username})`);
        } else {
            db.documents.unshift(document);
            console.log(`✅ Сохранены планы (Пользователь: ${req.user.username})`);
        }
        
        writeDB(db);
        
        res.json({
            success: true,
            message: 'Планы успешно сохранены',
            document
        });
        
    } catch (error) {
        console.error('Ошибка сохранения планов:', error);
        res.status(500).json({ error: 'Ошибка при сохранении планов' });
    }
});

/**
 * GET /api/plans/load
 * Загрузка сохранённых планов
 */
app.get('/api/plans/load', authenticateToken, (req, res) => {
    try {
        const db = readDB();
        
        // Ищем сохранённые планы для этого пользователя
        const document = db.documents.find(
            doc => doc.userId === req.user.id && doc.type === 'plans'
        );
        
        if (!document) {
            return res.json({
                success: true,
                found: false,
                plans: null,
                notes: {}
            });
        }
        
        res.json({
            success: true,
            found: true,
            plans: document.plans,
            notes: document.notes || {},
            lastSaved: document.uploadedAt
        });
        
    } catch (error) {
        console.error('Ошибка загрузки планов:', error);
        res.status(500).json({ error: 'Ошибка при загрузке планов' });
    }
});

/**
 * POST /api/plans/download
 * Генерация и скачивание DOCX документа с заполненными данными
 */
app.post('/api/plans/download', authenticateToken, async (req, res) => {
    try {
        const { planNumber, planData } = req.body;
        
        if (!planNumber || !planData) {
            return res.status(400).json({ error: 'Отсутствуют данные для генерации документа' });
        }
        
        const PizZip = require('pizzip');
        
        const templatePath = path.join(__dirname, '..', 'План ТД показатель общий.docx');
        
        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({ error: 'Шаблон документа не найден' });
        }
        
        const content = fs.readFileSync(templatePath);
        const zip = new PizZip(content);
        let docXml = zip.file('word/document.xml').asText();
        
        const now = new Date();
        const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
                           'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        const day = now.getDate();
        const month = monthNames[now.getMonth()];
        const year = now.getFullYear();
        
        const planTitles = {
            1: 'Реализация Дорожной карты партии «Amanat» (п.26) по обеспечению доступности для лиц с инвалидностью',
            2: 'Мониторинг доли реализованной социальной части индивидуальных программ абилитации и реабилитации лиц с инвалидностью',
            3: 'Своевременная организация проверочных мероприятий в рамках профилактического контроля',
            4: 'Реализация Дорожной карты партии «Amanat» по обеспечению достижения установленного целевого показателя на 2026 год по заочному проактивному оказанию государственной услуги установления инвалидности в размере 45%',
            5: 'Рассмотрение не менее 50% дел первичного освидетельствования ОМК МСЭ при оказании государственной услуги «Установление инвалидности и/или степени утраты трудоспособности, и/или определению мер социальной защиты',
            6: 'Направление поступивших формуляров (по Соглашению государств-членов ЕАЭС) на подтверждение в компетентные органы',
            7: 'Проведение проверки пенсионных выплат по возрасту с признаками предоставления заявителем недостоверных сведений (отчетная группа №360 в АИС «Е-макет»)',
            8: 'Обеспечение наполнения интернет-ресурса территориального департамента (по доступности, по пенсионному обеспечению, ТСР)'
        };
        
        const planFileNames = {
            1: 'План № 1',
            2: 'План № 2',
            3: 'План № 3',
            4: 'План № 4',
            5: 'План № 5',
            6: 'План № 6',
            7: 'План № 7',
            8: 'План № 8'
        };
        
        // Заменяем простые переменные в тексте
        docXml = docXml.replace(/\{day\}/g, String(day));
        docXml = docXml.replace(/\{month\}/g, month);
        docXml = docXml.replace(/\{year\}/g, String(year));
        docXml = docXml.replace(/\{planTitle\}/g, planTitles[planNumber] || '');
        
        // Находим строку таблицы (w:tr) которая содержит {#rows}
        // Структура: <w:tr>...<w:t>{#rows}{num}{/rows}</w:t>...<w:t>{#rows}{region}{/rows}</w:t>...</w:tr>
        const templateRowMatch = docXml.match(/<w:tr>(?:(?!<w:tr>)[\s\S])*?\{#rows\}[\s\S]*?<\/w:tr>/);
        
        if (templateRowMatch) {
            const templateRow = templateRowMatch[0];
            
            // Очищаем шаблон строки от маркеров цикла
            const cleanRow = templateRow.replace(/\{#rows\}/g, '').replace(/\{\/rows\}/g, '');
            
            const dataRows = planData.slice(0, -1);
            const totalRow = planData[planData.length - 1];
            
            let generatedRows = '';
            dataRows.forEach((row, index) => {
                let newRow = cleanRow;
                newRow = newRow.replace(/\{num\}/g, String(index + 1));
                newRow = newRow.replace(/\{region\}/g, row[1] || '');
                newRow = newRow.replace(/\{planned\}/g, row[2] || '');
                newRow = newRow.replace(/\{actual\}/g, row[3] || '');
                newRow = newRow.replace(/\{coefficient\}/g, row[4] || '');
                generatedRows += newRow;
            });
            
            // Заменяем шаблонную строку на все сгенерированные строки
            docXml = docXml.replace(templateRow, generatedRows);
            
            // Заменяем данные строки "Всего"
            docXml = docXml.replace(/\{totalPlanned\}/g, totalRow[2] || '');
            docXml = docXml.replace(/\{totalActual\}/g, totalRow[3] || '');
            docXml = docXml.replace(/\{totalCoefficient\}/g, totalRow[4] || '');
        }
        
        zip.file('word/document.xml', docXml);
        
        const buf = zip.generate({
            type: 'nodebuffer',
            compression: 'DEFLATE'
        });
        
        const fileName = `${planFileNames[planNumber]}.docx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.send(buf);
        
        console.log(`📥 Документ План ${planNumber} сгенерирован для пользователя ${req.user.username}`);
        
    } catch (error) {
        console.error('Ошибка генерации документа:', error);
        res.status(500).json({ error: 'Ошибка при генерации документа: ' + error.message });
    }
});

/**
 * GET /admin
 * Админ-панель (проверка прав будет в самой странице через API)
 */
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

/**
 * GET /cabinet
 * Личный кабинет для обычных пользователей
 */
app.get('/cabinet', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'cabinet.html'));
});

/**
 * GET /index2
 * Страница для новых форм (планы работы)
 */
app.get('/index2', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index2.html'));
});

/**
 * GET /admin2
 * Админ-панель для новых форм
 */
app.get('/admin2', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin2.html'));
});

// =====================================================
// СТАТИКА (В КОНЦЕ, ПОСЛЕ ВСЕХ API РОУТОВ!)
// =====================================================

// Раздаём статику (фронтенд) - ВАЖНО: после всех API роутов
const staticPath = path.join(__dirname, '..');
app.use(express.static(staticPath));

// =====================================================
// ЗАПУСК СЕРВЕРА
// =====================================================

app.listen(PORT, () => {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ФОРМЫ ОТЧЕТНОСТИ МТСЗН РК - ТЕСТОВЫЙ СЕРВЕР           ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  🌐 Сайт:        http://localhost:${PORT}                      ║`);
    console.log(`║  🔐 Логин:       http://localhost:${PORT}/login.html           ║`);
    console.log(`║  📁 Админка:     http://localhost:${PORT}/admin                ║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  📊 БД:          JSON файлы (для тестирования)             ║');
    console.log('║  👤 Админ:       admin / admin                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
});
