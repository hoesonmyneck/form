/**
 * МОДУЛЬ АВТОРИЗАЦИИ И АУТЕНТИФИКАЦИИ
 * JWT + bcrypt
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_this';
const JWT_EXPIRES_IN = '15m'; // Access token на 15 минут
const REFRESH_TOKEN_EXPIRES_IN = '7d'; // Refresh token на 7 дней
const SALT_ROUNDS = 10;

// =====================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С ПАРОЛЯМИ
// =====================================================

/**
 * Хэширование пароля
 */
async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Проверка пароля
 */
async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

// =====================================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С JWT
// =====================================================

/**
 * Генерация Access Token
 */
function generateAccessToken(user) {
    const payload = {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
    };
    
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Генерация Refresh Token
 */
function generateRefreshToken(user) {
    const payload = {
        userId: user.id,
        type: 'refresh',
    };
    
    return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

/**
 * Верификация токена
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// =====================================================
// РЕГИСТРАЦИЯ И ВХОД
// =====================================================

/**
 * Регистрация нового пользователя
 */
async function register({ username, email, password, fullName, organization }) {
    // Проверка существования пользователя
    const existingUser = await db.findUserByEmail(email);
    if (existingUser) {
        throw new Error('Пользователь с таким email уже существует');
    }
    
    const existingUsername = await db.findUserByUsername(username);
    if (existingUsername) {
        throw new Error('Пользователь с таким именем уже существует');
    }
    
    // Хэшируем пароль
    const passwordHash = await hashPassword(password);
    
    // Создаем пользователя
    const user = await db.createUser({
        username,
        email,
        passwordHash,
        fullName,
        organization,
        role: 'user',
    });
    
    // Генерируем токены
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    // Сохраняем refresh token в БД
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 дней
    await db.createSession({
        userId: user.id,
        refreshToken,
        expiresAt,
    });
    
    return {
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            organization: user.organization,
            role: user.role,
        },
        accessToken,
        refreshToken,
    };
}

/**
 * Вход пользователя
 */
async function login({ email, password, ipAddress, userAgent }) {
    // Находим пользователя
    const user = await db.findUserByEmail(email);
    if (!user) {
        throw new Error('Неверный email или пароль');
    }
    
    // Проверяем пароль
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
        throw new Error('Неверный email или пароль');
    }
    
    // Генерируем токены
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    
    // Сохраняем refresh token в БД
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 дней
    await db.createSession({
        userId: user.id,
        refreshToken,
        expiresAt,
        ipAddress,
        userAgent,
    });
    
    // Логируем вход
    await db.addAuditLog({
        userId: user.id,
        action: 'login',
        entityType: 'user',
        entityId: user.id,
        details: { success: true },
        ipAddress,
    });
    
    return {
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.full_name,
            organization: user.organization,
            role: user.role,
        },
        accessToken,
        refreshToken,
    };
}

/**
 * Обновление токенов (refresh)
 */
async function refreshTokens(refreshToken) {
    // Проверяем refresh token
    const decoded = verifyToken(refreshToken);
    if (!decoded || decoded.type !== 'refresh') {
        throw new Error('Недействительный refresh token');
    }
    
    // Проверяем сессию в БД
    const session = await db.findSessionByToken(refreshToken);
    if (!session) {
        throw new Error('Сессия не найдена или истекла');
    }
    
    // Получаем пользователя
    const user = await db.findUserById(session.user_id);
    if (!user) {
        throw new Error('Пользователь не найден');
    }
    
    // Генерируем новые токены
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    
    // Удаляем старую сессию и создаем новую
    await db.deleteSession(refreshToken);
    
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.createSession({
        userId: user.id,
        refreshToken: newRefreshToken,
        expiresAt,
    });
    
    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
    };
}

/**
 * Выход пользователя
 */
async function logout(refreshToken, ipAddress) {
    const session = await db.findSessionByToken(refreshToken);
    
    if (session) {
        await db.deleteSession(refreshToken);
        
        // Логируем выход
        await db.addAuditLog({
            userId: session.user_id,
            action: 'logout',
            entityType: 'user',
            entityId: session.user_id,
            details: { success: true },
            ipAddress,
        });
    }
}

// =====================================================
// MIDDLEWARE
// =====================================================

/**
 * Middleware для проверки аутентификации
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(403).json({ error: 'Недействительный или истекший токен' });
    }
    
    req.user = decoded;
    next();
}

/**
 * Middleware для проверки роли администратора
 */
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Доступ запрещен. Требуются права администратора.' });
    }
    next();
}

/**
 * Извлечение IP адреса из запроса
 */
function getIpAddress(req) {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           '';
}

/**
 * Извлечение User-Agent из запроса
 */
function getUserAgent(req) {
    return req.headers['user-agent'] || '';
}

// Экспортируем функции
module.exports = {
    // Пароли
    hashPassword,
    comparePassword,
    
    // Токены
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    
    // Аутентификация
    register,
    login,
    refreshTokens,
    logout,
    
    // Middleware
    authenticateToken,
    requireAdmin,
    
    // Утилиты
    getIpAddress,
    getUserAgent,
};
