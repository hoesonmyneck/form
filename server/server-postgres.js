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
    }
});

// =====================================================
// НАСТРОЙКИ ФАЙЛОВ
// =====================================================

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');

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

        // Обрабатываем прикреплённые файлы
        const attachedFiles = {};
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                const match = file.fieldname.match(/files_(.+)/);
                if (match) {
                    const section = match[1];
                    if (!attachedFiles[section]) {
                        attachedFiles[section] = [];
                    }
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

        // Проверяем существующую запись
        const existingResult = await pool.query(
            'SELECT id, attached_files FROM documents WHERE user_id = $1 AND form_number = $2 AND type = $3',
            [req.user.id, formNumber, 'json']
        );

        let docId;
        let finalAttachedFiles = attachedFiles;

        if (existingResult.rows.length > 0) {
            docId = existingResult.rows[0].id;
            const oldFiles = existingResult.rows[0].attached_files || {};
            finalAttachedFiles = { ...oldFiles };
            
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
            
            // Добавляем новые файлы
            for (const section in attachedFiles) {
                if (!finalAttachedFiles[section]) {
                    finalAttachedFiles[section] = [];
                }
                finalAttachedFiles[section].push(...attachedFiles[section]);
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
        const result = await pool.query(
            'SELECT * FROM documents ORDER BY uploaded_at DESC'
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

        // Удаляем прикреплённые файлы с диска
        for (const doc of result.rows) {
            if (doc.attached_files) {
                for (const section in doc.attached_files) {
                    for (const file of doc.attached_files[section]) {
                        const filePath = path.join(UPLOADS_DIR, file.filename);
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    }
                }
            }
        }

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

/**
 * GET /api/user/profile
 */
app.get('/api/user/profile', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user
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
    try {
        const { plans, notes } = req.body;
        
        if (!plans) {
            return res.status(400).json({ error: 'Отсутствуют данные планов' });
        }
        
        const existingResult = await pool.query(
            'SELECT id FROM documents WHERE user_id = $1 AND type = $2',
            [req.user.id, 'plans']
        );
        
        if (existingResult.rows.length > 0) {
            await pool.query(
                `UPDATE documents SET 
                    plans = $1, 
                    notes = $2, 
                    organization = $3, 
                    submitted_at = NOW(), 
                    uploaded_at = NOW()
                WHERE id = $4`,
                [JSON.stringify(plans), JSON.stringify(notes || {}), req.user.organization, existingResult.rows[0].id]
            );
            console.log(`📝 Обновлены планы (${req.user.username})`);
        } else {
            const docId = generateId();
            await pool.query(
                `INSERT INTO documents (id, user_id, type, plans, notes, organization, submitted_at, uploaded_at, username, user_full_name, user_email, user_organization)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, $8, $9, $10)`,
                [docId, req.user.id, 'plans', JSON.stringify(plans), JSON.stringify(notes || {}), req.user.organization, req.user.username, req.user.fullName, req.user.email, req.user.organization]
            );
            console.log(`✅ Сохранены планы (${req.user.username})`);
        }
        
        res.json({
            success: true,
            message: 'Планы успешно сохранены'
        });
        
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
        const result = await pool.query(
            'SELECT plans, notes, uploaded_at FROM documents WHERE user_id = $1 AND type = $2',
            [req.user.id, 'plans']
        );
        
        if (result.rows.length === 0) {
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
            plans: result.rows[0].plans,
            notes: result.rows[0].notes || {},
            lastSaved: result.rows[0].uploaded_at
        });
        
    } catch (error) {
        console.error('Ошибка загрузки планов:', error);
        res.status(500).json({ error: 'Ошибка при загрузке планов' });
    }
});

/**
 * POST /api/plans/download
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
            1: 'План № 1', 2: 'План № 2', 3: 'План № 3', 4: 'План № 4',
            5: 'План № 5', 6: 'План № 6', 7: 'План № 7', 8: 'План № 8'
        };
        
        docXml = docXml.replace(/\{day\}/g, String(day));
        docXml = docXml.replace(/\{month\}/g, month);
        docXml = docXml.replace(/\{year\}/g, String(year));
        docXml = docXml.replace(/\{planTitle\}/g, planTitles[planNumber] || '');
        
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
        
        zip.file('word/document.xml', docXml);
        
        const buf = zip.generate({
            type: 'nodebuffer',
            compression: 'DEFLATE'
        });
        
        const fileName = `${planFileNames[planNumber]}.docx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.send(buf);
        
        console.log(`📥 Документ План ${planNumber} (${req.user.username})`);
        
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
