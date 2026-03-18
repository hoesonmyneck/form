/**
 * Скрипт для добавления 20 региональных аккаунтов в PostgreSQL
 * Запуск: node server/add-region-users.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://forms_user:forms_secure_password_2026@localhost:5432/forms_db'
});

const REGION_ACCOUNTS = [
    { id: 'reg001', username: 'astana',     fullName: 'ДКРиКСЗН по г. Астана',                         org: 'Территориальный департамент КРиКСЗН по г. Астана' },
    { id: 'reg002', username: 'almaty',     fullName: 'ДКРиКСЗН по г. Алматы',                         org: 'Территориальный департамент КРиКСЗН по г. Алматы' },
    { id: 'reg003', username: 'shymkent',   fullName: 'ДКРиКСЗН по г. Шымкент',                        org: 'Территориальный департамент КРиКСЗН по г. Шымкент' },
    { id: 'reg004', username: 'akmola',     fullName: 'ДКРиКСЗН по Акмолинской области',               org: 'Территориальный департамент КРиКСЗН по Акмолинской области' },
    { id: 'reg005', username: 'aktobe',     fullName: 'ДКРиКСЗН по Актюбинской области',               org: 'Территориальный департамент КРиКСЗН по Актюбинской области' },
    { id: 'reg006', username: 'almatyreg',  fullName: 'ДКРиКСЗН по Алматинской области',               org: 'Территориальный департамент КРиКСЗН по Алматинской области' },
    { id: 'reg007', username: 'atyrau',     fullName: 'ДКРиКСЗН по Атырауской области',                org: 'Территориальный департамент КРиКСЗН по Атырауской области' },
    { id: 'reg008', username: 'vko',        fullName: 'ДКРиКСЗН по Восточно-Казахстанской области',    org: 'Территориальный департамент КРиКСЗН по ВКО' },
    { id: 'reg009', username: 'zhambyl',    fullName: 'ДКРиКСЗН по Жамбылской области',                org: 'Территориальный департамент КРиКСЗН по Жамбылской области' },
    { id: 'reg010', username: 'zko',        fullName: 'ДКРиКСЗН по Западно-Казахстанской области',     org: 'Территориальный департамент КРиКСЗН по ЗКО' },
    { id: 'reg011', username: 'karaganda',  fullName: 'ДКРиКСЗН по Карагандинской области',            org: 'Территориальный департамент КРиКСЗН по Карагандинской области' },
    { id: 'reg012', username: 'kostanay',   fullName: 'ДКРиКСЗН по Костанайской области',              org: 'Территориальный департамент КРиКСЗН по Костанайской области' },
    { id: 'reg013', username: 'kyzylorda',  fullName: 'ДКРиКСЗН по Кызылординской области',            org: 'Территориальный департамент КРиКСЗН по Кызылординской области' },
    { id: 'reg014', username: 'mangistau',  fullName: 'ДКРиКСЗН по Мангистауской области',             org: 'Территориальный департамент КРиКСЗН по Мангистауской области' },
    { id: 'reg015', username: 'pavlodar',   fullName: 'ДКРиКСЗН по Павлодарской области',              org: 'Территориальный департамент КРиКСЗН по Павлодарской области' },
    { id: 'reg016', username: 'sko',        fullName: 'ДКРиКСЗН по Северо-Казахстанской области',      org: 'Территориальный департамент КРиКСЗН по СКО' },
    { id: 'reg017', username: 'turkestan',  fullName: 'ДКРиКСЗН по Туркестанской области',             org: 'Территориальный департамент КРиКСЗН по Туркестанской области' },
    { id: 'reg018', username: 'abay',       fullName: 'ДКРиКСЗН по области Абай',                      org: 'Территориальный департамент КРиКСЗН по области Абай' },
    { id: 'reg019', username: 'ulytau',     fullName: 'ДКРиКСЗН по области Улытау',                    org: 'Территориальный департамент КРиКСЗН по области Улытау' },
    { id: 'reg020', username: 'zhetisu',    fullName: 'ДКРиКСЗН по области Жетысу',                    org: 'Территориальный департамент КРиКСЗН по области Жетысу' },
];

async function main() {
    console.log('🚀 Добавление региональных аккаунтов...\n');

    for (const acc of REGION_ACCOUNTS) {
        const hash = await bcrypt.hash(acc.username, 10);
        try {
            await pool.query(
                `INSERT INTO users (id, username, email, password, full_name, organization, role, form_type, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'user', 'plans', NOW())
                 ON CONFLICT (username) DO UPDATE SET
                     password = EXCLUDED.password,
                     full_name = EXCLUDED.full_name,
                     organization = EXCLUDED.organization,
                     form_type = 'plans'`,
                [acc.id, acc.username, acc.username + '@krik.kz', hash, acc.fullName, acc.org]
            );
            console.log(`✅ ${acc.username} (пароль: ${acc.username})`);
        } catch (err) {
            console.error(`❌ Ошибка для ${acc.username}:`, err.message);
        }
    }

    console.log('\n✅ Готово! Все региональные аккаунты добавлены.');
    console.log('\nСписок учёток:');
    REGION_ACCOUNTS.forEach(a => console.log(`  логин: ${a.username.padEnd(12)}  пароль: ${a.username}`));

    await pool.end();
}

main().catch(console.error);
