// Индекс региона текущего пользователя (null = admin/planner, видит всё)
let userRegionIndex = null;
let userIsAdmin   = false;
let userIsPlanner = false;
let currentUserRole = null; // 'admin' | 'planner' | 'user' | 'plan_only' | 'viewer' | 'viewer_p7'

// Список регионов
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

// Текущая активная вкладка
let currentPlanTab = 'plan1';

// Временный флаг: автозаполнение факта для плана 5 из Oracle
// false = ручной ввод (временно), true = снова брать из view_omk_qlick
const ENABLE_ORACLE_PLAN5_AUTOFILL = true;

// Проверка авторизации
function checkAuth() {
    const token = localStorage.getItem('accessToken');
    
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }
    
    fetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => {
        if (!response.ok) throw new Error('Unauthorized');
        return response.json();
    })
    .then(data => {
        if (data.success && data.user) {
            document.getElementById('userNameDisplay').textContent = data.user.fullName || data.user.username;
            
            // Показываем кнопку админки если администратор
            if (data.user.role === 'admin') {
                document.getElementById('adminPanelBtn').style.display = 'block';
            }
            
            // Проверяем права доступа к формам планов
            if (data.user.formType !== 'plans' && data.user.username !== 'admin2') {
                alert('У вас нет доступа к этим формам');
                window.location.href = '/index.html';
                return;
            }

            // Сохраняем роль и флаги
            currentUserRole = data.user.role;
            if (data.user.role === 'admin') {
                userIsAdmin = true;
                document.getElementById('adminPanelBtn').style.display = 'block';
            } else if (data.user.role === 'planner') {
                userIsPlanner = true;
                document.getElementById('adminPanelBtn').style.display = 'block';
            } else if (data.user.role === 'viewer') {
                // Скрываем кнопку сохранения для read-only пользователей
                const saveBtn = document.getElementById('savePlansBtn');
                if (saveBtn) saveBtn.style.display = 'none';
            }

            if (data.user.regionIndex !== null && data.user.regionIndex !== undefined) {
                userRegionIndex = data.user.regionIndex;
                applyRegionalFilter();
            }

            // Блокируем поля дат для не-админов
            if (data.user.role !== 'admin') {
                for (let p = 1; p <= 8; p++) {
                    const el = document.getElementById(`plan${p}-date`);
                    if (el) {
                        el.disabled = true;
                        el.style.background = '#f3f4f6';
                        el.style.cursor = 'not-allowed';
                    }
                }
            }

            // Применяем ограничения колонок сразу (таблицы уже могут быть созданы)
            applyColumnRestrictions();
        } else {
            throw new Error('User data not found');
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login.html';
    });
    
    return true;
}

// Хранилище примечаний
const notes = {};

// Планы, для которых строка «Всего» рассчитывается автоматически
const AUTO_TOTAL_PLANS = [1, 2, 3, 4, 5, 7, 8];

// Текущая дата по Астане (UTC+5) в формате "6 марта 2026"
function getCurrentDateAstana() {
    const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Almaty' }));
    return `${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
}

// Устанавливаем текущую дату для всех планов (всегда обновляем)
function setDefaultDates() {
    const today = getCurrentDateAstana();
    for (let p = 1; p <= 8; p++) {
        const el = document.getElementById(`plan${p}-date`);
        if (el) el.value = today;
    }
}

// Инициализация таблиц
function initializeTables() {
    for (let i = 1; i <= 8; i++) {
        const tbody = document.getElementById(`plan${i}-tbody`);
        if (!tbody) continue;
        
        let html = '';
        const num = 'type="number" step="0.01" min="0" placeholder="0"';
        const txt = 'placeholder="0/0"';
        const isText = (i === 8);
        const isP7   = (i === 7); // план 7 — особая структура с 4 вводимыми полями

        function makeRow(rowIdx, regionCell) {
            if (isP7) {
                // Структура plan7: kol_del(0), planned_qty(1), planned_pct(2), actual_pct(3), coeff(4=readonly)
                // Коэффициент = actual_pct / planned_pct * 100
                const rr7 = typeof rowIdx === 'number' ? rowIdx : 20;
                return `
                <td style="text-align:center; font-weight:600;">${typeof rowIdx === 'number' ? rowIdx + 1 : '-'}</td>
                <td>${regionCell}</td>
                <td><input ${num} data-plan="7" data-row="${rr7}" data-col="0" oninput="calculateTotals(7)"><button class="note-btn" onclick="showNoteModal('plan7',${rr7},0)" title="Добавить примечание">📝</button></td>
                <td><input ${num} data-plan="7" data-row="${rr7}" data-col="1" oninput="calculateTotals(7)"><button class="note-btn" onclick="showNoteModal('plan7',${rr7},1)" title="Добавить примечание">📝</button></td>
                <td><input ${num} data-plan="7" data-row="${rr7}" data-col="2" oninput="calculateCoefficient(7,${rr7})"><button class="note-btn" onclick="showNoteModal('plan7',${rr7},2)" title="Добавить примечание">📝</button></td>
                <td><input ${num} data-plan="7" data-row="${rr7}" data-col="3" oninput="calculateCoefficient(7,${rr7})"><button class="note-btn" onclick="showNoteModal('plan7',${rr7},3)" title="Добавить примечание">📝</button></td>
                <td><input ${num} data-plan="7" data-row="${rr7}" data-col="4" readonly style="background:#f3f4f6;cursor:not-allowed;"><button class="note-btn" onclick="showNoteModal('plan7',${rr7},4)" title="Добавить примечание">📝</button></td>`;
            }
            const ia = isText ? txt : num;
            const roCoefficient = 'readonly style="background:#f3f4f6;cursor:not-allowed;"';
            const oi = isText ? `oninput="calculateTotals(${i})"` : `oninput="calculateCoefficient(${i},${typeof rowIdx === 'number' ? rowIdx : 20})"`;
            const rr = typeof rowIdx === 'number' ? rowIdx : 20;
            return `
                <td style="text-align:center; font-weight:600;">${typeof rowIdx === 'number' ? rowIdx + 1 : '-'}</td>
                <td>${regionCell}</td>
                <td><input ${ia} data-plan="${i}" data-row="${rr}" data-col="0" ${oi}><button class="note-btn" onclick="showNoteModal('plan${i}',${rr},0)" title="Добавить примечание">📝</button></td>
                <td><input ${ia} data-plan="${i}" data-row="${rr}" data-col="1" ${oi}><button class="note-btn" onclick="showNoteModal('plan${i}',${rr},1)" title="Добавить примечание">📝</button></td>
                <td><input ${ia} data-plan="${i}" data-row="${rr}" data-col="2" ${roCoefficient}><button class="note-btn" onclick="showNoteModal('plan${i}',${rr},2)" title="Добавить примечание">📝</button></td>`;
        }

        REGIONS.forEach((region, index) => {
            html += `<tr>${makeRow(index, `<strong>${region}</strong>`)}</tr>`;
        });
        html += `<tr style="background:#e0f2fe; font-weight:600;">${makeRow('total', '<strong>Всего</strong>')}</tr>`;
        
        tbody.innerHTML = html;

        // Строка «Всего» — readonly для авто-рассчитываемых планов
        if (AUTO_TOTAL_PLANS.includes(i)) {
            const rows = tbody.querySelectorAll('tr');
            const totalRow = rows[rows.length - 1];
            if (totalRow) {
                totalRow.querySelectorAll('input').forEach(inp => {
                    inp.readOnly = true;
                    inp.style.background = '#e0f2fe';
                    inp.style.cursor = 'not-allowed';
                    inp.removeAttribute('oninput');
                });
            }
        }
    }
}

// Фильтр строк для регионального пользователя — показывает только его строку
function applyRegionalFilter() {
    if (userRegionIndex === null) return;

    for (let i = 1; i <= 8; i++) {
        const tbody = document.getElementById(`plan${i}-tbody`);
        if (!tbody) continue;
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, idx) => {
            // Показываем только строку своего региона (скрываем остальные и «Всего»)
            row.style.display = (idx === userRegionIndex) ? '' : 'none';
        });
    }
}

// Ограничения по колонкам в зависимости от роли:
// admin      → редактирует всё
// planner    → редактирует всё (krik)
// user       → только col 1 (фактический) своей строки
// plan_only  → только col 0 (плановый), все строки
// viewer     → ничего не редактирует
// viewer_p7  → viewer для всех планов, кроме plan8 (отображ. план 7) — полный доступ
function applyColumnRestrictions() {
    if (userIsAdmin || userIsPlanner) return;

    const role = currentUserRole;

    for (let planNum = 1; planNum <= 8; planNum++) {
        const tbody = document.getElementById(`plan${planNum}-tbody`);
        if (!tbody) continue;

        // viewer_p7: план 8 (отображаемый как 7) — полный доступ, остальные — viewer
        if (role === 'viewer_p7' && planNum === 8) continue;

        tbody.querySelectorAll('tr').forEach((row) => {
            const inputs = row.querySelectorAll('input');
            const isP7 = (planNum === 7);

            if (role === 'viewer' || role === 'viewer_p7') {
                const editCount = isP7 ? 4 : 2;
                for (let k = 0; k < editCount; k++) {
                    if (inputs[k]) lockInput(inputs[k]);
                }
            } else if (role === 'plan_only') {
                if (isP7) {
                    if (inputs[0]) lockInput(inputs[0]);
                    if (inputs[3]) lockInput(inputs[3]);
                } else {
                    if (inputs[1]) lockInput(inputs[1]);
                }
            } else if (userRegionIndex !== null) {
                if (isP7) {
                    if (inputs[0]) lockInput(inputs[0]);
                    if (inputs[1]) lockInput(inputs[1]);
                    if (inputs[2]) lockInput(inputs[2]);
                } else {
                    if (inputs[0]) lockInput(inputs[0]);
                }
            }
        });
    }

    if (role === 'viewer') {
        const saveBtn = document.getElementById('savePlansBtn');
        if (saveBtn) saveBtn.style.display = 'none';
    }

    // После ограничений ролей возвращаем цветовую подсветку коэффициентов.
    refreshCoefficientColorsAllPlans();
}

function lockInput(input) {
    input.disabled = true;
    input.style.background = '#f3f4f6';
    input.style.cursor = 'not-allowed';
}

function formatNumberToTenths(value) {
    const num = parseFloat(String(value || '').replace(',', '.'));
    if (!Number.isFinite(num)) return '';
    return num.toFixed(1);
}

function parseCoefficientForColor(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === '—') return null;

    const parsePart = (part) => {
        const normalized = String(part || '').trim().replace(',', '.');
        if (!normalized) return null;
        const parsed = parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    };

    if (raw.includes('/')) {
        const parts = raw.split('/').map(parsePart).filter(Number.isFinite);
        if (!parts.length) return null;
        return parts.reduce((sum, n) => sum + n, 0) / parts.length;
    }

    return parsePart(raw);
}

function getDefaultCoeffBackground(input) {
    const row = input?.closest('tr');
    const isTotalRow = row?.querySelector('td:first-child')?.textContent.trim() === '-';
    return isTotalRow ? '#e0f2fe' : '#f3f4f6';
}

function applyCoefficientCellColor(input) {
    if (!input) return;
    const value = parseCoefficientForColor(input.value);

    if (!Number.isFinite(value)) {
        input.style.background = getDefaultCoeffBackground(input);
        input.style.color = '';
        return;
    }

    if (value >= 100) {
        input.style.background = '#dcfce7'; // green
        input.style.color = '#14532d';
    } else if (value >= 80) {
        input.style.background = '#fef9c3'; // yellow
        input.style.color = '#713f12';
    } else {
        input.style.background = '#fee2e2'; // red
        input.style.color = '#7f1d1d';
    }
}

function refreshCoefficientColorsAllPlans() {
    for (let planNum = 1; planNum <= 8; planNum++) {
        const tbody = document.getElementById(`plan${planNum}-tbody`);
        if (!tbody) continue;
        const coeffCol = planNum === 7 ? 4 : 2;
        const coeffInputs = tbody.querySelectorAll(`input[data-plan="${planNum}"][data-col="${coeffCol}"]`);
        coeffInputs.forEach(applyCoefficientCellColor);
    }
}

// Расчет коэффициента исполнения
// Для план 7: planned_pct=col2, actual_pct=col3, coeff=col4
//             (col0=kol_del, col1=planned_qty — не участвуют в расчёте)
// Для остальных: planned=col0, actual=col1, coeff=col2
function calculateCoefficient(planNum, rowIdx) {
    const recalcTotals = arguments.length > 2 ? !!arguments[2] : true;

    const pCol = planNum === 7 ? 2 : 0;
    const aCol = planNum === 7 ? 3 : 1;
    const cCol = planNum === 7 ? 4 : 2;
    const plannedInput    = document.querySelector(`input[data-plan="${planNum}"][data-row="${rowIdx}"][data-col="${pCol}"]`);
    const actualInput     = document.querySelector(`input[data-plan="${planNum}"][data-row="${rowIdx}"][data-col="${aCol}"]`);
    const coefficientInput = document.querySelector(`input[data-plan="${planNum}"][data-row="${rowIdx}"][data-col="${cCol}"]`);
    
    if (!plannedInput || !actualInput || !coefficientInput) return;
    
    const parseSlashValue = (value) => {
        const s = String(value || '').trim();
        if (!s) return [0, 0];
        if (!s.includes('/')) {
            return [parseFloat(s.replace(',', '.')) || 0, 0];
        }
        const parts = s.split('/').map(v => parseFloat(v.trim().replace(',', '.')) || 0);
        return [parts[0] || 0, parts[1] || 0];
    };

    const formatCoeff = (value) => {
        if (!isFinite(value) || value <= 0) return '';
        const normalized = Math.max(0, Math.min(100, Math.round(value)));
        return String(normalized);
    };

    const clampToPercentRange = (value) => {
        if (!isFinite(value)) return 0;
        return Math.max(0, Math.min(100, value));
    };

    const formatCoeffOrZero = (value) => {
        if (!isFinite(value) || value < 0) return '0';
        const normalized = Math.max(0, Math.min(100, Math.round(value)));
        return String(normalized);
    };

    const clampPercent = (value) => {
        if (!isFinite(value)) return 0;
        if (value < 0) return 0;
        return value > 100 ? 100 : value;
    }
    
    if (planNum === 8) {
        const [planned1, planned2] = parseSlashValue(plannedInput.value);
        const [actual1, actual2] = parseSlashValue(actualInput.value);
        const bothEmpty = planned1 === 0 && planned2 === 0;
        if (bothEmpty) {
            coefficientInput.value = '';
            applyCoefficientCellColor(coefficientInput);
            return;
        }

        const hasSlash = String(plannedInput.value).includes('/') || String(actualInput.value).includes('/');
        if (!hasSlash) {
            if (planned1 === 0) {
                coefficientInput.value = '';
                applyCoefficientCellColor(coefficientInput);
                return;
            }
            const coefficient = clampPercent((actual1 / planned1) * 100);
            coefficientInput.value = formatCoeff(coefficient);
            applyCoefficientCellColor(coefficientInput);
        } else {
            const c1 = clampPercent(planned1 > 0 ? (actual1 / planned1) * 100 : 0);
            const c2 = clampPercent(planned2 > 0 ? (actual2 / planned2) * 100 : 0);
            coefficientInput.value = `${formatCoeffOrZero(c1)}/${formatCoeffOrZero(c2)}`;
            applyCoefficientCellColor(coefficientInput);
        }
    } else {
        const planned = parseFloat(plannedInput.value) || 0;
        const actual = parseFloat(actualInput.value) || 0;
        
        if (planned === 0) {
            coefficientInput.value = '';
            applyCoefficientCellColor(coefficientInput);
            return;
        }
        
        // Рассчитываем процент фактического от планового
        let coefficient = (actual / planned) * 100;
        
        // Ограничиваем максимум 100%
        if (coefficient > 100) {
            coefficient = 100;
        }
        
        coefficientInput.value = formatCoeff(coefficient);
        applyCoefficientCellColor(coefficientInput);
    }

    // Пересчитываем строку «Всего» если план авто-рассчитываемый
    if (recalcTotals) {
        calculateTotals(planNum);
    }
}

// Автопересчет коэффициента исполнения по всем строкам (кроме строки «Всего»)
function recalculateCoefficientColumn(planNum) {
    const tbody = document.getElementById(`plan${planNum}-tbody`);
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const dataRows = rows.slice(0, -1);

    dataRows.forEach(row => {
        const firstCell = row.querySelector('td:first-child');
        if (!firstCell || firstCell.textContent.trim() === '-') return;

        const markerCol = planNum === 7 ? 2 : 0;
        const markerInput = row.querySelector(`input[data-plan="${planNum}"][data-col="${markerCol}"]`);
        if (!markerInput || !markerInput.dataset.row) return;

        calculateCoefficient(planNum, markerInput.dataset.row, false);
    });
}

// Автоматический расчёт строки «Всего»
// Планы 1,2,4,5: planned=среднее, actual=среднее, coeff=actual/planned*100
// План 7: kol_del=сумма, planned_qty=сумма, planned_pct=среднее, actual_pct=среднее, coeff=act_pct/plan_pct*100
function calculateTotals(planNum) {
    if (!AUTO_TOTAL_PLANS.includes(planNum)) return;

    const tbody = document.getElementById(`plan${planNum}-tbody`);
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length < 2) return;

    const totalRow = rows[rows.length - 1];
    const dataRows = rows.slice(0, -1);
    const totalInputs = totalRow.querySelectorAll('input');
    const formatCoeff = (value) => {
        if (!isFinite(value) || value <= 0) return '';
        const normalized = Math.max(0, Math.min(100, Math.round(value)));
        return String(normalized);
    };
    const clampToPercentRange = (value) => {
        if (!isFinite(value)) return 0;
        return Math.max(0, Math.min(100, value));
    };
    const formatCoeffOrZero = (value) => {
        if (!isFinite(value) || value < 0) return '0';
        const normalized = Math.max(0, Math.min(100, Math.round(value)));
        return String(normalized);
    };

    if (planNum === 8) {
        // План 8 (отображается как 7): формат "X/Y"
        // Плановый Всего = суммаX / суммаY, Фактический Всего = суммаX / суммаY
        // Коэффициент = (factX/planX*100) / (factY/planY*100)
        let pX = 0, pY = 0, aX = 0, aY = 0;

        function parseSlash(val) {
            if (!val || val.trim() === '') return [0, 0];
            const parts = val.split('/').map(s => parseFloat(s.trim().replace(',', '.')) || 0);
            return [parts[0] || 0, parts[1] || 0];
        }

        dataRows.forEach(row => {
            const inputs = row.querySelectorAll('input');
            const [px, py] = parseSlash(inputs[0]?.value);
            const [ax, ay] = parseSlash(inputs[1]?.value);
            pX += px; pY += py;
            aX += ax; aY += ay;
        });

        if (totalInputs[0]) totalInputs[0].value = (pX || pY) ? `${pX}/${pY}` : '';
        if (totalInputs[1]) totalInputs[1].value = (aX || aY) ? `${aX}/${aY}` : '';

        const cX = clampToPercentRange(pX > 0 ? (aX / pX * 100) : 0);
        const cY = clampToPercentRange(pY > 0 ? (aY / pY * 100) : 0);
        if (totalInputs[2]) totalInputs[2].value = (cX || cY) ? `${formatCoeffOrZero(cX)}/${formatCoeffOrZero(cY)}` : '';
        if (totalInputs[2]) applyCoefficientCellColor(totalInputs[2]);

    } else if (planNum === 7) {
        // Plan 7 (отображается как 6): расширенная структура
        // col0=kol_del(sum), col1=planned_qty(sum), col2=planned_pct(avg), col3=actual_pct(avg), col4=coeff
        let sumKD = 0, sumPQ = 0, sumPP = 0, sumAP = 0;
        let cntPP = 0, cntAP = 0;

        dataRows.forEach(row => {
            const inputs = row.querySelectorAll('input');
            sumKD += parseFloat(inputs[0]?.value) || 0;
            sumPQ += parseFloat(inputs[1]?.value) || 0;
            sumPP += parseFloat(inputs[2]?.value) || 0;
            sumAP += parseFloat(inputs[3]?.value) || 0;
            if (inputs[2]?.value !== '') cntPP++;
            if (inputs[3]?.value !== '') cntAP++;
        });

        if (totalInputs[0]) totalInputs[0].value = sumKD || '';
        if (totalInputs[1]) totalInputs[1].value = sumPQ || '';

        const avgPP = cntPP > 0 ? sumPP / cntPP : 0;
        const avgAP = cntAP > 0 ? sumAP / cntAP : 0;
        if (totalInputs[2]) totalInputs[2].value = avgPP ? avgPP.toFixed(1) : '';
        if (totalInputs[3]) totalInputs[3].value = avgAP ? avgAP.toFixed(1) : '';

        const coeff = clampToPercentRange(avgPP > 0 ? (avgAP / avgPP) * 100 : 0);
        if (totalInputs[4]) totalInputs[4].value = formatCoeff(coeff);
        if (totalInputs[4]) applyCoefficientCellColor(totalInputs[4]);

    } else if (planNum === 3) {
        // План 3: сумма (не среднее)
        let sumP = 0, sumA = 0;

        dataRows.forEach(row => {
            const inputs = row.querySelectorAll('input');
            sumP += parseFloat(inputs[0]?.value) || 0;
            sumA += parseFloat(inputs[1]?.value) || 0;
        });

        if (totalInputs[0]) totalInputs[0].value = sumP || '';
        if (totalInputs[1]) totalInputs[1].value = sumA || '';

        const coeff = clampToPercentRange(sumP > 0 ? (sumA / sumP) * 100 : 0);
        if (totalInputs[2]) totalInputs[2].value = formatCoeff(coeff);
        if (totalInputs[2]) applyCoefficientCellColor(totalInputs[2]);

    } else {
        // Планы 1, 2, 4, 5: среднее арифметическое
        let sumP = 0, sumA = 0, cntP = 0, cntA = 0;

        dataRows.forEach(row => {
            const inputs = row.querySelectorAll('input');
            sumP += parseFloat(inputs[0]?.value) || 0;
            sumA += parseFloat(inputs[1]?.value) || 0;
            if (inputs[0]?.value !== '') cntP++;
            if (inputs[1]?.value !== '') cntA++;
        });

        const avgP = cntP > 0 ? sumP / cntP : 0;
        const avgA = cntA > 0 ? sumA / cntA : 0;

        if (planNum === 1) {
            // План 1: строка "Всего" только целыми числами.
            if (totalInputs[0]) totalInputs[0].value = avgP ? String(Math.round(avgP)) : '';
            if (totalInputs[1]) totalInputs[1].value = avgA ? String(Math.round(avgA)) : '';
        } else {
            if (totalInputs[0]) totalInputs[0].value = avgP ? avgP.toFixed(1) : '';
            if (totalInputs[1]) totalInputs[1].value = avgA ? avgA.toFixed(1) : '';
        }

        const coeff = clampToPercentRange(avgP > 0 ? (avgA / avgP) * 100 : 0);
        if (totalInputs[2]) totalInputs[2].value = formatCoeff(coeff);
        if (totalInputs[2]) applyCoefficientCellColor(totalInputs[2]);
    }

    // Автообновление всего столбца «Коэффициент исполнения» по той же логике,
    // что и для измененной строки «Всего»
    recalculateCoefficientColumn(planNum);
}

// Показать модальное окно для примечания
function showNoteModal(planId, rowIdx, colIdx) {
    const noteKey = `${planId}_${rowIdx}_${colIdx}`;
    const currentNote = notes[noteKey] || '';
    
    const modal = document.getElementById('noteModal');
    const textarea = document.getElementById('noteText');
    const saveBtn = document.getElementById('saveNoteBtn');
    
    textarea.value = currentNote;
    modal.classList.add('active');
    
    saveBtn.onclick = () => {
        const noteValue = textarea.value.trim();
        if (noteValue) {
            notes[noteKey] = noteValue;
            // Подсвечиваем кнопку если есть примечание
            const input = document.querySelector(`input[data-plan="${planId.replace('plan', '')}"][data-row="${rowIdx}"][data-col="${colIdx}"]`);
            if (input) {
                const btn = input.nextElementSibling;
                if (btn) btn.style.background = '#fbbf24';
            }
        } else {
            delete notes[noteKey];
        }
        modal.classList.remove('active');
    };
}

function closeNoteModal() {
    document.getElementById('noteModal').classList.remove('active');
}

// Инициализация вкладок
function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const sections = document.querySelectorAll('.form-section');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            currentPlanTab = targetTab;
        });
    });
}

// Сбор данных таблицы
function collectTableData(planId) {
    const tbody = document.getElementById(`${planId}-tbody`);
    if (!tbody) return []; // план скрыт (например plan6)
    const rows = tbody.querySelectorAll('tr');
    const data = [];
    
    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const rowData = [];
        const cells = row.querySelectorAll('td');
        
        // Первая ячейка (номер)
        rowData.push(cells[0].textContent.trim());
        // Вторая ячейка (название региона)
        rowData.push(cells[1].textContent.trim());
        // Остальные - значения инпутов
        inputs.forEach(input => {
            rowData.push(input.value || '');
        });
        
        data.push(rowData);
    });
    
    return data;
}

// Восстановление данных
function restoreTableData(planId, data) {
    if (!data || data.length === 0) return;
    
    const tbody = document.getElementById(`${planId}-tbody`);
    if (!tbody) return; // план скрыт (например plan6)
    const rows = tbody.querySelectorAll('tr');
    
    data.forEach((rowData, index) => {
        if (index >= rows.length) return;
        const inputs = rows[index].querySelectorAll('input');
        
        // Обратная совместимость для plan7:
        // Актуальный формат 7 эл.: [num, region, kol_del, planned_qty, planned_pct, actual_pct, coeff]
        // Промежуточный 6 эл.: [num, region, kol_del, planned_qty, actual_pct, coeff]
        // Старый формат 5 эл.: [num, region, planned, actual, coeff]
        let values;
        if (planId === 'plan7') {
            if (rowData.length >= 7) {
                // Актуальный формат
                values = rowData.slice(2);
            } else if (rowData.length === 6) {
                // Промежуточный: kol_del, planned_qty заняты, planned_pct пустой
                values = [rowData[2], rowData[3], '', rowData[4], rowData[5]];
            } else {
                // Старый (5 эл.): planned→planned_qty, без kol_del и planned_pct
                values = ['', rowData[2], '', rowData[3], rowData[4]];
            }
        } else {
            values = rowData.slice(2);
        }
        
        values.forEach((value, i) => {
            if (inputs[i]) {
                let normalizedValue = value || '';
                // План 2: фактический показатель (col=1) храним/показываем до десятых.
                if (planId === 'plan2' && i === 1) {
                    normalizedValue = formatNumberToTenths(normalizedValue);
                }
                inputs[i].value = normalizedValue;
            }
        });
    });
}

// Сохранение текущего открытого плана (не всех планов сразу)
async function saveAllPlans() {
    const token = localStorage.getItem('accessToken');
    const plans = {};
    const notesToSave = {};
    const planId = currentPlanTab;

    plans[planId] = collectTableData(planId);

    // Передаем только notes текущего плана
    const notePrefix = `${planId}_`;
    Object.keys(notes).forEach((key) => {
        if (key.startsWith(notePrefix)) {
            notesToSave[key] = notes[key];
        }
    });

    // Собираем дату только текущего плана
    const planDates = {};
    const dateEl = document.getElementById(`${planId}-date`);
    if (dateEl) planDates[planId] = dateEl.value;

    try {
        const response = await fetch('/api/plans/save', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ plans, notes: notesToSave, planDates })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            document.getElementById('successModal').classList.add('active');
        } else {
            alert('Ошибка сохранения: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при сохранении данных');
    }
}

// Загрузка планов с сервера
async function loadPlansFromServer() {
    const token = localStorage.getItem('accessToken');
    
    try {
        const response = await fetch('/api/plans/load', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const result = await response.json();
        
        if (result.success && result.plans) {
            for (let i = 1; i <= 8; i++) {
                const planId = `plan${i}`;
                if (result.plans[planId]) {
                    restoreTableData(planId, result.plans[planId]);
                }
            }
            
            // Ставим актуальную дату (текущий день по Астане)
            setDefaultDates();

            // Восстанавливаем примечания
            if (result.notes) {
                Object.assign(notes, result.notes);
                // Подсвечиваем кнопки с примечаниями
                for (let key in result.notes) {
                    const [planId, rowIdx, colIdx] = key.split('_');
                    const planNum = planId.replace('plan', '');
                    const input = document.querySelector(`input[data-plan="${planNum}"][data-row="${rowIdx}"][data-col="${colIdx}"]`);
                    if (input) {
                        const btn = input.nextElementSibling;
                        if (btn) btn.style.background = '#fbbf24';
                    }
                }
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки:', error);
    } finally {
        // Пересчитываем «Всего» для авто-рассчитываемых планов
        AUTO_TOTAL_PLANS.forEach(p => calculateTotals(p));
        // После загрузки данных применяем ограничения (инпуты пересозданы)
        applyColumnRestrictions();
        // Подставляем фактические данные из Oracle (если есть)
        applyOraclePlan2();
        applyOraclePlan4();
        if (ENABLE_ORACLE_PLAN5_AUTOFILL) {
            applyOraclePlan5();
        } else {
            enableManualPlan5FactInput();
        }
    }
}

// Маппинг внутреннего номера плана → отображаемый номер (план 6 скрыт: 7→6, 8→7)
const PLAN_DISPLAY_NUMBER = { 7: 6, 8: 7 };

// Скачивание текущего плана
async function downloadCurrentPlan() {
    const token = localStorage.getItem('accessToken');
    const planId = currentPlanTab;
    
    try {
        // Собираем данные текущего плана
        const planData = collectTableData(planId);
        const planNumber = planId.replace('plan', '');
        
        const internalNum = parseInt(planNumber);
        const displayNum = PLAN_DISPLAY_NUMBER[internalNum] || internalNum;

        const response = await fetch('/api/plans/download', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                planNumber: internalNum,
                displayNumber: displayNum,
                planData: planData,
                planDate: document.getElementById(`plan${internalNum}-date`)?.value || ''
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка при генерации документа');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Получаем имя файла из заголовка
        const disposition = response.headers.get('Content-Disposition');
        let filename = `План_${displayNum}.docx`;
        if (disposition && disposition.includes('filename')) {
            const matches = /filename\*?=['"]?([^'";\n]+)['"]?/i.exec(disposition);
            if (matches && matches[1]) {
                filename = decodeURIComponent(matches[1].replace('UTF-8\'\'', ''));
            }
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        console.log(`✅ Документ План ${displayNum} (internal: ${internalNum}) успешно загружен`);
        
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при скачивании документа: ' + error.message);
    }
}

// Переход в админку
function goToAdmin2() {
    window.location.href = '/admin2';
}

// Выход
function logout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// Закрытие модального окна
function closeModal() {
    document.getElementById('successModal').classList.remove('active');
}

// =====================================================================
// СОРТИРОВКА ПО КОЭФФИЦИЕНТУ ИСПОЛНЕНИЯ
// =====================================================================

const planSortState = {}; // 'asc' | 'desc' | null — состояние на каждый план

// Парсим значение коэффициента: "75.3" → 75.3, "3/5" → 0.6, "—"/пусто → 0
function parseCoeffVal(val) {
    if (!val || val === '—') return 0;
    const s = String(val).trim();
    if (s.includes('/')) {
        const [a, b] = s.split('/').map(Number);
        return b ? a / b : 0;
    }
    return parseFloat(s) || 0;
}

function sortByCoefficient(planId, headerTh) {
    const tbody = document.getElementById(`${planId}-tbody`);
    if (!tbody) return;

    const next = planSortState[planId] === 'desc' ? 'asc' : 'desc';
    planSortState[planId] = next;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const totalRow = rows.find(r => r.querySelector('td:first-child')?.textContent.trim() === '-');
    const dataRows = rows.filter(r => r !== totalRow);

    dataRows.sort((a, b) => {
        // Коэффициент всегда в последнем input (readonly), независимо от плана
        const aInputs = a.querySelectorAll('input');
        const bInputs = b.querySelectorAll('input');
        const aVal = parseCoeffVal(aInputs[aInputs.length - 1]?.value);
        const bVal = parseCoeffVal(bInputs[bInputs.length - 1]?.value);
        return next === 'desc' ? bVal - aVal : aVal - bVal;
    });

    dataRows.forEach((r, i) => {
        tbody.appendChild(r);
        // Обновляем порядковый номер в первой ячейке
        const numCell = r.querySelector('td:first-child');
        if (numCell) numCell.textContent = i + 1;
    });
    if (totalRow) tbody.appendChild(totalRow);

    // Обновляем индикатор в заголовке
    const base = headerTh.dataset.baseText || headerTh.textContent.replace(/[\s▲▼]+$/, '').trim();
    headerTh.dataset.baseText = base;
    headerTh.textContent = base + (next === 'desc' ? ' ▼' : ' ▲');
}

function initSortableHeaders() {
    document.querySelectorAll('.form-section').forEach(section => {
        const planId = section.id;
        section.querySelectorAll('table.report-table thead th').forEach(th => {
            if (th.textContent.toLowerCase().includes('коэффициент')) {
                th.style.cursor = 'pointer';
                th.title = 'Нажмите для сортировки';
                th.style.userSelect = 'none';
                th.addEventListener('click', () => sortByCoefficient(planId, th));
            }
        });
    });
}

// =====================================================================
// АВТОЗАПОЛНЕНИЕ ПЛАНОВ ИЗ ORACLE (через кэш на сервере)
// =====================================================================

// Список регионов плана 2 в том порядке, что и строки таблицы
const PLAN2_REGIONS_ORDER = [
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

async function applyOraclePlan2() {
    const token = localStorage.getItem('accessToken');
    try {
        const response = await fetch('/api/plans/oracle-plan2', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!result.success || !result.found || !result.data) return;

        const oracleData = result.data; // { 'г. Астана': 53.43, ... }
        const tbody = document.getElementById('plan2-tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');

        PLAN2_REGIONS_ORDER.forEach((regionName, idx) => {
            if (idx >= rows.length) return;
            const row = rows[idx];
            const val = oracleData[regionName];
            if (val === undefined || val === null) return;

            // Фактический показатель — второй input (data-col="1")
            const factInput = row.querySelector('input[data-plan="2"][data-col="1"]');
            if (!factInput) return;

            const formatted = parseFloat(val).toFixed(1);
            factInput.value = formatted;
            factInput.readOnly = true;
            factInput.style.background = '#e8f5e9';
            factInput.style.cursor = 'not-allowed';
            factInput.title = `Авто из Oracle: ${formatted}%`;
        });

        // Пересчитываем коэффициенты и строку «Всего»
        calculateTotals(2);

        console.log(`✅ Oracle plan2: подставлено ${Object.keys(oracleData).length} регионов (обновлено ${result.fetchedAt ? new Date(result.fetchedAt).toLocaleString('ru-RU') : '—'})`);

    } catch (e) {
        console.warn('Oracle plan2 недоступен, пропускаем автозаполнение:', e.message);
    }
}

// Список регионов плана 4 в порядке строк таблицы (совпадает с PLAN2_REGIONS_ORDER)
const PLAN4_REGIONS_ORDER = [
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

// Список регионов плана 5 в порядке строк таблицы (совпадает с PLAN2_REGIONS_ORDER)
const PLAN5_REGIONS_ORDER = [
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

function enableManualPlan5FactInput() {
    const tbody = document.getElementById('plan5-tbody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        const factInput = row.querySelector('input[data-plan="5"][data-col="1"]');
        if (!factInput) return;

        // Роли viewer/viewer_p7/plan_only могут быть заблокированы общей политикой.
        if (!factInput.disabled) {
            factInput.readOnly = false;
            factInput.removeAttribute('readonly');
            factInput.style.background = '';
            factInput.style.cursor = '';
        }
        factInput.title = 'Ручной ввод (автоподстановка Oracle временно отключена)';
    });
}

async function applyOraclePlan5() {
    if (!ENABLE_ORACLE_PLAN5_AUTOFILL) return;

    const token = localStorage.getItem('accessToken');
    try {
        const response = await fetch('/api/plans/oracle-plan5', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!result.success || !result.found || !result.data) return;

        const oracleData = result.data;
        const tbody = document.getElementById('plan5-tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');

        PLAN5_REGIONS_ORDER.forEach((regionName, idx) => {
            if (idx >= rows.length) return;
            const row = rows[idx];
            const val = oracleData[regionName];
            if (val === undefined || val === null) return;

            const factInput = row.querySelector('input[data-plan="5"][data-col="1"]');
            if (!factInput) return;

            const formatted = parseFloat(val).toFixed(1);
            factInput.value = formatted;
            factInput.readOnly = true;
            factInput.style.background = '#e8f5e9';
            factInput.style.cursor = 'not-allowed';
            factInput.title = `Авто из Oracle: ${formatted}%`;
        });

        calculateTotals(5);

        console.log(`✅ Oracle plan5: подставлено ${Object.keys(oracleData).length} регионов (обновлено ${result.fetchedAt ? new Date(result.fetchedAt).toLocaleString('ru-RU') : '—'})`);

    } catch (e) {
        console.warn('Oracle plan5 недоступен, пропускаем автозаполнение:', e.message);
    }
}

async function applyOraclePlan4() {
    const token = localStorage.getItem('accessToken');
    try {
        const response = await fetch('/api/plans/oracle-plan4', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!result.success || !result.found || !result.data) return;

        const oracleData = result.data;
        const tbody = document.getElementById('plan4-tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');

        PLAN4_REGIONS_ORDER.forEach((regionName, idx) => {
            if (idx >= rows.length) return;
            const row = rows[idx];
            const val = oracleData[regionName];
            if (val === undefined || val === null) return;

            // Фактический показатель — data-col="1"
            const factInput = row.querySelector('input[data-plan="4"][data-col="1"]');
            if (!factInput) return;

            const formatted = parseFloat(val).toFixed(2).replace(/\.?0+$/, '');
            factInput.value = formatted;
            factInput.readOnly = true;
            factInput.style.background = '#e8f5e9';
            factInput.style.cursor = 'not-allowed';
            factInput.title = `Авто из Oracle: ${formatted}%`;
        });

        calculateTotals(4);

        console.log(`✅ Oracle plan4: подставлено ${Object.keys(oracleData).length} регионов (обновлено ${result.fetchedAt ? new Date(result.fetchedAt).toLocaleString('ru-RU') : '—'})`);

    } catch (e) {
        console.warn('Oracle plan4 недоступен, пропускаем автозаполнение:', e.message);
    }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    initializeTables();
    initTabs();
    initSortableHeaders();
    loadPlansFromServer();
});
