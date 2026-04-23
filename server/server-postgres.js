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

        // Таблица кэша данных план2 из Oracle (PAM → сервер)
        pool.query(`
            CREATE TABLE IF NOT EXISTS oracle_plan2_cache (
                id INTEGER PRIMARY KEY DEFAULT 1,
                data JSONB NOT NULL DEFAULT '{}',
                fetched_at TIMESTAMP DEFAULT NOW(),
                CHECK (id = 1)
            )
        `).then(() => console.log('✅ Таблица oracle_plan2_cache готова'))
          .catch(e => console.error('❌ oracle_plan2_cache:', e.message));

        // Таблица кэша данных план4 из Oracle (PAM → сервер)
        pool.query(`
            CREATE TABLE IF NOT EXISTS oracle_plan4_cache (
                id INTEGER PRIMARY KEY DEFAULT 1,
                data JSONB NOT NULL DEFAULT '{}',
                fetched_at TIMESTAMP DEFAULT NOW(),
                CHECK (id = 1)
            )
        `).then(() => console.log('✅ Таблица oracle_plan4_cache готова'))
          .catch(e => console.error('❌ oracle_plan4_cache:', e.message));

        // Таблица кэша данных план5 из Oracle (PAM → сервер)
        pool.query(`
            CREATE TABLE IF NOT EXISTS oracle_plan5_cache (
                id INTEGER PRIMARY KEY DEFAULT 1,
                data JSONB NOT NULL DEFAULT '{}',
                fetched_at TIMESTAMP DEFAULT NOW(),
                CHECK (id = 1)
            )
        `).then(() => console.log('✅ Таблица oracle_plan5_cache готова'))
          .catch(e => console.error('❌ oracle_plan5_cache:', e.message));

        // Таблицы построчного хранения index1 (квартальная история + конкурентная работа)
        pool.query(`
            CREATE TABLE IF NOT EXISTS index1_headers (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                form_number VARCHAR(10) NOT NULL,
                year INTEGER NOT NULL,
                quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
                header_data JSONB NOT NULL DEFAULT '{}',
                version INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                updated_by VARCHAR(100),
                UNIQUE(user_id, form_number, year, quarter)
            )
        `).then(() => console.log('✅ Таблица index1_headers готова'))
          .catch(e => console.error('❌ index1_headers:', e.message));

        pool.query(`
            CREATE TABLE IF NOT EXISTS index1_rows (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                form_number VARCHAR(10) NOT NULL,
                year INTEGER NOT NULL,
                quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
                table_id VARCHAR(100) NOT NULL,
                row_order INTEGER NOT NULL DEFAULT 1,
                cells JSONB NOT NULL DEFAULT '[]',
                version INTEGER NOT NULL DEFAULT 1,
                is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                created_by VARCHAR(100),
                updated_by VARCHAR(100)
            )
        `).then(() => console.log('✅ Таблица index1_rows готова'))
          .catch(e => console.error('❌ index1_rows:', e.message));

        pool.query(`
            CREATE INDEX IF NOT EXISTS idx_index1_rows_period
            ON index1_rows (user_id, form_number, year, quarter, table_id, is_deleted, row_order)
        `).then(() => console.log('✅ Индекс idx_index1_rows_period готов'))
          .catch(e => console.error('❌ idx_index1_rows_period:', e.message));

        pool.query(`
            CREATE INDEX IF NOT EXISTS idx_index1_headers_period
            ON index1_headers (user_id, form_number, year, quarter)
        `).then(() => console.log('✅ Индекс idx_index1_headers_period готов'))
          .catch(e => console.error('❌ idx_index1_headers_period:', e.message));
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

const INDEX1_FORM_NUMBERS = new Set(['1', '2', '3', '4']);

function getCurrentQuarter() {
    return Math.floor(new Date().getMonth() / 3) + 1;
}

function parseIndex1Period(source = {}) {
    const rawYear = source.year;
    const rawQuarter = source.quarter;
    const year = Number.isInteger(Number(rawYear)) ? Number(rawYear) : new Date().getFullYear();
    const quarter = Number.isInteger(Number(rawQuarter)) ? Number(rawQuarter) : getCurrentQuarter();
    if (!Number.isInteger(year) || year < 2020 || year > 2100) return null;
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) return null;
    return { year, quarter };
}

function normalizeHeaderData(headerData) {
    const normalized = {};
    if (!headerData || typeof headerData !== 'object') return normalized;
    for (const key of Object.keys(headerData)) {
        if (!/^input_\d+$/.test(key)) continue;
        normalized[key] = headerData[key] == null ? '' : String(headerData[key]);
    }
    return normalized;
}

function normalizeCells(cells) {
    if (!Array.isArray(cells)) return [];
    return cells.map(value => value == null ? '' : String(value));
}

function parseLegacyPeriodFromHeader(formNumber, headerData) {
    const indexMap = {
        '1': { quarter: 3, year: 4 },
        '2': { quarter: 0, year: 1 },
        '3': { quarter: 0, year: 1 },
        '4': { quarter: 0, year: 1 }
    };
    const map = indexMap[String(formNumber)] || indexMap['1'];
    const quarter = Number(headerData?.[`input_${map.quarter}`]);
    const year = Number(headerData?.[`input_${map.year}`]);
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) return null;
    if (!Number.isInteger(year) || year < 2020 || year > 2100) return null;
    return { year, quarter };
}

function extractLegacyRows(formData) {
    const rows = [];
    const tables = formData?.tables || {};

    for (const [tableId, tableData] of Object.entries(tables)) {
        const rawRows = Array.isArray(tableData?.rows)
            ? tableData.rows
            : Array.isArray(tableData) ? tableData : [];
        const rowIds = Array.isArray(tableData?.rowIds) ? tableData.rowIds : [];

        let rowOrder = 1;
        rawRows.forEach((rawCells, idx) => {
            const cells = normalizeCells(rawCells);
            const hasData = cells.some(cell => String(cell || '').trim() !== '');
            if (!hasData) return;

            const candidateId = String(rowIds[idx] || '').trim();
            rows.push({
                id: candidateId,
                tableId,
                rowOrder: rowOrder++,
                cells
            });
        });
    }

    return rows;
}

function groupRowsByTable(rows) {
    const grouped = {};
    for (const row of rows) {
        if (!grouped[row.table_id]) grouped[row.table_id] = [];
        grouped[row.table_id].push({
            id: row.id,
            rowOrder: row.row_order,
            cells: Array.isArray(row.cells) ? row.cells : [],
            version: row.version,
            updatedAt: row.updated_at,
            updatedBy: row.updated_by || row.created_by || null
        });
    }
    return grouped;
}

async function loadIndex1PeriodData(userId, formNumber, year, quarter) {
    const headerResult = await pool.query(
        `SELECT header_data, version, updated_at
           FROM index1_headers
          WHERE user_id = $1 AND form_number = $2 AND year = $3 AND quarter = $4
          LIMIT 1`,
        [userId, formNumber, year, quarter]
    );

    const rowsResult = await pool.query(
        `SELECT id, table_id, row_order, cells, version, updated_at, updated_by, created_by
           FROM index1_rows
          WHERE user_id = $1
            AND form_number = $2
            AND year = $3
            AND quarter = $4
            AND is_deleted = FALSE
          ORDER BY table_id ASC, row_order ASC, created_at ASC`,
        [userId, formNumber, year, quarter]
    );

    const headerRow = headerResult.rows[0] || null;
    const groupedRows = groupRowsByTable(rowsResult.rows);

    return {
        found: !!headerRow || rowsResult.rows.length > 0,
        header: headerRow?.header_data || {},
        headerVersion: headerRow?.version || 0,
        headerUpdatedAt: headerRow?.updated_at || null,
        rowsByTable: groupedRows
    };
}

async function hasAnyIndex1Data(userId, formNumber) {
    const headerExists = await pool.query(
        `SELECT 1
           FROM index1_headers
          WHERE user_id = $1 AND form_number = $2
          LIMIT 1`,
        [userId, formNumber]
    );
    if (headerExists.rows.length > 0) return true;

    const rowsExists = await pool.query(
        `SELECT 1
           FROM index1_rows
          WHERE user_id = $1 AND form_number = $2 AND is_deleted = FALSE
          LIMIT 1`,
        [userId, formNumber]
    );
    return rowsExists.rows.length > 0;
}

async function bootstrapIndex1FromLegacyIfNeeded(user, formNumber) {
    const legacyDocResult = await pool.query(
        `SELECT form_data, attached_files
           FROM documents
          WHERE user_id = $1 AND form_number = $2 AND type = 'json'
          ORDER BY uploaded_at DESC
          LIMIT 1`,
        [user.id, formNumber]
    );

    if (legacyDocResult.rows.length === 0) return null;

    const legacyDoc = legacyDocResult.rows[0];
    const legacyFormData = legacyDoc.form_data || {};
    const header = normalizeHeaderData(legacyFormData.header || {});
    const legacyPeriod = parseLegacyPeriodFromHeader(formNumber, header);
    if (!legacyPeriod) return null;

    const existing = await loadIndex1PeriodData(user.id, formNumber, legacyPeriod.year, legacyPeriod.quarter);
    if (existing.found) return null;

    await pool.query(
        `INSERT INTO index1_headers
            (id, user_id, form_number, year, quarter, header_data, version, created_at, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW(), $7)
         ON CONFLICT (user_id, form_number, year, quarter) DO NOTHING`,
        [
            generateId(),
            user.id,
            formNumber,
            legacyPeriod.year,
            legacyPeriod.quarter,
            JSON.stringify(header),
            user.username || null
        ]
    );

    const legacyRows = extractLegacyRows(legacyFormData);
    for (const row of legacyRows) {
        let rowId = row.id && row.id.length <= 120 ? row.id : generateId();
        const idCheck = await pool.query(
            `SELECT id FROM index1_rows WHERE id = $1 LIMIT 1`,
            [rowId]
        );
        if (idCheck.rows.length > 0) {
            rowId = generateId();
        }

        await pool.query(
            `INSERT INTO index1_rows
                (id, user_id, form_number, year, quarter, table_id, row_order, cells, version, is_deleted, created_at, updated_at, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, FALSE, NOW(), NOW(), $9, $9)`,
            [
                rowId,
                user.id,
                formNumber,
                legacyPeriod.year,
                legacyPeriod.quarter,
                row.tableId,
                row.rowOrder,
                JSON.stringify(row.cells),
                user.username || null
            ]
        );
    }

    return {
        period: legacyPeriod,
        attachedFiles: legacyDoc.attached_files || {}
    };
}

async function syncLegacyIndex1Document(user, formNumber, year, quarter) {
    const periodData = await loadIndex1PeriodData(user.id, formNumber, year, quarter);
    const tables = {};
    for (const [tableId, rows] of Object.entries(periodData.rowsByTable)) {
        tables[tableId] = {
            rows: rows.map(r => r.cells || []),
            rowIds: rows.map(r => r.id)
        };
    }

    const legacyFormData = {
        header: periodData.header || {},
        tables
    };

    const existingResult = await pool.query(
        `SELECT id, attached_files
           FROM documents
          WHERE user_id = $1 AND form_number = $2 AND type = 'json'
          ORDER BY uploaded_at DESC
          LIMIT 1`,
        [user.id, formNumber]
    );

    if (existingResult.rows.length > 0) {
        await pool.query(
            `UPDATE documents
                SET form_data = $1,
                    organization = $2,
                    submitted_at = NOW(),
                    uploaded_at = NOW(),
                    username = $3,
                    user_full_name = $4,
                    user_email = $5,
                    user_organization = $6
              WHERE id = $7`,
            [
                JSON.stringify(legacyFormData),
                user.organization || '',
                user.username || '',
                user.fullName || user.full_name || user.username || '',
                user.email || '',
                user.organization || '',
                existingResult.rows[0].id
            ]
        );
    } else {
        await pool.query(
            `INSERT INTO documents (
                id, user_id, type, form_number, form_data, attached_files, organization,
                submitted_at, uploaded_at, username, user_full_name, user_email, user_organization
            ) VALUES ($1, $2, 'json', $3, $4, $5, $6, NOW(), NOW(), $7, $8, $9, $10)`,
            [
                generateId(),
                user.id,
                formNumber,
                JSON.stringify(legacyFormData),
                JSON.stringify({}),
                user.organization || '',
                user.username || '',
                user.fullName || user.full_name || user.username || '',
                user.email || '',
                user.organization || ''
            ]
        );
    }
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

// =====================================================
// INDEX1 V2: ПОСТРОЧНОЕ ХРАНЕНИЕ + КВАРТАЛЬНАЯ ИСТОРИЯ
// =====================================================

app.get('/api/index1/forms/:formNumber/quarters', authenticateToken, async (req, res) => {
    try {
        const { formNumber } = req.params;
        if (!INDEX1_FORM_NUMBERS.has(formNumber)) {
            return res.status(400).json({ error: 'Поддерживаются только формы 1-4' });
        }

        const result = await pool.query(
            `SELECT year, quarter, MAX(updated_at) AS updated_at
               FROM (
                    SELECT year, quarter, updated_at
                      FROM index1_headers
                     WHERE user_id = $1 AND form_number = $2
                    UNION ALL
                    SELECT year, quarter, updated_at
                      FROM index1_rows
                     WHERE user_id = $1 AND form_number = $2 AND is_deleted = FALSE
               ) q
              GROUP BY year, quarter
              ORDER BY year DESC, quarter DESC`,
            [req.user.id, formNumber]
        );

        res.json({
            success: true,
            formNumber,
            quarters: result.rows.map(r => ({
                year: r.year,
                quarter: r.quarter,
                updatedAt: r.updated_at
            }))
        });
    } catch (error) {
        console.error('Ошибка index1 quarters:', error);
        res.status(500).json({ error: 'Ошибка при получении списка кварталов' });
    }
});

app.get('/api/index1/forms/:formNumber', authenticateToken, async (req, res) => {
    try {
        const { formNumber } = req.params;
        if (!INDEX1_FORM_NUMBERS.has(formNumber)) {
            return res.status(400).json({ error: 'Поддерживаются только формы 1-4' });
        }

        const period = parseIndex1Period(req.query);
        if (!period) {
            return res.status(400).json({ error: 'Некорректный year/quarter' });
        }

        let effectivePeriod = { ...period };
        let data = await loadIndex1PeriodData(req.user.id, formNumber, effectivePeriod.year, effectivePeriod.quarter);
        let attachedFiles = {};

        if (!data.found) {
            const hasAnyData = await hasAnyIndex1Data(req.user.id, formNumber);
            const bootstrapped = !hasAnyData
                ? await bootstrapIndex1FromLegacyIfNeeded(req.user, formNumber)
                : null;
            if (bootstrapped?.period) {
                effectivePeriod = bootstrapped.period;
                attachedFiles = bootstrapped.attachedFiles || {};
                data = await loadIndex1PeriodData(req.user.id, formNumber, effectivePeriod.year, effectivePeriod.quarter);
            }
        }

        if (!attachedFiles || Object.keys(attachedFiles).length === 0) {
            const legacyDocResult = await pool.query(
                `SELECT attached_files
                   FROM documents
                  WHERE user_id = $1 AND form_number = $2 AND type = 'json'
                  ORDER BY uploaded_at DESC
                  LIMIT 1`,
                [req.user.id, formNumber]
            );
            attachedFiles = legacyDocResult.rows[0]?.attached_files || {};
        }

        res.json({
            success: true,
            found: data.found,
            formNumber,
            year: effectivePeriod.year,
            quarter: effectivePeriod.quarter,
            header: data.header,
            headerVersion: data.headerVersion,
            headerUpdatedAt: data.headerUpdatedAt,
            rowsByTable: data.rowsByTable,
            attachedFiles
        });
    } catch (error) {
        console.error('Ошибка index1 load:', error);
        res.status(500).json({ error: 'Ошибка при загрузке формы index1' });
    }
});

app.patch('/api/index1/forms/:formNumber/header', authenticateToken, async (req, res) => {
    try {
        const { formNumber } = req.params;
        if (!INDEX1_FORM_NUMBERS.has(formNumber)) {
            return res.status(400).json({ error: 'Поддерживаются только формы 1-4' });
        }

        const period = parseIndex1Period(req.body);
        if (!period) {
            return res.status(400).json({ error: 'Некорректный year/quarter' });
        }

        const header = normalizeHeaderData(req.body.header);
        const expectedVersion = req.body.expectedVersion == null
            ? null
            : Number(req.body.expectedVersion);
        if (expectedVersion != null && (!Number.isInteger(expectedVersion) || expectedVersion < 0)) {
            return res.status(400).json({ error: 'Некорректный expectedVersion' });
        }

        const existingResult = await pool.query(
            `SELECT id, version, header_data
               FROM index1_headers
              WHERE user_id = $1 AND form_number = $2 AND year = $3 AND quarter = $4
              LIMIT 1`,
            [req.user.id, formNumber, period.year, period.quarter]
        );

        let newVersion = 1;

        if (existingResult.rows.length === 0) {
            await pool.query(
                `INSERT INTO index1_headers
                    (id, user_id, form_number, year, quarter, header_data, version, created_at, updated_at, updated_by)
                 VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW(), $7)`,
                [
                    generateId(),
                    req.user.id,
                    formNumber,
                    period.year,
                    period.quarter,
                    JSON.stringify(header),
                    req.user.username || null
                ]
            );
            newVersion = 1;
        } else {
            const current = existingResult.rows[0];
            if (expectedVersion != null && expectedVersion !== current.version) {
                return res.status(409).json({
                    error: 'Конфликт версий: шапка уже изменена другим пользователем',
                    currentVersion: current.version,
                    currentHeader: current.header_data
                });
            }

            const updateResult = await pool.query(
                `UPDATE index1_headers
                    SET header_data = $1,
                        version = version + 1,
                        updated_at = NOW(),
                        updated_by = $2
                  WHERE id = $3
                  RETURNING version`,
                [JSON.stringify(header), req.user.username || null, current.id]
            );
            newVersion = updateResult.rows[0].version;
        }

        try {
            await syncLegacyIndex1Document(req.user, formNumber, period.year, period.quarter);
        } catch (syncError) {
            console.warn('index1 header sync to legacy failed:', syncError.message);
        }

        res.json({
            success: true,
            formNumber,
            year: period.year,
            quarter: period.quarter,
            version: newVersion,
            header
        });
    } catch (error) {
        console.error('Ошибка index1 header save:', error);
        res.status(500).json({ error: 'Ошибка при сохранении шапки' });
    }
});

app.post('/api/index1/forms/:formNumber/rows', authenticateToken, async (req, res) => {
    try {
        const { formNumber } = req.params;
        if (!INDEX1_FORM_NUMBERS.has(formNumber)) {
            return res.status(400).json({ error: 'Поддерживаются только формы 1-4' });
        }

        const period = parseIndex1Period(req.body);
        if (!period) {
            return res.status(400).json({ error: 'Некорректный year/quarter' });
        }

        const tableId = String(req.body.tableId || '').trim();
        if (!tableId) {
            return res.status(400).json({ error: 'tableId обязателен' });
        }

        const cells = normalizeCells(req.body.cells);
        let rowOrder = Number(req.body.rowOrder);
        if (!Number.isInteger(rowOrder) || rowOrder <= 0) {
            const nextOrderResult = await pool.query(
                `SELECT COALESCE(MAX(row_order), 0) + 1 AS next_order
                   FROM index1_rows
                  WHERE user_id = $1
                    AND form_number = $2
                    AND year = $3
                    AND quarter = $4
                    AND table_id = $5
                    AND is_deleted = FALSE`,
                [req.user.id, formNumber, period.year, period.quarter, tableId]
            );
            rowOrder = nextOrderResult.rows[0].next_order || 1;
        }

        const candidateRowId = String(req.body.rowId || '').trim();
        if (candidateRowId && candidateRowId.length > 120) {
            return res.status(400).json({ error: 'rowId слишком длинный' });
        }
        if (candidateRowId) {
            const idCheck = await pool.query(
                `SELECT id FROM index1_rows WHERE id = $1 LIMIT 1`,
                [candidateRowId]
            );
            if (idCheck.rows.length > 0) {
                return res.status(409).json({ error: 'rowId уже существует' });
            }
        }
        const rowId = candidateRowId || generateId();
        const insertResult = await pool.query(
            `INSERT INTO index1_rows
                (id, user_id, form_number, year, quarter, table_id, row_order, cells, version, is_deleted, created_at, updated_at, created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, FALSE, NOW(), NOW(), $9, $9)
             RETURNING id, table_id, row_order, cells, version, updated_at, updated_by`,
            [
                rowId,
                req.user.id,
                formNumber,
                period.year,
                period.quarter,
                tableId,
                rowOrder,
                JSON.stringify(cells),
                req.user.username || null
            ]
        );

        try {
            await syncLegacyIndex1Document(req.user, formNumber, period.year, period.quarter);
        } catch (syncError) {
            console.warn('index1 row insert sync to legacy failed:', syncError.message);
        }

        const row = insertResult.rows[0];
        res.json({
            success: true,
            formNumber,
            year: period.year,
            quarter: period.quarter,
            row: {
                id: row.id,
                tableId: row.table_id,
                rowOrder: row.row_order,
                cells: row.cells,
                version: row.version,
                updatedAt: row.updated_at,
                updatedBy: row.updated_by
            }
        });
    } catch (error) {
        console.error('Ошибка index1 row create:', error);
        res.status(500).json({ error: 'Ошибка при добавлении строки' });
    }
});

app.put('/api/index1/forms/:formNumber/rows/:rowId', authenticateToken, async (req, res) => {
    try {
        const { formNumber, rowId } = req.params;
        if (!INDEX1_FORM_NUMBERS.has(formNumber)) {
            return res.status(400).json({ error: 'Поддерживаются только формы 1-4' });
        }

        const period = parseIndex1Period(req.body);
        if (!period) {
            return res.status(400).json({ error: 'Некорректный year/quarter' });
        }

        const tableId = String(req.body.tableId || '').trim();
        if (!tableId) {
            return res.status(400).json({ error: 'tableId обязателен' });
        }

        const expectedVersion = Number(req.body.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
            return res.status(400).json({ error: 'expectedVersion обязателен и должен быть > 0' });
        }

        const currentResult = await pool.query(
            `SELECT id, cells, version, row_order
               FROM index1_rows
              WHERE id = $1
                AND user_id = $2
                AND form_number = $3
                AND year = $4
                AND quarter = $5
                AND table_id = $6
                AND is_deleted = FALSE
              LIMIT 1`,
            [rowId, req.user.id, formNumber, period.year, period.quarter, tableId]
        );

        if (currentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Строка не найдена' });
        }

        const currentRow = currentResult.rows[0];
        if (currentRow.version !== expectedVersion) {
            return res.status(409).json({
                error: 'Конфликт версий: строка уже изменена другим пользователем',
                currentVersion: currentRow.version,
                currentCells: currentRow.cells
            });
        }

        const cells = normalizeCells(req.body.cells);
        const updateResult = await pool.query(
            `UPDATE index1_rows
                SET cells = $1,
                    version = version + 1,
                    updated_at = NOW(),
                    updated_by = $2
              WHERE id = $3
              RETURNING id, table_id, row_order, cells, version, updated_at, updated_by`,
            [JSON.stringify(cells), req.user.username || null, rowId]
        );

        try {
            await syncLegacyIndex1Document(req.user, formNumber, period.year, period.quarter);
        } catch (syncError) {
            console.warn('index1 row update sync to legacy failed:', syncError.message);
        }

        const row = updateResult.rows[0];
        res.json({
            success: true,
            formNumber,
            year: period.year,
            quarter: period.quarter,
            row: {
                id: row.id,
                tableId: row.table_id,
                rowOrder: row.row_order,
                cells: row.cells,
                version: row.version,
                updatedAt: row.updated_at,
                updatedBy: row.updated_by
            }
        });
    } catch (error) {
        console.error('Ошибка index1 row update:', error);
        res.status(500).json({ error: 'Ошибка при обновлении строки' });
    }
});

app.delete('/api/index1/forms/:formNumber/rows/:rowId', authenticateToken, async (req, res) => {
    try {
        const { formNumber, rowId } = req.params;
        if (!INDEX1_FORM_NUMBERS.has(formNumber)) {
            return res.status(400).json({ error: 'Поддерживаются только формы 1-4' });
        }

        const period = parseIndex1Period(req.body || {});
        if (!period) {
            return res.status(400).json({ error: 'Некорректный year/quarter' });
        }

        const tableId = String(req.body?.tableId || '').trim();
        if (!tableId) {
            return res.status(400).json({ error: 'tableId обязателен' });
        }

        const expectedVersion = Number(req.body?.expectedVersion);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
            return res.status(400).json({ error: 'expectedVersion обязателен и должен быть > 0' });
        }

        const currentResult = await pool.query(
            `SELECT id, version
               FROM index1_rows
              WHERE id = $1
                AND user_id = $2
                AND form_number = $3
                AND year = $4
                AND quarter = $5
                AND table_id = $6
                AND is_deleted = FALSE
              LIMIT 1`,
            [rowId, req.user.id, formNumber, period.year, period.quarter, tableId]
        );

        if (currentResult.rows.length === 0) {
            return res.status(404).json({ error: 'Строка не найдена' });
        }

        const currentVersion = currentResult.rows[0].version;
        if (currentVersion !== expectedVersion) {
            return res.status(409).json({
                error: 'Конфликт версий: строка уже изменена другим пользователем',
                currentVersion
            });
        }

        await pool.query(
            `UPDATE index1_rows
                SET is_deleted = TRUE,
                    version = version + 1,
                    updated_at = NOW(),
                    updated_by = $1
              WHERE id = $2`,
            [req.user.username || null, rowId]
        );

        try {
            await syncLegacyIndex1Document(req.user, formNumber, period.year, period.quarter);
        } catch (syncError) {
            console.warn('index1 row delete sync to legacy failed:', syncError.message);
        }

        res.json({ success: true, message: 'Строка удалена' });
    } catch (error) {
        console.error('Ошибка index1 row delete:', error);
        res.status(500).json({ error: 'Ошибка при удалении строки' });
    }
});

app.delete('/api/index1/my', authenticateToken, async (req, res) => {
    try {
        const headersDeleted = await pool.query(
            `DELETE FROM index1_headers WHERE user_id = $1`,
            [req.user.id]
        );
        const rowsDeleted = await pool.query(
            `DELETE FROM index1_rows WHERE user_id = $1`,
            [req.user.id]
        );
        const legacyDeleted = await pool.query(
            `DELETE FROM documents WHERE user_id = $1 AND type = 'json'`,
            [req.user.id]
        );

        res.json({
            success: true,
            message: 'Ваши ответы удалены из новой и legacy модели',
            deletedHeaders: headersDeleted.rowCount,
            deletedRows: rowsDeleted.rowCount,
            deletedLegacy: legacyDeleted.rowCount
        });
    } catch (error) {
        console.error('Ошибка удаления index1/my:', error);
        res.status(500).json({ error: 'Ошибка при удалении ответов index1' });
    }
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
        cell(h, colW[i], { bold: true, center: true })
    ).join('') + '</w:tr>';

    let dataRows = '';
    planData.forEach((row, idx) => {
        const isTotal = row[0] === '-' || String(row[1] || '').trim() === 'Всего';
        const fill = null;
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
            5: 'Рассмотрение не менее 53,5% дел первичного освидетельствования ОМК МСЭ при оказании государственной услуги «Установление инвалидности и/или степени утраты трудоспособности, и/или определению мер социальной защиты',
            6: 'Направление поступивших формуляров (по Соглашению государств-членов ЕАЭС) на подтверждение в компетентные органы',
            7: 'Проведение проверки пенсионных выплат по возрасту с признаками предоставления заявителем недостоверных сведений (отчетная группа №360 в АИС «Е-макет»)',
            8: 'Обеспечение наполнения интернет-ресурса территориального департамента (по доступности, по пенсионному обеспечению, ТСР)'
        };
        
        const planFileNames = {
            1: 'План № 1', 2: 'План № 2', 3: 'План № 3', 4: 'План № 4',
            5: 'План № 5', 6: 'План № 6', 7: 'План № 7', 8: 'План № 8'
        };

        const planSPLabels = {
            1: 'Курирующее отраслевое СП  - ДИ',
            2: 'Курирующее отраслевое СП  - ДИ',
            3: 'Курирующее отраслевое СП',
            4: 'Курирующее отраслевое СП  - ДМСЭ',
            5: 'Курирующее отраслевое СП  - ДМСЭ',
            6: 'Курирующее отраслевое СП  - ДМСЭ',
            7: 'Курирующее отраслевое СП  - ДСОСС',
            8: 'Курирующее отраслевое СП  - Пресс-служба'
        };
        
        // Убираем «» перед датой (все варианты: слитно, с пробелом, разнесённые по тегам)
        docXml = docXml.replace(/«\s*»/g, '');
        docXml = docXml.replace(/«(<\/w:t><\/w:r><w:r[^>]*><w:t[^>]*>|\s*)»/g, '');
        docXml = docXml.replace(/«/g, '').replace(/»/g, '');

        // Заменяем "ПЛАН РАБОТЫ" на "ПЛАН РАБОТЫ №X"
        docXml = docXml.replace(/ПЛАН РАБОТЫ/g, `ПЛАН РАБОТЫ №${fileNum}`);

        // Заменяем "Курирующее отраслевое СП  - ДИ" на нужный текст
        const spLabel = planSPLabels[planNumber] || 'Курирующее отраслевое СП';
        docXml = docXml.replace(/Курирующее отраслевое СП\s+- ДИ/g, spLabel);

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
// ORACLE PLAN2 CACHE  (PAM → Server push)
// =====================================================

const ORACLE_PUSH_SECRET = process.env.ORACLE_PUSH_SECRET || 'oracle_push_secret_2026';

// Маппинг: позиция строки в Oracle view (ORDER BY REGION) → название региона на сайте
// Порядок зафиксирован по алфавиту: view возвращает 20 строк в этом порядке
const ORACLE_ROW_TO_REGION = [
    null,                                   // 0 — не используется
    'Акмолинская область',                  // 1  АКМОЛИНСКАЯ ОБЛАСТЬ
    'Актюбинская область',                  // 2  АКТЮБИНСКАЯ ОБЛАСТЬ
    'Алматинская область',                  // 3  АЛМАТИНСКАЯ ОБЛАСТЬ
    'Атырауская область',                   // 4  АТЫРАУСКАЯ ОБЛАСТЬ
    'Восточно-Казахстанская область',       // 5  ВОСТОЧНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ
    'г. Алматы',                            // 6  Г.АЛМАТЫ
    'г. Астана',                            // 7  Г.АСТАНА
    'г. Шымкент',                           // 8  Г.ШЫМКЕНТ
    'Жамбылская область',                   // 9  ЖАМБЫЛСКАЯ ОБЛАСТЬ
    'Западно-Казахстанская область',        // 10 ЗАПАДНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ
    'Карагандинская область',               // 11 КАРАГАНДИНСКАЯ ОБЛАСТЬ
    'Костанайская область',                 // 12 КОСТАНАЙСКАЯ ОБЛАСТЬ
    'Кызылординская область',               // 13 КЫЗЫЛОРДИНСКАЯ ОБЛАСТЬ
    'Мангистауская область',                // 14 МАНГИСТАУСКАЯ ОБЛАСТЬ
    'Область Абай',                         // 15 ОБЛАСТЬ АБАЙ
    'Область Жетысу',                       // 16 ОБЛАСТЬ ЖЕТЫСУ
    'Область Улытау',                       // 17 ОБЛАСТЬ УЛЫТАУ
    'Павлодарская область',                 // 18 ПАВЛОДАРСКАЯ ОБЛАСТЬ
    'Северо-Казахстанская область',         // 19 СЕВЕРО-КАЗАХСТАНСКАЯ ОБЛАСТЬ
    'Туркестанская область',                // 20 ТУРКЕСТАНСКАЯ ОБЛАСТЬ
];

// Маппинг для плана 5: REG_ID из view_omk_qlick (это текстовое название) → полное название на сайте
// Ключи — сокращённые названия из Oracle, значения — полные названия как на сайте
const ORACLE_REGNAME_TO_REGION_PLAN5 = {
    'Абай':           'Область Абай',
    'Акмолинская':    'Акмолинская область',
    'Актюбинская':    'Актюбинская область',
    'Алматинская':    'Алматинская область',
    'Атырауская':     'Атырауская область',
    'ВКО':            'Восточно-Казахстанская область',
    'г. Алматы':      'г. Алматы',
    'г. Астана':      'г. Астана',
    'г. Шымкент':     'г. Шымкент',
    'Жамбылская':     'Жамбылская область',
    'Жетісу':         'Область Жетысу',
    'ЗКО':            'Западно-Казахстанская область',
    'Карагандинская': 'Карагандинская область',
    'Костанайская':   'Костанайская область',
    'Кызылординская': 'Кызылординская область',
    'Мангистауская':  'Мангистауская область',
    'Павлодарская':   'Павлодарская область',
    'СКО':            'Северо-Казахстанская область',
    'Туркестанская':  'Туркестанская область',
    // Улытау — может прийти с нестандартным символом Ў (Windows-1251 артефакт)
    'Улытау':         'Область Улытау',
    '\u040Eлытау':    'Область Улытау',  // Ўлытау
    '\u04B0лытау':    'Область Улытау',  // Ұлытау (казахский)
};

// Маппинг для плана 4: ORDER BY ID (01..20) → название региона на сайте
const ORACLE_ROW_TO_REGION_PLAN4 = [
    null,                                   // 0 — не используется
    'Акмолинская область',                  // 1  ID=01
    'Актюбинская область',                  // 2  ID=02
    'Алматинская область',                  // 3  ID=03
    'Атырауская область',                   // 4  ID=04
    'Восточно-Казахстанская область',       // 5  ID=05 (ВКО)
    'Жамбылская область',                   // 6  ID=06
    'Западно-Казахстанская область',        // 7  ID=07 (ЗКО)
    'Карагандинская область',               // 8  ID=08
    'Кызылординская область',               // 9  ID=09
    'Костанайская область',                 // 10 ID=10
    'Мангистауская область',                // 11 ID=11
    'Павлодарская область',                 // 12 ID=12
    'Северо-Казахстанская область',         // 13 ID=13 (СКО)
    'Туркестанская область',                // 14 ID=14
    'г. Алматы',                            // 15 ID=15
    'г. Астана',                            // 16 ID=16
    'г. Шымкент',                           // 17 ID=17
    'Область Абай',                         // 18 ID=18
    'Область Жетысу',                       // 19 ID=19
    'Область Улытау',                       // 20 ID=20
];

/**
 * POST /api/plans/oracle-push
 * Принимает данные плана 2 или 4 от PAM-скрипта и сохраняет в кэш.
 * Тело: { secret, planId: 2|4, oracleRows: [{row, proc}], fetchedAt }
 */
app.post('/api/plans/oracle-push', async (req, res) => {
    try {
        const { secret, planId, oracleRows, plan2Source: legacySource, fetchedAt } = req.body;

        if (!secret || secret !== ORACLE_PUSH_SECRET) {
            console.warn('⚠️ oracle-push: неверный секрет');
            return res.status(403).json({ error: 'Доступ запрещён' });
        }

        const targetPlan = parseInt(planId) || 2;
        const cacheTable = `oracle_plan${targetPlan}_cache`;

        let planSource = {};

        if (oracleRows && Array.isArray(oracleRows)) {
            if (targetPlan === 5) {
                // План 5: элементы содержат regName (текстовое название из Oracle)
                for (const item of oracleRows) {
                    const key = (item.regName || '').trim();
                    const regionName = ORACLE_REGNAME_TO_REGION_PLAN5[key];
                    if (!regionName) {
                        console.warn(`⚠️ oracle-push plan5: нет маппинга для "${key}"`);
                        continue;
                    }
                    planSource[regionName] = parseFloat(item.proc) || 0;
                }
            } else {
                // Планы 2, 4: элементы содержат row (позицию)
                const rowMapping = targetPlan === 4 ? ORACLE_ROW_TO_REGION_PLAN4 : ORACLE_ROW_TO_REGION;
                for (const item of oracleRows) {
                    const regionName = rowMapping[item.row];
                    if (!regionName) {
                        console.warn(`⚠️ oracle-push plan${targetPlan}: строка ${item.row} не имеет маппинга`);
                        continue;
                    }
                    planSource[regionName] = parseFloat(item.proc) || 0;
                }
            }
        } else if (legacySource && typeof legacySource === 'object') {
            planSource = legacySource;
        } else {
            return res.status(400).json({ error: 'Нет данных: oracleRows или plan2Source' });
        }

        const regionCount = Object.keys(planSource).length;
        if (regionCount === 0) {
            return res.status(400).json({ error: 'Нет данных после маппинга' });
        }

        await pool.query(`
            INSERT INTO ${cacheTable} (id, data, fetched_at)
            VALUES (1, $1, NOW())
            ON CONFLICT (id) DO UPDATE
                SET data = $1, fetched_at = NOW()
        `, [JSON.stringify(planSource)]);

        console.log(`✅ oracle-push plan${targetPlan}: ${regionCount} регионов (${new Date().toLocaleString('ru-RU')})`);

        res.json({ success: true, regions: regionCount, plan: targetPlan, fetchedAt: fetchedAt || new Date().toISOString() });

    } catch (error) {
        console.error('❌ oracle-push ошибка:', error.message);
        res.status(500).json({ error: 'Ошибка при сохранении данных Oracle' });
    }
});

/**
 * GET /api/plans/oracle-plan2
 * Возвращает закэшированные данные плана 2 из Oracle.
 */
app.get('/api/plans/oracle-plan2', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT data, fetched_at FROM oracle_plan2_cache WHERE id = 1`
        );

        if (result.rows.length === 0) {
            return res.json({ success: true, found: false, data: {}, fetchedAt: null });
        }

        res.json({
            success: true,
            found: true,
            data: result.rows[0].data,
            fetchedAt: result.rows[0].fetched_at
        });

    } catch (error) {
        console.error('❌ oracle-plan2 ошибка:', error.message);
        res.status(500).json({ error: 'Ошибка при чтении кэша Oracle' });
    }
});

/**
 * GET /api/plans/oracle-plan4
 * Возвращает закэшированные данные плана 4 из Oracle.
 */
app.get('/api/plans/oracle-plan4', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT data, fetched_at FROM oracle_plan4_cache WHERE id = 1`
        );

        if (result.rows.length === 0) {
            return res.json({ success: true, found: false, data: {}, fetchedAt: null });
        }

        res.json({
            success: true,
            found: true,
            data: result.rows[0].data,
            fetchedAt: result.rows[0].fetched_at
        });

    } catch (error) {
        console.error('❌ oracle-plan4 ошибка:', error.message);
        res.status(500).json({ error: 'Ошибка при чтении кэша Oracle' });
    }
});

/**
 * GET /api/plans/oracle-plan5
 * Возвращает закэшированные данные плана 5 из Oracle (INSPECT/OCH*100).
 */
app.get('/api/plans/oracle-plan5', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT data, fetched_at FROM oracle_plan5_cache WHERE id = 1`
        );

        if (result.rows.length === 0) {
            return res.json({ success: true, found: false, data: {}, fetchedAt: null });
        }

        res.json({
            success: true,
            found: true,
            data: result.rows[0].data,
            fetchedAt: result.rows[0].fetched_at
        });

    } catch (error) {
        console.error('❌ oracle-plan5 ошибка:', error.message);
        res.status(500).json({ error: 'Ошибка при чтении кэша Oracle' });
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
