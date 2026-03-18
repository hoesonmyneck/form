/**
 * Скрипт для создания аккаунта krik (viewer) в PostgreSQL
 * Запуск: node server/add-krik-viewer.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://forms_user:forms_secure_password_2026@localhost:5432/forms_db'
});

async function main() {
    const hash = await bcrypt.hash('qwerty12Q', 10);

    try {
        await pool.query(
            `INSERT INTO users (id, username, email, password, full_name, organization, role, form_type, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, 'viewer', 'plans', NOW())
             ON CONFLICT (username) DO UPDATE SET
                 password = EXCLUDED.password,
                 role = 'viewer',
                 form_type = 'plans',
                 full_name = EXCLUDED.full_name`,
            [
                'krik001',
                'krik',
                'krik@krik.kz',
                hash,
                'КРиКСЗН — просмотр планов',
                'Комитет регулирования и контроля в сфере социальной защиты населения'
            ]
        );
        console.log('✅ Аккаунт krik создан (или обновлён)');
        console.log('   логин: krik');
        console.log('   пароль: qwerty12Q');
        console.log('   роль: viewer (только просмотр)');
    } catch (err) {
        console.error('❌ Ошибка:', err.message);
    }

    await pool.end();
}

main().catch(console.error);
