/**
 * Генерация Word-отчёта по нескольким снимкам истории планов.
 * Каждый снимок (дата) выводится секцией: заголовок с датой и таблицами по всем планам,
 * между снимками — разрыв страницы.
 */

const {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    HeadingLevel,
    AlignmentType,
    PageBreak,
    BorderStyle,
    WidthType,
    HeightRule
} = require('docx');

const PLAN_TITLES = {
    1: 'Реализация Дорожной карты партии «Amanat» (п.26) по обеспечению доступности для лиц с инвалидностью',
    2: 'Мониторинг доли реализованной социальной части индивидуальных программ абилитации и реабилитации лиц с инвалидностью',
    3: 'Своевременная организация проверочных мероприятий в рамках профилактического контроля',
    4: 'Реализация Дорожной карты партии «Amanat» по обеспечению достижения установленного целевого показателя на 2026 год по заочному проактивному оказанию государственной услуги установления инвалидности в размере 45%',
    5: 'Рассмотрение не менее 53,5% дел первичного освидетельствования ОМК МСЭ при оказании государственной услуги «Установление инвалидности и/или степени утраты трудоспособности, и/или определению мер социальной защиты',
    7: 'Проведение проверки пенсионных выплат по возрасту с признаками предоставления заявителем недостоверных сведений (отчетная группа №360 в АИС «Е-макет»)',
    8: 'Обеспечение наполнения интернет-ресурса территориального департамента (по доступности, по пенсионному обеспечению, ТСР)',
    9: 'Мониторинг заполнения вакантных должностей в отделах медико-социальной экспертизы',
    10: 'Согласование деклараций строительных объектов требованиям доступности для МГН (входной группы, зоны оказания услуг, к санитарно-бытовым помещениям, к средствам информации и телекоммуникаций, к территории объекта, пути движения)'
};

// Внутренний номер плана → отображаемый (план 6 скрыт: 7 → 6, 8 → 7, 9 → 8, 10 → 9)
const PLAN_DISPLAY_NUMBER = { 7: 6, 8: 7, 9: 8, 10: 9 };

// Сколько колонок данных у плана (после столбцов № и регион)
function getPlanColumns(planNumber, declMonths) {
    if (planNumber === 7) {
        // [num, region, kol_del, planned_qty, planned_pct, actual_pct, coeff]
        return ['Кол-во дел', 'План (кол-во)', 'План (%)', 'Факт (%)', 'Коэф.'];
    }
    if (planNumber === 8) {
        // [num, region, planned, actual, coeff, ocenka]
        return ['Плановый показатель', 'Фактический показатель', 'Коэффициент исполнения', 'Оценка'];
    }
    if (planNumber === 10) {
        // [num, region, prevKey, p0..p3, curKey, c0..c3] — по 4 столбца на месяц
        const base = ['поступило деклараций', 'согласовано', 'отказано', 'на рассмотрении'];
        const [prev, cur] = (declMonths || []).map(declMonthName);
        return [...base.map(b => `${prev}: ${b}`), ...base.map(b => `${cur}: ${b}`)];
    }
    return ['Плановый показатель', 'Фактический показатель', 'Коэффициент исполнения'];
}

// =====================================================================
// План 10 (отображ. № 9): декларации за 2 месяца (прошлый и текущий).
// Строки хранят свои месяцы: [num, region, prevKey, p0..p3, curKey, c0..c3];
// старый формат [num, region, r, a, rej, pend] — сентябрь 2026.
// Для снимка месяцы берутся относительно даты снимка.
// =====================================================================
const DECL_LEGACY_MONTH = '2026-09';

function declMonthName(key) {
    return RU_MONTHS_NOM[Number(String(key || '').split('-')[1]) - 1] || '';
}

function getDeclMonthKeys(isoDate) {
    const [y, m] = isoDate.split('-').map(Number); // m: 1..12
    const key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return [key(new Date(y, m - 2, 1)), key(new Date(y, m - 1, 1))];
}

function normalizeDeclRow(row, prevKey, curKey) {
    const byMonth = {};
    if (row.length <= 6) {
        byMonth[DECL_LEGACY_MONTH] = row.slice(2, 6);
    } else {
        byMonth[row[2]] = row.slice(3, 7);
        byMonth[row[7]] = row.slice(8, 12);
    }
    const vals = k => (byMonth[k] || []).concat(['', '', '', '']).slice(0, 4);
    return [row[0], row[1], prevKey, ...vals(prevKey), curKey, ...vals(curKey)];
}

// Раскладывает строки по месяцам и пересчитывает «Всего» (регионы сохраняют только свою строку)
function normalizeDeclRows(rows, isoDate) {
    const [prevKey, curKey] = getDeclMonthKeys(isoDate);
    const isTotal = r => r[0] === '-' || String(r[1] || '').trim() === 'Всего';
    const dataRows = rows.filter(r => Array.isArray(r) && !isTotal(r))
        .map(r => normalizeDeclRow(r, prevKey, curKey));
    const sumAt = i => dataRows.reduce((acc, r) => acc + (parseFloat(r[i]) || 0), 0) || '';
    const total = ['-', 'Всего', prevKey, ...[3, 4, 5, 6].map(sumAt), curKey, ...[8, 9, 10, 11].map(sumAt)];
    return { rows: [...dataRows, total], months: [prevKey, curKey] };
}

const RU_MONTHS = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

const RU_MONTHS_NOM = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

function formatDateLong(isoDate) {
    // isoDate: "2026-04-15"
    const [y, m, d] = isoDate.split('-').map(Number);
    return `${d} ${RU_MONTHS[m - 1]} ${y} года`;
}

function formatMonthLabel(year, monthIdx0) {
    return `${RU_MONTHS_NOM[monthIdx0]} ${year}`;
}

function makeBorders() {
    const single = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
    return {
        top: single, bottom: single, left: single, right: single,
        insideHorizontal: single, insideVertical: single
    };
}

function paragraph(text, opts = {}) {
    return new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        spacing: { before: 0, after: 80 },
        children: [
            new TextRun({
                text: String(text == null ? '' : text),
                bold: !!opts.bold,
                size: opts.size || 22, // half-points → 11pt
                color: opts.color || '000000'
            })
        ]
    });
}

function cell(text, opts = {}) {
    return new TableCell({
        width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
        shading: opts.fill ? { type: 'clear', color: 'auto', fill: opts.fill } : undefined,
        children: [paragraph(text, { bold: opts.bold, align: opts.align, size: opts.size })]
    });
}

function buildPlanTable(planNumber, planRows, declMonths) {
    const dataCols = getPlanColumns(planNumber, declMonths);
    const headerCells = [
        cell('№', { bold: true, fill: 'F3F4F6', align: AlignmentType.CENTER }),
        cell('Регион', { bold: true, fill: 'F3F4F6', align: AlignmentType.CENTER }),
        ...dataCols.map(t => cell(t, { bold: true, fill: 'F3F4F6', align: AlignmentType.CENTER }))
    ];

    const headerRow = new TableRow({ tableHeader: true, children: headerCells });

    const bodyRows = (planRows || []).map((row, idx) => {
        const isTotal = String(row[1] || '').toLowerCase() === 'всего';
        const cells = [];

        // 0: №
        cells.push(cell(isTotal ? '' : String(row[0] || idx + 1), {
            bold: isTotal, align: AlignmentType.CENTER, fill: isTotal ? 'FEF3C7' : undefined
        }));
        // 1: Регион
        cells.push(cell(row[1] || '', {
            bold: isTotal, align: AlignmentType.LEFT, fill: isTotal ? 'FEF3C7' : undefined
        }));

        // Дата для разных планов:
        // plan7: row = [num, region, kol_del, planned_qty, planned_pct, actual_pct, coeff]
        // прочие: row = [num, region, planned, actual, coeff]
        if (planNumber === 7) {
            const values = [row[2], row[3], row[4], row[5], row[6]];
            values.forEach(v => {
                cells.push(cell(v == null ? '' : String(v), {
                    bold: isTotal, align: AlignmentType.CENTER,
                    fill: isTotal ? 'FEF3C7' : undefined
                }));
            });
        } else if (planNumber === 10) {
            const values = [...row.slice(3, 7), ...row.slice(8, 12)];
            values.forEach(v => {
                cells.push(cell(v == null ? '' : String(v), {
                    bold: isTotal, align: AlignmentType.CENTER,
                    fill: isTotal ? 'FEF3C7' : undefined
                }));
            });
        } else if (planNumber === 8) {
            // [planned, actual, coeff, ocenka] — «Оценка» пустая для строки «Всего»
            const values = [row[2], row[3], row[4], isTotal ? '' : row[5]];
            values.forEach(v => {
                cells.push(cell(v == null ? '' : String(v), {
                    bold: isTotal, align: AlignmentType.CENTER,
                    fill: isTotal ? 'FEF3C7' : undefined
                }));
            });
        } else {
            const values = [row[2], row[3], row[4]];
            values.forEach(v => {
                cells.push(cell(v == null ? '' : String(v), {
                    bold: isTotal, align: AlignmentType.CENTER,
                    fill: isTotal ? 'FEF3C7' : undefined
                }));
            });
        }

        return new TableRow({ children: cells });
    });

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: makeBorders(),
        rows: [headerRow, ...bodyRows]
    });
}

/**
 * Собирает блоки документа (заголовок + таблицы) для одного снимка.
 * Возвращает массив элементов Paragraph/Table.
 */
function buildSnapshotBlocks(snapshot, { addPageBreakBefore = false } = {}) {
    const blocks = [];

    if (addPageBreakBefore) {
        blocks.push(new Paragraph({ children: [new PageBreak()] }));
    }

    blocks.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
            new TextRun({
                text: `Снимок планов работы за ${formatDateLong(snapshot.date)}`,
                bold: true,
                size: 32
            })
        ]
    }));

    const plans = snapshot.plans || {};
    // План 6 скрыт, выводим внутренние 1..5,7..10 (отображаем 1..9)
    const ALL_PLAN_ORDER = [1, 2, 3, 4, 5, 7, 8, 9, 10];
    let planOrder = ALL_PLAN_ORDER;
    if (snapshot.__filterPlan) {
        const f = parseInt(snapshot.__filterPlan, 10);
        if (ALL_PLAN_ORDER.includes(f)) planOrder = [f];
    }

    planOrder.forEach((planNumber, idx) => {
        const planId = `plan${planNumber}`;
        const planRows = plans[planId];
        if (!planRows || !planRows.length) return;

        const displayNum = PLAN_DISPLAY_NUMBER[planNumber] || planNumber;

        if (idx > 0) {
            blocks.push(new Paragraph({ spacing: { before: 200, after: 0 }, children: [] }));
        }

        blocks.push(new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 80 },
            children: [
                new TextRun({ text: `План № ${displayNum}`, bold: true, size: 28 })
            ]
        }));

        if (PLAN_TITLES[planNumber]) {
            blocks.push(paragraph(PLAN_TITLES[planNumber], { size: 22 }));
        }

        if (planNumber === 10) {
            const decl = normalizeDeclRows(planRows, snapshot.date);
            blocks.push(buildPlanTable(planNumber, decl.rows, decl.months));
        } else {
            blocks.push(buildPlanTable(planNumber, planRows));
        }
    });

    return blocks;
}

/**
 * Создаёт Word-документ со всеми переданными снимками.
 * snapshots: [{ date: 'YYYY-MM-DD', plans, notes }]
 * meta: { title, periodLabel }
 */
async function buildHistoryPeriodDocx(snapshots, meta = {}) {
    const filterPlan = meta.planNumber && meta.planNumber !== 'all'
        ? parseInt(meta.planNumber, 10)
        : null;

    // Прокидываем фильтр в каждый снимок (используется в buildSnapshotBlocks)
    const sorted = [...snapshots]
        .map(s => filterPlan ? { ...s, __filterPlan: filterPlan } : s)
        .sort((a, b) => a.date.localeCompare(b.date));

    const children = [];

    // Титульный блок
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
            new TextRun({
                text: meta.title || 'Сводный отчёт по истории планов',
                bold: true, size: 36
            })
        ]
    }));

    if (meta.periodLabel) {
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: meta.periodLabel, size: 26, color: '374151' })]
        }));
    }

    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
            new TextRun({
                text: `Снимков в отчёте: ${sorted.length}`,
                size: 22, color: '6B7280'
            })
        ]
    }));

    sorted.forEach((snap, idx) => {
        const blocks = buildSnapshotBlocks(snap, { addPageBreakBefore: true });
        children.push(...blocks);
    });

    if (!sorted.length) {
        children.push(paragraph('За выбранный период снимков нет.', { size: 24 }));
    }

    const doc = new Document({
        creator: 'MTSZN Forms',
        title: meta.title || 'История планов',
        sections: [{ properties: {}, children }]
    });

    const buf = await Packer.toBuffer(doc);
    return buf;
}

module.exports = {
    buildHistoryPeriodDocx,
    formatMonthLabel
};
