// Импорт снимка планов за конкретную дату из 7 docx-файлов.
// Запуск:  node dump-docx.js
//   - выведет распарсенные таблицы для проверки
//   - запишет JSON в snapshot-2026-04-30.json
//   - сгенерирует SQL для plan_history (вставка/обновление)
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const SNAPSHOT_DATE = '2026-04-30';

const FILES = [
    { label: 'plan1', file: 'План № 1-10.docx', columns: 5 },
    { label: 'plan2', file: 'План № 2-10.docx', columns: 5 },
    { label: 'plan3', file: 'План № 3-11.docx', columns: 5 },
    { label: 'plan4', file: 'Снимок планов — 01.05.2026 (план 4).docx', columns: 5 },
    { label: 'plan5', file: 'План № 5 (7).docx', columns: 5 },
    { label: 'plan7', file: 'Снимок планов — 01.05.2026 (план 6) (1).docx', columns: 7 }, // отображаемый план 6
    { label: 'plan8', file: 'Снимок планов — 01.05.2026 (план 7).docx', columns: 5 }       // отображаемый план 7
];

// Список регионов на сайте — порядок совпадает с тем, в котором мы храним строки в БД
const REGIONS = [
    'г. Астана',
    'г. Алматы',
    'г. Шымкент',
    'Акмолинская область',
    'Актюбинская область',
    'Алматинская область',
    'Атырауская область',
    'Восточно-Казахстанская область',
    'Жамбылская область',
    'Западно-Казахстанская область',
    'Карагандинская область',
    'Костанайская область',
    'Кызылординская область',
    'Мангистауская область',
    'Павлодарская область',
    'Северо-Казахстанская область',
    'Туркестанская область',
    'Область Абай',
    'Область Улытау',
    'Область Жетысу'
];

function normalizeRegion(name) {
    return String(name || '')
        .replace(/\s+/g, ' ')
        .replace(/\u00A0/g, ' ')
        .trim()
        .toLowerCase();
}
const REGION_INDEX = new Map(REGIONS.map((r, i) => [normalizeRegion(r), i]));

function decodeXml(s) {
    return String(s)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

// Извлекает чистый текст ячейки: объединяет все <w:t>...</w:t> внутри ячейки,
// предварительно вырезая <w:tcPr>...</w:tcPr> (свойства ячейки).
function extractCellText(tcXml) {
    // Удаляем свойства ячейки целиком
    const cleaned = tcXml.replace(/<w:tcPr[\s\S]*?<\/w:tcPr>/g, '');
    // Важно: <w:t> и <w:t xml:space="preserve">  — но НЕ <w:tc>, <w:tr>, <w:tcW> и т.п.
    // Поэтому требуем сразу `>` или пробел после `t`.
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let text = '';
    let m;
    while ((m = re.exec(cleaned)) !== null) {
        text += m[1];
    }
    return decodeXml(text).replace(/\s+/g, ' ').trim();
}

function parseTablesFromDocx(filePath) {
    const buf = fs.readFileSync(filePath);
    const zip = new PizZip(buf);
    const xml = zip.file('word/document.xml').asText();

    const tables = [];
    const tblMatches = xml.match(/<w:tbl[\s\S]*?<\/w:tbl>/g) || [];
    for (const tblXml of tblMatches) {
        const rows = [];
        const trMatches = tblXml.match(/<w:tr[\s\S]*?<\/w:tr>/g) || [];
        for (const trXml of trMatches) {
            const cells = [];
            const tcMatches = trXml.match(/<w:tc[\s\S]*?<\/w:tc>/g) || [];
            for (const tcXml of tcMatches) {
                cells.push(extractCellText(tcXml));
            }
            rows.push(cells);
        }
        tables.push(rows);
    }
    return tables;
}

// Из всех таблиц документа выбираем «нужную» — у которой больше всего строк (как правило это таблица с регионами)
function pickMainTable(tables) {
    let best = null;
    for (const t of tables) {
        if (!best || t.length > best.length) best = t;
    }
    return best || [];
}

// Понять формат строки. Возвращаем индексы колонок, в которых лежит [region, ...values].
// Для plan1..plan5,plan8 (5 колонок: №, регион, план, факт, коэф) → values = [c2, c3, c4]
// Для plan7 (7 колонок: №, регион, кол-во дел, план кол-во, план %, факт %, коэф) → values = [c2..c6]
function shapeRow(cells, expectedCols) {
    if (!cells || cells.length < expectedCols) return null;
    const firstCell = cells[0];
    const secondCell = cells[1];
    // Иногда первая колонка пустая (для строки «Всего»). Проверяем по второй колонке.
    return { region: secondCell, values: cells.slice(2, expectedCols) };
}

function buildPlanRows(label, table, expectedCols) {
    // Создаём пустой каркас
    const out = REGIONS.map((r, i) => {
        if (expectedCols === 5) return [String(i + 1), r, '', '', ''];
        return [String(i + 1), r, '', '', '', '', '']; // plan7
    });
    const totalRow = expectedCols === 5
        ? ['-', 'Всего', '', '', '']
        : ['-', 'Всего', '', '', '', '', ''];

    let unmatched = [];

    // Определяем где заголовок: пропускаем строки, у которых второй столбец содержит «территор» / «регион»
    for (const cells of table) {
        const shaped = shapeRow(cells, expectedCols);
        if (!shaped) continue;
        const regNorm = normalizeRegion(shaped.region);
        if (!regNorm) continue;
        if (regNorm.startsWith('территор') ||
            regNorm.startsWith('регион') ||
            regNorm.includes('наименован')) continue;

        if (regNorm === 'всего' || regNorm === 'итого') {
            for (let i = 0; i < shaped.values.length; i++) {
                totalRow[2 + i] = shaped.values[i];
            }
            continue;
        }

        const idx = REGION_INDEX.get(regNorm);
        if (idx === undefined) {
            unmatched.push(shaped.region);
            continue;
        }

        const target = out[idx];
        for (let i = 0; i < shaped.values.length; i++) {
            target[2 + i] = shaped.values[i];
        }
    }

    out.push(totalRow);

    return { rows: out, unmatched };
}

const ROOT = __dirname;
const plans = {};
let allOk = true;

for (const { label, file, columns } of FILES) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) {
        console.log(`✗ ${label}: файл не найден — ${file}`);
        allOk = false;
        continue;
    }
    const tables = parseTablesFromDocx(fullPath);
    const mainTable = pickMainTable(tables);
    const { rows, unmatched } = buildPlanRows(label, mainTable, columns);
    plans[label] = rows;

    console.log(`\n=== ${label}  ←  ${file}`);
    console.log(`Tables found: ${tables.length}, main table rows: ${mainTable.length}, columns expected: ${columns}`);
    if (unmatched.length) {
        console.log(`  ⚠ Не сопоставлены регионы: ${unmatched.join(', ')}`);
    }
    rows.forEach(r => console.log(`  ${r.join(' | ')}`));
}

const outJsonPath = path.join(ROOT, `snapshot-${SNAPSHOT_DATE}.json`);
fs.writeFileSync(outJsonPath, JSON.stringify(plans, null, 2), 'utf8');
console.log(`\n✓ JSON сохранён: ${outJsonPath}`);

// Готовим SQL для prod (PostgreSQL)
const sqlPath = path.join(ROOT, `snapshot-${SNAPSHOT_DATE}.sql`);
const plansLiteral = JSON.stringify(plans).replace(/'/g, "''");
const notesLiteral = '{}';
// Используем EXTRACT/uuid_generate_v4 не доступен; подставим случайный id строкой.
const fakeId = `imp_${SNAPSHOT_DATE.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 8)}`;
const sql = `-- Импорт снимка планов за ${SNAPSHOT_DATE}
INSERT INTO plan_history (id, snapshot_date, plans_data, notes_data, created_at)
VALUES ('${fakeId}', '${SNAPSHOT_DATE}', '${plansLiteral}'::jsonb, '${notesLiteral}'::jsonb, NOW())
ON CONFLICT (snapshot_date) DO UPDATE
SET plans_data = EXCLUDED.plans_data,
    notes_data = EXCLUDED.notes_data,
    created_at = NOW();
`;
fs.writeFileSync(sqlPath, sql, 'utf8');
console.log(`✓ SQL для прода: ${sqlPath}`);

if (!allOk) {
    console.log('\n⚠ Не все файлы найдены — проверь выше.');
    process.exit(1);
}
