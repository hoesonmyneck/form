/**
 * БЭКЕНД ДЛЯ ФОРМ ОТЧЕТНОСТИ МТСЗН РК - PRODUCTION версия с PostgreSQL
 * Node.js + Express + PostgreSQL
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// НАСТРОЙКИ PostgreSQL
// =====================================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Проверка подключения к БД
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Ошибка подключения к PostgreSQL:', err.message);
    } else {
        console.log('✅ Подключено к PostgreSQL');
        release();
        // Создаём таблицу истории если её нет
        pool.query(`
            CREATE TABLE IF NOT EXISTS plan_history (
                id VARCHAR(50) PRIMARY KEY,
                snapshot_date DATE NOT NULL UNIQUE,
                plans_data JSONB NOT NULL DEFAULT '{}',
                notes_data JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `).then(() => {
            console.log('✅ Таблица plan_history готова');
            scheduleFridaySnapshot();
        }).catch(e => console.error('❌ plan_history:', e.message));
    }
});

// =====================================================
// НАСТРОЙКИ ФАЙЛОВ
// =====================================================

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');

// =====================================================
// РЕГИОНАЛЬНЫЕ АККАУНТЫ ДЛЯ ПЛАНОВ
// =====================================================
const PLAN_REGIONS = [
    'г. Астана', 'г. Алматы', 'г. Шымкент',
    'Акмолинская область', 'Актюбинская область', 'Алматинская область',
    'Атырауская область', 'Восточно-Казахстанская область', 'Жамбылская область',
    'Западно-Казахстанская область', 'Карагандинская область', 'Костанайская область',
    'Кызылординская область', 'Мангистауская область', 'Павлодарская область',
    'Северо-Казахстанская область', 'Туркестанская область', 'Область Абай',
    'Область Улытау', 'Область Жетысу'
];

const REGION_USERS = {
    'astana': 0, 'almaty': 1, 'shymkent': 2,
    'akmola': 3, 'aktobe': 4, 'almatyreg': 5,
    'atyrau': 6, 'vko': 7, 'zhambyl': 8,
    'zko': 9, 'karaganda': 10, 'kostanay': 11,
    'kyzylorda': 12, 'mangistau': 13, 'pavlodar': 14,
    'sko': 15, 'turkestan': 16, 'abay': 17,
    'ulytau': 18, 'zhetisu': 19
};

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function generateToken() {
    return Math.random().toString(36).substr(2) + Date.now().toString(36) + 
           Math.random().toString(36).substr(2);
}

// Сессии в памяти (для простоты, в production лучше Redis)
const sessions = new Map();

// Простая проверка токена
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    const session = sessions.get(token);
    
    if (!session || new Date(session.expiresAt) < new Date()) {
        sessions.delete(token);
        return res.status(403).json({ error: 'Недействительный или истекший токен' });
    }
    
    req.user = session.user;
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'login.html'));
});

/**
 * POST /api/auth/login
 */
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Введите логин и пароль' });
        }
        
        // Ищем пользователя по email или username
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR username = $1',
            [email]
        );
        
        const user = result.rows[0];
        
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        // Проверяем пароль
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        // Создаём токен
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 дней
        
        sessions.set(token, {
            userId: user.id,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                organization: user.organization,
                role: user.role,
                formType: user.form_type
            },
            expiresAt: expiresAt.toISOString()
        });
        
        console.log(`✅ Вход: ${user.username}`);
        
        res.json({
            success: true,
            message: 'Вход выполнен успешно',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                fullName: user.full_name,
                organization: user.organization,
                role: user.role,
                formType: user.form_type
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
 */
app.post('/api/auth/logout', (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (refreshToken) {
            sessions.delete(refreshToken);
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

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

/**
 * POST /api/forms/save
 */
app.post('/api/forms/save', authenticateToken, upload.any(), async (req, res) => {
    try {
        const { formNumber, formData } = req.body;
        
        if (!formNumber) {
            return res.status(400).json({ error: 'Отсутствует номер формы' });
        }
        
        let parsedFormData;
        try {
            parsedFormData = typeof formData === 'string' ? JSON.parse(formData) : formData;
        } catch (e) {
            return res.status(400).json({ error: 'Неверный формат данных формы' });
        }

        // Обрабатываем НОВЫЕ прикреплённые файлы (только что загруженные)
        const newUploadedFiles = {};
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const match = file.fieldname.match(/files_(.+)/);
                if (match) {
                    const section = match[1];
                    if (!newUploadedFiles[section]) {
                        newUploadedFiles[section] = [];
                    }
                    const decodedOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
                    newUploadedFiles[section].push({
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

        // Обрабатываем retained-файлы (уже на диске, нужны только для новых записей)
        const retainedFiles = {};
        for (const key in req.body) {
            if (key.startsWith('retained_')) {
                const section = key.replace('retained_', '');
                try {
                    const files = JSON.parse(req.body[key]);
                    const existing = files.filter(f => {
                        return f.filename && fs.existsSync(path.join(UPLOADS_DIR, f.filename));
                    });
                    if (existing.length > 0) {
                        retainedFiles[section] = existing;
                    }
                } catch (e) {
                    console.warn('Ошибка парсинга retained файлов:', e);
                }
            }
        }

        // Проверяем существующую запись
        const existingResult = await pool.query(
            'SELECT id, attached_files FROM documents WHERE user_id = $1 AND form_number = $2 AND type = $3',
            [req.user.id, formNumber, 'json']
        );

        let docId;
        let finalAttachedFiles = {};

        if (existingResult.rows.length > 0) {
            docId = existingResult.rows[0].id;
            const oldFiles = existingResult.rows[0].attached_files || {};
            finalAttachedFiles = JSON.parse(JSON.stringify(oldFiles));
            
            // Удаляем файлы
            for (const section in filesToDelete) {
                const deleteList = filesToDelete[section] || [];
                if (finalAttachedFiles[section]) {
                    finalAttachedFiles[section] = finalAttachedFiles[section].filter(file => {
                        const shouldDelete = deleteList.includes(file.filename);
                        if (shouldDelete) {
                            const filePath = path.join(UPLOADS_DIR, file.filename);
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                        }
                        return !shouldDelete;
                    });
                    if (finalAttachedFiles[section].length === 0) {
                        delete finalAttachedFiles[section];
                    }
                }
            }
            
            // Добавляем ТОЛЬКО новые загруженные файлы (retained уже есть в oldFiles)
            for (const section in newUploadedFiles) {
                if (!finalAttachedFiles[section]) {
                    finalAttachedFiles[section] = [];
                }
                finalAttachedFiles[section].push(...newUploadedFiles[section]);
            }

            await pool.query(
                `UPDATE documents SET 
                    form_data = $1, 
                    attached_files = $2, 
                    organization = $3, 
                    submitted_at = NOW(), 
                    uploaded_at = NOW()
                WHERE id = $4`,
                [JSON.stringify(parsedFormData), JSON.stringify(finalAttachedFiles), req.user.organization, docId]
            );
            
            console.log(`📝 Обновлена форма №${formNumber} (${req.user.username})`);
        } else {
            docId = generateId();

            // Для новой записи объединяем новые загрузки и retained
            for (const section in newUploadedFiles) {
                finalAttachedFiles[section] = [...newUploadedFiles[section]];
            }
            for (const section in retainedFiles) {
                if (!finalAttachedFiles[section]) {
                    finalAttachedFiles[section] = [];
                }
                finalAttachedFiles[section].push(...retainedFiles[section]);
            }
            
            await pool.query(
                `INSERT INTO documents (id, user_id, type, form_number, form_data, attached_files, organization, submitted_at, uploaded_at, username, user_full_name, user_email, user_organization)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8, $9, $10, $11)`,
                [docId, req.user.id, 'json', formNumber, JSON.stringify(parsedFormData), JSON.stringify(finalAttachedFiles), req.user.organization, req.user.username, req.user.fullName, req.user.email, req.user.organization]
            );
            
            console.log(`✅ Сохранена форма №${formNumber} (${req.user.username})`);
        }

        res.json({
            success: true,
            message: 'Форма успешно сохранена',
            document: { id: docId, formNumber, formData: parsedFormData, attachedFiles: finalAttachedFiles }
        });

    } catch (error) {
        console.error('Ошибка сохранения формы:', error);
        res.status(500).json({ error: 'Ошибка при сохранении формы' });
    }
});

/**
 * GET /api/forms/:formNumber
 */
app.get('/api/forms/:formNumber', authenticateToken, async (req, res) => {
    try {
        const { formNumber } = req.params;
        
        const result = await pool.query(
            'SELECT form_data, attached_files, uploaded_at FROM documents WHERE user_id = $1 AND form_number = $2 AND type = $3',
            [req.user.id, formNumber, 'json']
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                found: false,
                formData: null
            });
        }

        res.json({
            success: true,
            found: true,
            formData: result.rows[0].form_data,
            attachedFiles: result.rows[0].attached_files || {},
            lastSaved: result.rows[0].uploaded_at
        });

    } catch (error) {
        console.error('Ошибка получения формы:', error);
        res.status(500).json({ error: 'Ошибка при получении формы' });
    }
});

/**
 * GET /api/files/:filename
 */
app.get('/api/files/:filename', authenticateToken, (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(UPLOADS_DIR, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Файл не найден' });
        }
        
        const originalName = filename.split('-').slice(2).join('-');
        const fileBuffer = fs.readFileSync(filePath);
        
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(originalName)}`);
        res.setHeader('Content-Length', fileBuffer.length);
        
        res.send(fileBuffer);
        
    } catch (error) {
        console.error('Ошибка скачивания файла:', error);
        res.status(500).json({ error: 'Ошибка при скачивании файла' });
    }
});

/**
 * GET /api/documents
 */
app.get('/api/documents', authenticateToken, async (req, res) => {
    try {
        // Кабинет показывает все документы (форм-данные) всем авторизованным
        const result = await pool.query(
            'SELECT * FROM documents WHERE type = $1 ORDER BY uploaded_at DESC',
            ['json']
        );
        
        res.json({
            success: true,
            count: result.rows.length,
            documents: result.rows.map(row => ({
                id: row.id,
                type: row.type,
                formNumber: row.form_number,
                formData: row.form_data,
                plans: row.plans,
                notes: row.notes,
                attachedFiles: row.attached_files,
                organization: row.organization,
                submittedAt: row.submitted_at,
                uploadedAt: row.uploaded_at,
                userId: row.user_id,
                username: row.username,
                userFullName: row.user_full_name,
                userEmail: row.user_email,
                userOrganization: row.user_organization
            }))
        });
    } catch (error) {
        console.error('Ошибка получения списка:', error);
        res.status(500).json({ error: 'Ошибка при получении списка документов' });
    }
});

/**
 * DELETE /api/forms/my — пользователь удаляет все свои JSON-формы из БД
 */
app.delete('/api/forms/my', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM documents WHERE user_id = $1 AND type = $2',
            [req.user.id, 'json']
        );

        // Файлы намеренно НЕ удаляем с диска — пользователь может
        // повторно сохранить форму и файлы подхватятся без перезагрузки

        await pool.query(
            'DELETE FROM documents WHERE user_id = $1 AND type = $2',
            [req.user.id, 'json']
        );

        res.json({
            success: true,
            message: 'Ваши ответы удалены из общей базы',
            deletedCount: result.rows.length
        });

    } catch (error) {
        console.error('Ошибка удаления форм пользователя:', error);
        res.status(500).json({ error: 'Ошибка при удалении' });
    }
});

/**
 * DELETE /api/documents/:id
 */
app.delete('/api/documents/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Документ не найден' });
        }

        const document = result.rows[0];
        
        // Удаляем прикреплённые файлы
        if (document.attached_files) {
            for (const section in document.attached_files) {
                for (const file of document.attached_files[section]) {
                    const filePath = path.join(UPLOADS_DIR, file.filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }
            }
        }

        await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);

        res.json({
            success: true,
            message: 'Документ удалён'
        });

    } catch (error) {
        console.error('Ошибка удаления:', error);
        res.status(500).json({ error: 'Ошибка при удалении документа' });
    }
});

// =====================================================
// УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ИНДЕКСА 2 (admin2)
// =====================================================

const PLANS_ADMIN_CHECK = (req, res) => {
    if (req.user.formType !== 'plans' || req.user.role !== 'admin') {
        res.status(403).json({ error: 'Доступ запрещён' });
        return false;
    }
    return true;
};

app.get('/api/admin2/users', authenticateToken, async (req, res) => {
    if (!PLANS_ADMIN_CHECK(req, res)) return;
    try {
        const result = await pool.query(
            `SELECT id, username, full_name, organization, role FROM users
              WHERE form_type = 'plans' ORDER BY created_at ASC`
        );
        res.json({ success: true, users: result.rows.map(u => ({
            id: u.id,
            username: u.username,
            fullName: u.full_name,
            organization: u.organization,
            role: u.role,
            regionIndex: REGION_USERS[u.username] ?? null
        }))});
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin2/users', authenticateToken, async (req, res) => {
    if (!PLANS_ADMIN_CHECK(req, res)) return;
    try {
        const { username, password, fullName, role, regionIndex } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Логин и пароль обязательны' });
        const hash = await bcrypt.hash(password, 10);
        const id = 'u_' + generateId();
        const org = (regionIndex !== null && regionIndex !== undefined && regionIndex >= 0)
            ? PLAN_REGIONS[regionIndex] : '';
        await pool.query(
            `INSERT INTO users (id, username, email, password, full_name, organization, role, form_type, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'plans',NOW())`,
            [id, username, username + '@plans.kz', hash, fullName || username, org, role || 'user']
        );
        res.json({ success: true, message: 'Пользователь создан' });
    } catch (e) {
        if (e.code === '23505') return res.status(400).json({ error: 'Логин уже занят' });
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admin2/users/:id', authenticateToken, async (req, res) => {
    if (!PLANS_ADMIN_CHECK(req, res)) return;
    try {
        const { username, password, fullName, role, regionIndex } = req.body;
        const { id } = req.params;
        const org = (regionIndex !== null && regionIndex !== undefined && regionIndex >= 0)
            ? PLAN_REGIONS[regionIndex] : '';
        if (password && password.trim()) {
            const hash = await bcrypt.hash(password, 10);
            await pool.query(
                `UPDATE users SET username=$1, password=$2, full_name=$3, organization=$4, role=$5 WHERE id=$6`,
                [username, hash, fullName || username, org, role || 'user', id]
            );
        } else {
            await pool.query(
                `UPDATE users SET username=$1, full_name=$2, organization=$3, role=$4 WHERE id=$5`,
                [username, fullName || username, org, role || 'user', id]
            );
        }
        res.json({ success: true, message: 'Пользователь обновлён' });
    } catch (e) {
        if (e.code === '23505') return res.status(400).json({ error: 'Логин уже занят' });
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin2/users/:id', authenticateToken, async (req, res) => {
    if (!PLANS_ADMIN_CHECK(req, res)) return;
    try {
        const { id } = req.params;
        if (id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить себя' });
        await pool.query(`DELETE FROM users WHERE id=$1 AND form_type='plans'`, [id]);
        res.json({ success: true, message: 'Пользователь удалён' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * GET /api/user/profile
 */
app.get('/api/user/profile', authenticateToken, (req, res) => {
    const regionIndex = REGION_USERS.hasOwnProperty(req.user.username)
        ? REGION_USERS[req.user.username]
        : null;
    res.json({
        success: true,
        user: { ...req.user, regionIndex }
    });
});

/**
 * GET /api/admin/users
 */
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, full_name, organization, role, form_type, created_at FROM users ORDER BY created_at DESC'
        );
        
        res.json({
            success: true,
            users: result.rows.map(u => ({
                id: u.id,
                username: u.username,
                email: u.email,
                fullName: u.full_name,
                organization: u.organization,
                role: u.role,
                formType: u.form_type,
                createdAt: u.created_at
            }))
        });
    } catch (error) {
        console.error('Ошибка получения пользователей:', error);
        res.status(500).json({ error: 'Ошибка при получении списка пользователей' });
    }
});

/**
 * POST /api/admin/users
 */
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { username, email, password, fullName, organization, role, formType } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Логин и пароль обязательны' });
        }
        
        // Проверка существования
        const existingUser = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email || username]
        );
        
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
        }
        
        // Хешируем пароль
        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = generateId();
        
        await pool.query(
            `INSERT INTO users (id, username, email, password, full_name, organization, role, form_type, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [userId, username, email || username, hashedPassword, fullName || username, organization || 'Не указано', role || 'user', formType || 'standard']
        );
        
        console.log(`✅ Создан пользователь: ${username}`);
        
        res.json({
            success: true,
            message: 'Пользователь создан',
            user: { id: userId, username, email: email || username, fullName: fullName || username, organization, role: role || 'user' }
        });
        
    } catch (error) {
        console.error('Ошибка создания пользователя:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/admin/users/:id
 */
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        if (req.params.id === req.user.id) {
            return res.status(400).json({ error: 'Нельзя удалить свой собственный аккаунт' });
        }
        
        const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING username', [req.params.id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        console.log(`🗑️ Удалён пользователь: ${result.rows[0].username}`);
        
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
 */
app.post('/api/plans/save', authenticateToken, async (req, res) => {
    // viewer не существует, planner может сохранять плановые значения
    try {
        const { plans, notes, planDates } = req.body;
        if (!plans) return res.status(400).json({ error: 'Отсутствуют данные планов' });

        const regionIndex = REGION_USERS[req.user.username];

        // Находим администраторский (общий) документ планов
        const sharedDocResult = await pool.query(
            `SELECT d.id, d.plans, d.notes, d.user_id FROM documents d
               JOIN users u ON d.user_id = u.id
              WHERE d.type = 'plans' AND u.role = 'admin' AND u.form_type = 'plans'
              LIMIT 1`
        );

        let sharedPlans = {};
        let sharedNotes = {};
        let sharedDocId = null;
        let sharedUserId = null;

        // Получаем ID admin2
        const adminUserResult = await pool.query(
            `SELECT id, username, full_name, email, organization FROM users
              WHERE role = 'admin' AND form_type = 'plans' LIMIT 1`
        );
        if (adminUserResult.rows.length === 0) {
            return res.status(500).json({ error: 'Не найден администратор планов' });
        }
        const adminUser = adminUserResult.rows[0];
        sharedUserId = adminUser.id;

        if (sharedDocResult.rows.length > 0) {
            sharedDocId = sharedDocResult.rows[0].id;
            sharedPlans = sharedDocResult.rows[0].plans || {};
            sharedNotes = sharedDocResult.rows[0].notes || {};
        }

        // Инициализируем пустую структуру если нужно
        for (let i = 1; i <= 8; i++) {
            const planId = `plan${i}`;
            if (!sharedPlans[planId]) {
                sharedPlans[planId] = PLAN_REGIONS.map((r, idx) => [idx + 1, r, '', '', '']);
                sharedPlans[planId].push(['-', 'Всего', '', '', '']);
            }
        }

        if (regionIndex !== undefined) {
            // Региональный пользователь: обновляем только свою строку
            for (let i = 1; i <= 8; i++) {
                const planId = `plan${i}`;
                if (plans[planId] && plans[planId][regionIndex]) {
                    sharedPlans[planId][regionIndex] = plans[planId][regionIndex];
                }
            }
            Object.assign(sharedNotes, notes || {});
            console.log(`📝 Обновлена строка [${regionIndex}] от ${req.user.username}`);
        } else {
            // Администратор: перезаписывает всю таблицу
            for (let i = 1; i <= 8; i++) {
                const planId = `plan${i}`;
                if (plans[planId]) sharedPlans[planId] = plans[planId];
            }
            Object.assign(sharedNotes, notes || {});
            // planDates обновляются только админом
            if (planDates) {
                sharedNotes.__planDates__ = { ...(sharedNotes.__planDates__ || {}), ...planDates };
            }
            console.log(`📝 Обновлены все планы от admin (${req.user.username})`);
        }

        if (sharedDocId) {
            await pool.query(
                `UPDATE documents SET plans = $1, notes = $2, submitted_at = NOW(), uploaded_at = NOW() WHERE id = $3`,
                [JSON.stringify(sharedPlans), JSON.stringify(sharedNotes), sharedDocId]
            );
        } else {
            const docId = generateId();
            await pool.query(
                `INSERT INTO documents (id, user_id, type, plans, notes, organization, submitted_at, uploaded_at, username, user_full_name, user_email, user_organization)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, $8, $9, $10)`,
                [docId, sharedUserId, 'plans', JSON.stringify(sharedPlans), JSON.stringify(sharedNotes),
                 adminUser.organization, adminUser.username, adminUser.full_name, adminUser.email, adminUser.organization]
            );
        }

        res.json({ success: true, message: 'Планы успешно сохранены' });

    } catch (error) {
        console.error('Ошибка сохранения планов:', error);
        res.status(500).json({ error: 'Ошибка при сохранении планов' });
    }
});

/**
 * GET /api/plans/load
 */
app.get('/api/plans/load', authenticateToken, async (req, res) => {
    try {
        // Все читают из единого общего документа admin2
        const result = await pool.query(
            `SELECT d.plans, d.notes, d.uploaded_at FROM documents d
               JOIN users u ON d.user_id = u.id
              WHERE d.type = 'plans' AND u.role = 'admin' AND u.form_type = 'plans'
              LIMIT 1`
        );

        if (result.rows.length === 0) {
            return res.json({ success: true, found: false, plans: null, notes: {} });
        }

        const notesData = result.rows[0].notes || {};
        const planDatesFromNotes = notesData.__planDates__ || {};
        res.json({
            success: true,
            found: true,
            plans: result.rows[0].plans,
            notes: notesData,
            planDates: planDatesFromNotes,
            lastSaved: result.rows[0].uploaded_at
        });

    } catch (error) {
        console.error('Ошибка загрузки планов:', error);
        res.status(500).json({ error: 'Ошибка при загрузке планов' });
    }
});

/**
 * GET /api/plans/all
 * Объединённые данные всех регионов (только для admin2 / plans-admin)
 */
// /api/plans/all — алиас для admin2.html, читает тот же общий документ
app.get('/api/plans/all', authenticateToken, async (req, res) => {
    const allowed = req.user.formType === 'plans' &&
        (req.user.role === 'admin' || req.user.role === 'planner');
    if (!allowed) return res.status(403).json({ error: 'Доступ запрещён' });
    req.url = '/api/plans/load';
    // Переиспользуем load-логику напрямую
    try {
        const result = await pool.query(
            `SELECT d.plans, d.notes, d.uploaded_at FROM documents d
               JOIN users u ON d.user_id = u.id
              WHERE d.type = 'plans' AND u.role = 'admin' AND u.form_type = 'plans'
              LIMIT 1`
        );
        if (result.rows.length === 0) {
            return res.json({ success: true, found: false, plans: null, notes: {} });
        }
        const nd = result.rows[0].notes || {};
        res.json({
            success: true, found: true,
            plans: result.rows[0].plans,
            notes: nd,
            planDates: nd.__planDates__ || {},
            lastSaved: result.rows[0].uploaded_at
        });
    } catch (error) {
        console.error('Ошибка загрузки всех планов:', error);
        res.status(500).json({ error: 'Ошибка при загрузке планов' });
    }
});

/**
 * Генерирует XML таблицы Word для план 7 (7 столбцов).
 * Используется вместо шаблонного подхода, чтобы заголовки были правильными.
 */
function buildPlan7TableXml(planData) {
    const esc = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Ширины столбцов в единицах dxa (1/20 pt): сумма ~11000 под альбомный лист
    const colW = [400, 2700, 1300, 1300, 1300, 1400, 1200];
    const totalW = colW.reduce((a, b) => a + b, 0);

    const tcProp = (w, fill) => {
        const shade = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
        return `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shade}
          <w:tcBorders>
            <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          </w:tcBorders>
        </w:tcPr>`;
    };

    const cell = (text, w, { bold = false, center = true, fill = null } = {}) => {
        const jc = center ? '<w:jc w:val="center"/>' : '<w:jc w:val="left"/>';
        const rpr = bold ? '<w:rPr><w:b/><w:bCs/></w:rPr>' : '<w:rPr/>';
        return `<w:tc>${tcProp(w, fill)}
          <w:p><w:pPr>${jc}<w:spacing w:before="60" w:after="60"/>
          </w:pPr><w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>
        </w:tc>`;
    };

    const headers = [
        '№',
        'Территориальные департаменты КРиКСЗН',
        'Кол-во назн. дел (от кол-ва за пред. месяц)',
        'Плановый показатель (кол-во)',
        'Плановый показатель (%)',
        'Фактический показатель (% проверенных)',
        'Коэффициент исполнения'
    ];

    const headerRow = '<w:tr>' + headers.map((h, i) =>
        cell(h, colW[i], { bold: true, center: true, fill: 'D9E1F2' })
    ).join('') + '</w:tr>';

    let dataRows = '';
    planData.forEach((row, idx) => {
        const isTotal = row[0] === '-' || String(row[1] || '').trim() === 'Всего';
        const fill = isTotal ? 'BDD7EE' : null;
        const num = isTotal ? '-' : String(idx + 1);
        dataRows += '<w:tr>'
            + cell(num,       colW[0], { bold: isTotal, center: true, fill })
            + cell(row[1],    colW[1], { bold: isTotal, center: false, fill })
            + cell(row[2],    colW[2], { center: true, fill })
            + cell(row[3],    colW[3], { center: true, fill })
            + cell(row[4],    colW[4], { center: true, fill })
            + cell(row[5],    colW[5], { center: true, fill })
            + cell(row[6],    colW[6], { center: true, fill })
            + '</w:tr>';
    });

    const gridCols = colW.map(w => `<w:gridCol w:w="${w}"/>`).join('');

    return `<w:tbl>
      <w:tblPr>
        <w:tblW w:w="${totalW}" w:type="dxa"/>
        <w:tblBorders>
          <w:top    w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left   w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right  w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
        <w:tblLook w:val="04A0"/>
      </w:tblPr>
      <w:tblGrid>${gridCols}</w:tblGrid>
      ${headerRow}
      ${dataRows}
    </w:tbl>`;
}

/**
 * POST /api/plans/download
 */
app.post('/api/plans/download', authenticateToken, async (req, res) => {
    try {
        const { planNumber, planData, displayNumber, planDate } = req.body;
        
        if (!planNumber || !planData) {
            return res.status(400).json({ error: 'Отсутствуют данные для генерации документа' });
        }
        // displayNumber — отображаемый номер (план 6 скрыт: внутренний 7 = отображаемый 6)
        const fileNum = displayNumber || planNumber;
        
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
            1: 'План № 1', 2: 'План № 2', 3: 'План № 3', 4: 'План № 4',
            5: 'План № 5', 6: 'План № 6', 7: 'План № 7', 8: 'План № 8'
        };
        
        // Убираем «» перед датой (все варианты: слитно, с пробелом, разнесённые по тегам)
        docXml = docXml.replace(/«\s*»/g, '');
        docXml = docXml.replace(/«(<\/w:t><\/w:r><w:r[^>]*><w:t[^>]*>|\s*)»/g, '');
        docXml = docXml.replace(/«/g, '').replace(/»/g, '');

        if (planDate) {
            // Убираем "года" из введённой даты, чтобы шаблон не дублировал
            const cleanDate = planDate.replace(/\s*года?\s*$/i, '').trim();
            docXml = docXml.replace(/\{day\}/g, '');
            docXml = docXml.replace(/\{month\}/g, '');
            docXml = docXml.replace(/\{year\}/g, cleanDate);
        } else {
            docXml = docXml.replace(/\{day\}/g, String(day));
            docXml = docXml.replace(/\{month\}/g, month);
            docXml = docXml.replace(/\{year\}/g, String(year));
        }
        docXml = docXml.replace(/\{planTitle\}/g, planTitles[planNumber] || '');

        if (planNumber === 7) {
            // Для план 7 — заменяем всю таблицу целиком, чтобы заголовки были правильными
            const newTableXml = buildPlan7TableXml(planData);
            const tblMatch = docXml.match(/<w:tbl[\s\S]*?<\/w:tbl>/);
            if (tblMatch) {
                docXml = docXml.replace(tblMatch[0], newTableXml);
            }
            // Убираем незаполненные placeholder'ы шаблона
            docXml = docXml.replace(/\{#rows\}[\s\S]*?\{\/rows\}/g, '');
            docXml = docXml.replace(/\{totalPlanned\}|\{totalActual\}|\{totalCoefficient\}/g, '');
        } else {
            const templateRowMatch = docXml.match(/<w:tr>(?:(?!<w:tr>)[\s\S])*?\{#rows\}[\s\S]*?<\/w:tr>/);

            if (templateRowMatch) {
                const templateRow = templateRowMatch[0];
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

                docXml = docXml.replace(templateRow, generatedRows);
                docXml = docXml.replace(/\{totalPlanned\}/g, totalRow[2] || '');
                docXml = docXml.replace(/\{totalActual\}/g, totalRow[3] || '');
                docXml = docXml.replace(/\{totalCoefficient\}/g, totalRow[4] || '');
            }
        }
        
        zip.file('word/document.xml', docXml);
        
        const buf = zip.generate({
            type: 'nodebuffer',
            compression: 'DEFLATE'
        });
        
        const fileName = `План № ${fileNum}.docx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        const encodedName = encodeURIComponent(fileName);
        res.setHeader('Content-Disposition', `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
        res.send(buf);
        
        console.log(`📥 Документ План ${fileNum} (internal: ${planNumber}, ${req.user.username})`);
        
    } catch (error) {
        console.error('Ошибка генерации документа:', error);
        res.status(500).json({ error: 'Ошибка при генерации документа: ' + error.message });
    }
});

// =====================================================
// СТАТИЧЕСКИЕ РОУТЫ
// =====================================================

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

app.get('/cabinet', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'cabinet.html'));
});

app.get('/index2', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index2.html'));
});

app.get('/admin2', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'admin2.html'));
});

// =====================================================
// ИСТОРИЯ ПЛАНОВ (СНИМКИ ПО ПЯТНИЦАМ)
// =====================================================

async function takeAutoSnapshot(label) {
    try {
        const adminUser = await pool.query(
            `SELECT id FROM users WHERE role='admin' AND form_type='plans' LIMIT 1`
        );
        if (!adminUser.rows.length) { console.log('Снимок: admin2 не найден'); return false; }
        const adminId = adminUser.rows[0].id;
        const doc = await pool.query(
            `SELECT plans, notes FROM documents WHERE user_id=$1 AND type='plans' ORDER BY uploaded_at DESC LIMIT 1`,
            [adminId]
        );
        if (!doc.rows.length) { console.log('Снимок: нет данных планов'); return false; }
        const plans = doc.rows[0].plans || {};
        const notes = doc.rows[0].notes || {};
        const now = new Date();
        const snapshotDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        await pool.query(
            `INSERT INTO plan_history (id, snapshot_date, plans_data, notes_data, created_at)
             VALUES ($1,$2,$3,$4,NOW())
             ON CONFLICT (snapshot_date) DO UPDATE
             SET plans_data=EXCLUDED.plans_data, notes_data=EXCLUDED.notes_data, created_at=NOW()`,
            [generateId(), snapshotDate, JSON.stringify(plans), JSON.stringify(notes)]
        );
        console.log(`✅ Снимок планов сохранён за ${snapshotDate}${label ? ' (' + label + ')' : ''}`);
        return true;
    } catch (e) {
        console.error('❌ Ошибка снимка:', e.message);
        return false;
    }
}

function scheduleFridaySnapshot() {
    function getNextFriday9am() {
        const now = new Date();
        const d = new Date(now);
        const day = d.getDay(); // 0=вс, 5=пт
        let daysUntil = (5 - day + 7) % 7;
        if (daysUntil === 0 && (d.getHours() > 9 || (d.getHours() === 9 && d.getMinutes() >= 1))) {
            daysUntil = 7;
        }
        d.setDate(d.getDate() + daysUntil);
        d.setHours(9, 0, 0, 0);
        return d;
    }
    function scheduleNext() {
        const next = getNextFriday9am();
        const delay = next - new Date();
        const hours = Math.round(delay / 36e5);
        console.log(`⏰ Следующий авто-снимок планов: ${next.toLocaleString('ru-RU')} (через ~${hours} ч.)`);
        setTimeout(async () => {
            await takeAutoSnapshot('авто, пятница');
            scheduleNext();
        }, delay);
    }
    scheduleNext();
}

// GET /api/plans/history — список дат снимков
app.get('/api/plans/history', authenticateToken, async (req, res) => {
    if (req.user.formType !== 'plans' || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    try {
        const result = await pool.query(
            `SELECT id, snapshot_date, created_at FROM plan_history ORDER BY snapshot_date DESC`
        );
        res.json({ success: true, snapshots: result.rows.map(r => {
            const d = r.snapshot_date;
            const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            return { id: r.id, date: dateStr, createdAt: r.created_at };
        })});
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/plans/history/:date — данные за конкретную дату
app.get('/api/plans/history/:date', authenticateToken, async (req, res) => {
    if (req.user.formType !== 'plans' || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    try {
        const result = await pool.query(
            `SELECT plans_data, notes_data FROM plan_history WHERE snapshot_date=$1`,
            [req.params.date]
        );
        if (!result.rows.length) return res.json({ success: false, found: false });
        const r = result.rows[0];
        res.json({ success: true, found: true, plans: r.plans_data, notes: r.notes_data });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/plans/snapshot — ручной снимок
app.post('/api/plans/snapshot', authenticateToken, async (req, res) => {
    if (req.user.formType !== 'plans' || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const ok = await takeAutoSnapshot('ручной');
    if (ok) res.json({ success: true, message: 'Снимок сохранён' });
    else res.json({ success: false, message: 'Нет данных для снимка' });
});

// СТАТИКА (В КОНЦЕ!)
const staticPath = path.join(__dirname, '..');
app.use(express.static(staticPath));

// =====================================================
// ЗАПУСК СЕРВЕРА
// =====================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ФОРМЫ ОТЧЕТНОСТИ МТСЗН РК - PRODUCTION SERVER          ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║  🌐 Порт:        ${PORT}                                       ║`);
    console.log('║  📊 БД:          PostgreSQL                                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
});
