-- Инициализация базы данных
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    organization VARCHAR(500),
    role VARCHAR(50) DEFAULT 'user',
    form_type VARCHAR(50) DEFAULT 'standard',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    form_number INTEGER,
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

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_form_number ON documents(form_number);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

INSERT INTO users (id, username, email, password, full_name, organization, role, form_type, created_at)
VALUES 
    ('admin001', 'admin', 'admin', '$2a$10$oh5LMBXUmmvZfrolMIpD3OXoX.ADdQ5oWZl4GeOimtG6Bop4Xk.Sa', 'Администратор', 'Комитет регулирования и контроля в сфере социальной защиты населения', 'admin', 'standard', NOW()),
    ('admin002', 'admin2', 'admin2', '$2a$10$gULLjp6jGULyPqREQ9Y.gen7OEJdTheFZ1An2kN4NfWfxONVsBLCm', 'План работы территориальных департаментов', 'Комитет регулирования и контроля в сфере социальной защиты населения', 'admin', 'plans', NOW())
ON CONFLICT (username) DO NOTHING;
