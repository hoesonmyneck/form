/**
 * МОДУЛЬ РАБОТЫ С БАЗОЙ ДАННЫХ PostgreSQL
 */

const { Pool } = require('pg');

// Конфигурация подключения к БД
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'forms_db',
    user: process.env.DB_USER || 'forms_user',
    password: process.env.DB_PASSWORD || 'forms_password_2024',
    max: 20, // Максимум соединений в пуле
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Проверка подключения
pool.on('connect', () => {
    console.log('✅ Подключено к базе данных PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ Ошибка подключения к БД:', err);
    process.exit(-1);
});

/**
 * Выполнить SQL запрос
 */
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('📊 Запрос выполнен:', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('❌ Ошибка выполнения запроса:', error);
        throw error;
    }
}

/**
 * Получить клиента для транзакций
 */
async function getClient() {
    return await pool.connect();
}

// =====================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ
// =====================================================

/**
 * Создать нового пользователя
 */
async function createUser({ username, email, passwordHash, fullName, organization, role = 'user' }) {
    const text = `
        INSERT INTO users (username, email, password_hash, full_name, organization, role)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, username, email, full_name, organization, role, created_at
    `;
    const values = [username, email, passwordHash, fullName, organization, role];
    const result = await query(text, values);
    return result.rows[0];
}

/**
 * Найти пользователя по email
 */
async function findUserByEmail(email) {
    const text = 'SELECT * FROM users WHERE email = $1 AND is_active = true';
    const result = await query(text, [email]);
    return result.rows[0];
}

/**
 * Найти пользователя по username
 */
async function findUserByUsername(username) {
    const text = 'SELECT * FROM users WHERE username = $1 AND is_active = true';
    const result = await query(text, [username]);
    return result.rows[0];
}

/**
 * Найти пользователя по ID
 */
async function findUserById(id) {
    const text = 'SELECT id, username, email, full_name, organization, role, created_at FROM users WHERE id = $1 AND is_active = true';
    const result = await query(text, [id]);
    return result.rows[0];
}

/**
 * Получить всех пользователей
 */
async function getAllUsers() {
    const text = 'SELECT id, username, email, full_name, organization, role, is_active, created_at FROM users ORDER BY created_at DESC';
    const result = await query(text);
    return result.rows;
}

// =====================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С СЕССИЯМИ
// =====================================================

/**
 * Создать сессию (сохранить refresh token)
 */
async function createSession({ userId, refreshToken, expiresAt, ipAddress, userAgent }) {
    const text = `
        INSERT INTO sessions (user_id, refresh_token, expires_at, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
    `;
    const values = [userId, refreshToken, expiresAt, ipAddress, userAgent];
    const result = await query(text, values);
    return result.rows[0];
}

/**
 * Найти сессию по refresh token
 */
async function findSessionByToken(refreshToken) {
    const text = `
        SELECT s.*, u.id as user_id, u.username, u.email, u.role
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.refresh_token = $1 AND s.expires_at > NOW() AND u.is_active = true
    `;
    const result = await query(text, [refreshToken]);
    return result.rows[0];
}

/**
 * Удалить сессию (logout)
 */
async function deleteSession(refreshToken) {
    const text = 'DELETE FROM sessions WHERE refresh_token = $1';
    await query(text, [refreshToken]);
}

/**
 * Удалить все сессии пользователя
 */
async function deleteUserSessions(userId) {
    const text = 'DELETE FROM sessions WHERE user_id = $1';
    await query(text, [userId]);
}

/**
 * Очистить устаревшие сессии
 */
async function cleanExpiredSessions() {
    const text = 'DELETE FROM sessions WHERE expires_at < NOW()';
    const result = await query(text);
    console.log(`🧹 Удалено устаревших сессий: ${result.rowCount}`);
}

// =====================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С ДОКУМЕНТАМИ
// =====================================================

/**
 * Создать документ
 */
async function createDocument({ userId, filename, originalName, fileSize, formNumber, organization, formData }) {
    const text = `
        INSERT INTO documents (user_id, filename, original_name, file_size, form_number, organization, form_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, filename, original_name, file_size, form_number, organization, submitted_at, created_at
    `;
    const values = [userId, filename, originalName, fileSize, formNumber, organization, JSON.stringify(formData)];
    const result = await query(text, values);
    return result.rows[0];
}

/**
 * Получить все документы
 */
async function getAllDocuments(limit = 100, offset = 0) {
    const text = `
        SELECT 
            d.*,
            u.username,
            u.full_name as user_full_name,
            u.organization as user_organization
        FROM documents d
        LEFT JOIN users u ON d.user_id = u.id
        ORDER BY d.submitted_at DESC
        LIMIT $1 OFFSET $2
    `;
    const result = await query(text, [limit, offset]);
    return result.rows;
}

/**
 * Получить документы пользователя
 */
async function getUserDocuments(userId, limit = 100, offset = 0) {
    const text = `
        SELECT * FROM documents
        WHERE user_id = $1
        ORDER BY submitted_at DESC
        LIMIT $2 OFFSET $3
    `;
    const result = await query(text, [userId, limit, offset]);
    return result.rows;
}

/**
 * Найти документ по ID
 */
async function findDocumentById(id) {
    const text = `
        SELECT 
            d.*,
            u.username,
            u.full_name as user_full_name
        FROM documents d
        LEFT JOIN users u ON d.user_id = u.id
        WHERE d.id = $1
    `;
    const result = await query(text, [id]);
    return result.rows[0];
}

/**
 * Удалить документ
 */
async function deleteDocument(id) {
    const text = 'DELETE FROM documents WHERE id = $1 RETURNING *';
    const result = await query(text, [id]);
    return result.rows[0];
}

/**
 * Получить статистику по документам
 */
async function getDocumentsStats() {
    const text = `
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN form_number = '1' THEN 1 END) as form1,
            COUNT(CASE WHEN form_number = '2' THEN 1 END) as form2,
            COUNT(CASE WHEN form_number = '3' THEN 1 END) as form3,
            COUNT(CASE WHEN form_number = '4' THEN 1 END) as form4,
            COUNT(CASE WHEN form_number = 'all' THEN 1 END) as all_forms,
            COALESCE(SUM(file_size), 0) as total_size,
            MAX(submitted_at) as last_upload
        FROM documents
    `;
    const result = await query(text);
    return result.rows[0];
}

// =====================================================
// ФУНКЦИИ ДЛЯ АУДИТА
// =====================================================

/**
 * Добавить запись в журнал аудита
 */
async function addAuditLog({ userId, action, entityType, entityId, details, ipAddress }) {
    const text = `
        INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
    `;
    const values = [userId, action, entityType, entityId, JSON.stringify(details), ipAddress];
    const result = await query(text, values);
    return result.rows[0];
}

/**
 * Получить журнал аудита
 */
async function getAuditLog(limit = 100, offset = 0) {
    const text = `
        SELECT 
            a.*,
            u.username,
            u.full_name
        FROM audit_log a
        LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.created_at DESC
        LIMIT $1 OFFSET $2
    `;
    const result = await query(text, [limit, offset]);
    return result.rows;
}

// Экспортируем функции
module.exports = {
    query,
    getClient,
    pool,
    
    // Пользователи
    createUser,
    findUserByEmail,
    findUserByUsername,
    findUserById,
    getAllUsers,
    
    // Сессии
    createSession,
    findSessionByToken,
    deleteSession,
    deleteUserSessions,
    cleanExpiredSessions,
    
    // Документы
    createDocument,
    getAllDocuments,
    getUserDocuments,
    findDocumentById,
    deleteDocument,
    getDocumentsStats,
    
    // Аудит
    addAuditLog,
    getAuditLog,
};
