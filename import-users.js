/**
 * Скрипт импорта региональных пользователей в PostgreSQL
 * Запуск: node import-users.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://forms_user:forms_secure_password_2026@localhost:5432/forms_db'
});

const users = [
    // Соц.защита - регионы
    { id: 'mluv9l0hchvcmshy6f',   username: 'abai_soc',         password: 'abai123',      fullName: 'Абай - Соц.защита',                    organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по области Абай"' },
    { id: 'mluv9l0hcxe2miwz5a9',  username: 'akmola_soc',       password: 'akmola123',    fullName: 'Акмолинская - Соц.защита',              organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Акмолинской области"' },
    { id: 'mluv9l0h1stfrav9ogd',   username: 'aktobe_soc',       password: 'aktobe123',    fullName: 'Актюбинская - Соц.защита',              organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Актюбинской области"' },
    { id: 'mluv9l0hr54q7ufcwal',   username: 'almaty_obl_soc',   password: 'almaty123',    fullName: 'Алматинская - Соц.защита',              organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Алматинской области"' },
    { id: 'mluv9l0hpzan1flzcte',   username: 'atyrau_soc',       password: 'atyrau123',    fullName: 'Атырауская - Соц.защита',               organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Атырауской области"' },
    { id: 'mluv9l0hr17qbjgdfqr',   username: 'zko_soc',          password: 'zko123',       fullName: 'Западно-Казахстанская - Соц.защита',    organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Западно-Казахстанской области"' },
    { id: 'mluv9l0hwmwji4ezjjo',   username: 'zhambyl_soc',      password: 'zhambyl123',   fullName: 'Жамбылская - Соц.защита',               organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Жамбылской области"' },
    { id: 'mluv9l0h35h6pzfzr5l',   username: 'zhetisu_soc',      password: 'zhetisu123',   fullName: 'Жетісу - Соц.защита',                   organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по области Жетісу"' },
    { id: 'mluv9l0hatju5nvup2r',   username: 'karaganda_soc',    password: 'karaganda123', fullName: 'Карагандинская - Соц.защита',            organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Карагандинской области"' },
    { id: 'mluv9l0hbg0v9yney74',   username: 'kostanai_soc',     password: 'kostanai123',  fullName: 'Костанайская - Соц.защита',              organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Костанайской области"' },
    { id: 'mluv9l0hjkjpdhix9w9',   username: 'kyzylorda_soc',    password: 'kyzylorda123', fullName: 'Кызылординская - Соц.защита',            organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Кызылординской области"' },
    { id: 'mluv9l0hky2dwghcp8',    username: 'mangistau_soc',    password: 'mangistau123', fullName: 'Мангистауская - Соц.защита',             organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Мангистауской области"' },
    { id: 'mluv9l0htt2larwrrh',    username: 'pavlodar_soc',     password: 'pavlodar123',  fullName: 'Павлодарская - Соц.защита',              organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Павлодарской области"' },
    { id: 'mluv9l0h5r9s9g9jmuh',   username: 'sko_soc',          password: 'sko123',       fullName: 'Северо-Казахстанская - Соц.защита',      organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Северо-Казахстанской области"' },
    { id: 'mluv9l0hcs9hi8qoaro',   username: 'turkestan_soc',    password: 'turkestan123', fullName: 'Туркестанская - Соц.защита',             organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Туркестанской области"' },
    { id: 'mluv9l0huvyzqeuof6m',   username: 'ulytau_soc',       password: 'ulytau123',    fullName: 'Ұлытау - Соц.защита',                   organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по области Ұлытау"' },
    { id: 'mluv9l0hlyitr3ogkql',   username: 'vko_soc',          password: 'vko123',       fullName: 'Восточно-Казахстанская - Соц.защита',   organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по Восточно-Казахстанской области"' },
    { id: 'mluv9l0h2n8rab8wtdn',   username: 'almaty_city_soc',  password: 'almaty_c123',  fullName: 'г.Алматы - Соц.защита',                 organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по городу Алматы"' },
    { id: 'mluv9l0hu3b1rs0mq7p',   username: 'astana_soc',       password: 'astana123',    fullName: 'г.Астана - Соц.защита',                 organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по городу Астане"' },
    { id: 'mluv9l0hqug9duzq19',    username: 'shymkent_soc',     password: 'shymkent123',  fullName: 'г.Шымкент - Соц.защита',                organization: 'РГУ "Департамент Комитета регулирования и контроля в сфере социальной защиты населения МТиСЗН РК по городу Шымкент"' },

    // Инспекция труда - регионы
    { id: 'mluv9l0hiztw5pmsy8o',   username: 'abai_trud',        password: 'abai123',      fullName: 'Абай - Инспекция труда',                organization: 'РГУ "Департамент Комитета государственной инспекции труда МТиСЗН РК по области Абай"' },
    { id: 'mluv9l0hnhm2s4brs4j',   username: 'akmola_trud',      password: 'akmola123',    fullName: 'Акмолинская - Инспекция труда',          organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Акмолинской области»' },
    { id: 'mluv9l0h8ofwj0ixt4a',   username: 'aktobe_trud',      password: 'aktobe123',    fullName: 'Актюбинская - Инспекция труда',          organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Актюбинской области»' },
    { id: 'mluv9l0h0dcatjp7og4o',  username: 'almaty_obl_trud',  password: 'almaty123',    fullName: 'Алматинская - Инспекция труда',          organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Алматинской области»' },
    { id: 'mluv9l0h17vuzp128os',   username: 'atyrau_trud',      password: 'atyrau123',    fullName: 'Атырауская - Инспекция труда',           organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Атырауской области»' },
    { id: 'mluv9l0h2hnroi1zs6n',   username: 'zko_trud',         password: 'zko123',       fullName: 'Западно-Казахстанская - Инспекция труда', organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Западно-Казахстанской области»' },
    { id: 'mluv9l0hp2ngrkacqaq',   username: 'zhambyl_trud',     password: 'zhambyl123',   fullName: 'Жамбылская - Инспекция труда',           organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Жамбылской области»' },
    { id: 'mluv9l0hh8gpx4tss1f',   username: 'zhetisu_trud',     password: 'zhetisu123',   fullName: 'Жетісу - Инспекция труда',               organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по области Жетісу»' },
    { id: 'mluv9l0hx6ta4d97yo',    username: 'karaganda_trud',   password: 'karaganda123', fullName: 'Карагандинская - Инспекция труда',        organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Карагандинской области»' },
    { id: 'mluv9l0hqa56fuacsb',    username: 'kostanai_trud',    password: 'kostanai123',  fullName: 'Костанайская - Инспекция труда',          organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Костанайской области»' },
    { id: 'mluv9l0hcb9xcldexnv',   username: 'kyzylorda_trud',   password: 'kyzylorda123', fullName: 'Кызылординская - Инспекция труда',        organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Кызылординской области»' },
    { id: 'mluv9l0hg7c302jvfpp',   username: 'mangistau_trud',   password: 'mangistau123', fullName: 'Мангистауская - Инспекция труда',         organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Мангистауской области»' },
    { id: 'mluv9l0h4pkra26mc2h',   username: 'pavlodar_trud',    password: 'pavlodar123',  fullName: 'Павлодарская - Инспекция труда',          organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Павлодарской области»' },
    { id: 'mluv9l0hlwruxi2rsm8',   username: 'sko_trud',         password: 'sko123',       fullName: 'Северо-Казахстанская - Инспекция труда',  organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Северо-Казахстанской области»' },
    { id: 'mluv9l0hd6ljbb8stu6',   username: 'turkestan_trud',   password: 'turkestan123', fullName: 'Туркестанская - Инспекция труда',         organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Туркестанской области»' },
    { id: 'mluv9l0hiy61e7dz29b',   username: 'ulytau_trud',      password: 'ulytau123',    fullName: 'Ұлытау - Инспекция труда',                organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по области Ұлытау»' },
    { id: 'mluv9l0hmlgnyi7j8bf',   username: 'vko_trud',         password: 'vko123',       fullName: 'Восточно-Казахстанская - Инспекция труда', organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по Восточно-Казахстанской области»' },
    { id: 'mluv9l0heetyn4b7bec',   username: 'almaty_city_trud', password: 'almaty_c123',  fullName: 'г.Алматы - Инспекция труда',              organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по городу Алматы»' },
    { id: 'mluv9l0hh7dsim9y7x5',   username: 'astana_trud',      password: 'astana123',    fullName: 'г.Астана - Инспекция труда',              organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по городу Астане»' },
    { id: 'mluv9l0hw79jbp08w6',    username: 'shymkent_trud',    password: 'shymkent123',  fullName: 'г.Шымкент - Инспекция труда',             organization: 'РГУ «Департамент Комитета государственной инспекции труда МТиСЗН РК по городу Шымкент»' },
];

const standardExtraUsers = [
    {
        id: 'komitet001',
        username: 'komitet',
        password: 'komitet',
        fullName: 'Комитет',
        organization: 'Комитет регулирования и контроля в сфере социальной защиты населения',
        role: 'user',
        formType: 'standard',
    },
];

const plansUsers = [
    {
        id: 'krik001',
        username: 'krik',
        password: 'krik',
        fullName: 'КРИК',
        organization: 'Комитет регулирования и контроля в сфере социальной защиты населения',
        role: 'user',
        formType: 'plans',
    },
];

async function importUsers() {
    console.log(`Начинаем импорт ${users.length} региональных + ${standardExtraUsers.length + plansUsers.length} доп. пользователей...`);
    let success = 0;
    let skipped = 0;

    // Импорт региональных пользователей (4 формы)
    for (const user of users) {
        try {
            const hash = await bcrypt.hash(user.password, 10);
            await pool.query(
                `INSERT INTO users (id, username, email, password, full_name, organization, role, form_type, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'user', 'standard', NOW())
                 ON CONFLICT (username) DO NOTHING`,
                [user.id, user.username, user.username, hash, user.fullName, user.organization]
            );
            console.log(`✅ ${user.username}`);
            success++;
        } catch (err) {
            console.log(`⚠️  ${user.username} — пропущен (${err.message})`);
            skipped++;
        }
    }

    // Импорт дополнительных пользователей для 4 форм (standard)
    for (const user of standardExtraUsers) {
        try {
            const hash = await bcrypt.hash(user.password, 10);
            await pool.query(
                `INSERT INTO users (id, username, email, password, full_name, organization, role, form_type, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                 ON CONFLICT (username) DO UPDATE SET form_type = $8, password = $4`,
                [user.id, user.username, user.username, hash, user.fullName, user.organization, user.role, user.formType]
            );
            console.log(`✅ ${user.username} (standard)`);
            success++;
        } catch (err) {
            console.log(`⚠️  ${user.username} — пропущен (${err.message})`);
            skipped++;
        }
    }

    // Импорт пользователей для 8 форм (plans)
    for (const user of plansUsers) {
        try {
            const hash = await bcrypt.hash(user.password, 10);
            await pool.query(
                `INSERT INTO users (id, username, email, password, full_name, organization, role, form_type, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                 ON CONFLICT (username) DO NOTHING`,
                [user.id, user.username, user.username, hash, user.fullName, user.organization, user.role, user.formType]
            );
            console.log(`✅ ${user.username} (plans)`);
            success++;
        } catch (err) {
            console.log(`⚠️  ${user.username} — пропущен (${err.message})`);
            skipped++;
        }
    }

    console.log(`\nГотово! Добавлено: ${success}, пропущено: ${skipped}`);
    await pool.end();
}

importUsers().catch(err => {
    console.error('Ошибка:', err.message);
    process.exit(1);
});
