-- =====================================================
-- ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ДЛЯ ФОРМ МТСЗН РК
-- =====================================================

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    organization VARCHAR(500),
    role VARCHAR(50) DEFAULT 'user',
    form_type VARCHAR(50) DEFAULT 'standard',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица документов
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    form_number VARCHAR(10),
    form_data JSONB,
    plans JSONB,
    notes JSONB,
    attached_files JSONB,
    organization VARCHAR(500),
    submitted_at TIMESTAMP,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    username VARCHAR(100),
    user_full_name VARCHAR(255),
    user_email VARCHAR(255),
    user_organization VARCHAR(500)
);

-- Индексы для ускорения поиска
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_form_number ON documents(form_number);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- =====================================================
-- ПОЛЬЗОВАТЕЛИ ПО УМОЛЧАНИЮ
-- Пароли хешированы через bcrypt (admin/admin, admin2/admin2)
-- =====================================================

INSERT INTO users (id, username, email, password, full_name, organization, role, form_type, created_at)
VALUES 
    -- Администратор (логин: admin, пароль: admin)
    ('admin001', 'admin', 'admin@mtszn.kz', '$2a$10$oh5LMBXUmmvZfrolMIpD3OXoX.ADdQ5oWZl4GeOimtG6Bop4Xk.Sa', 
     'Администратор системы', 
     'Республиканское государственное учреждение "Комитет регулирования и контроля в сфере социальной защиты населения Министерства труда и социальной защиты населения Республики Казахстан"', 
     'admin', 'standard', NOW()),
    
    -- Администратор 2 для планов (логин: admin2, пароль: admin2)
    ('admin002', 'admin2', 'admin2@mtszn.kz', '$2a$10$gULLjp6jGULyPqREQ9Y.gen7OEJdTheFZ1An2kN4NfWfxONVsBLCm', 
     'План работы территориальных департаментов', 
     'Комитет регулирования и контроля в сфере социальной защиты населения', 
     'admin', 'plans', NOW())
ON CONFLICT (username) DO NOTHING;

-- =====================================================
-- ЕСЛИ НУЖНО ДОБАВИТЬ РЕГИОНАЛЬНЫЕ АККАУНТЫ,
-- ИСПОЛЬЗУЙТЕ ЭТОТ ШАБЛОН (РАСКОММЕНТИРУЙТЕ):
-- =====================================================

/*
-- Пароли для всех региональных аккаунтов: region123
-- Хеш: $2a$10$HASH_FOR_region123

INSERT INTO users (id, username, email, password, full_name, organization, role, form_type, created_at)
VALUES 
    -- Астана
    ('astana_trud', 'astana_trud', 'astana_trud@mtszn.kz', '$2a$10$HASH', 
     'Инспекция труда г. Астана', 
     'Департамент инспекции труда по г. Астана', 
     'user', 'standard', NOW()),
    
    ('astana_soc', 'astana_soc', 'astana_soc@mtszn.kz', '$2a$10$HASH', 
     'Соцзащита г. Астана', 
     'Департамент социальной защиты населения по г. Астана', 
     'user', 'standard', NOW())
    
    -- Добавьте остальные регионы по аналогии
ON CONFLICT (username) DO NOTHING;
*/

-- Готово!
SELECT 'База данных инициализирована успешно!' as status;
