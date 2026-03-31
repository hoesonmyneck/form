// Индекс региона текущего пользователя (null = admin/planner, видит всё)
let userRegionIndex = null;
let userIsAdmin   = false;
let userIsPlanner = false;
let currentUserRole = null; // 'admin' | 'planner' | 'user' | 'plan_only' | 'viewer'

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
                ['plan1-date', 'plan2-date'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.disabled = true;
                        el.style.background = '#f3f4f6';
                        el.style.cursor = 'not-allowed';
                    }
                });
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
                <td><input ${num} data-plan="7" data-row="${rr7}" data-col="0"><button class="note-btn" onclick="showNoteModal('plan7',${rr7},0)" title="Добавить примечание">📝</button></td>
                <td><input ${num} data-plan="7" data-row="${rr7}" data-col="1"><button class="note-btn" onclick="showNoteModal('plan7',${rr7},1)" title="Добавить примечание">📝</button></td>
                <td><input ${num} data-plan="7" data-row="${rr7}" data-col="2" oninput="calculateCoefficient(7,${rr7})"><button class="note-btn" onclick="showNoteModal('plan7',${rr7},2)" title="Добавить примечание">📝</button></td>
                <td><input ${num} data-plan="7" data-row="${rr7}" data-col="3" oninput="calculateCoefficient(7,${rr7})"><button class="note-btn" onclick="showNoteModal('plan7',${rr7},3)" title="Добавить примечание">📝</button></td>
                <td><input ${num} data-plan="7" data-row="${rr7}" data-col="4" readonly style="background:#f3f4f6;cursor:not-allowed;"><button class="note-btn" onclick="showNoteModal('plan7',${rr7},4)" title="Добавить примечание">📝</button></td>`;
            }
            const ia = isText ? txt : num;
            const ro = isText ? '' : 'readonly style="background:#f3f4f6;cursor:not-allowed;"';
            const oi = isText ? '' : `oninput="calculateCoefficient(${i},${typeof rowIdx === 'number' ? rowIdx : 20})"`;
            const rr = typeof rowIdx === 'number' ? rowIdx : 20;
            return `
                <td style="text-align:center; font-weight:600;">${typeof rowIdx === 'number' ? rowIdx + 1 : '-'}</td>
                <td>${regionCell}</td>
                <td><input ${ia} data-plan="${i}" data-row="${rr}" data-col="0" ${oi}><button class="note-btn" onclick="showNoteModal('plan${i}',${rr},0)" title="Добавить примечание">📝</button></td>
                <td><input ${ia} data-plan="${i}" data-row="${rr}" data-col="1" ${oi}><button class="note-btn" onclick="showNoteModal('plan${i}',${rr},1)" title="Добавить примечание">📝</button></td>
                <td><input ${ia} data-plan="${i}" data-row="${rr}" data-col="2" ${ro}><button class="note-btn" onclick="showNoteModal('plan${i}',${rr},2)" title="Добавить примечание">📝</button></td>`;
        }

        REGIONS.forEach((region, index) => {
            html += `<tr>${makeRow(index, `<strong>${region}</strong>`)}</tr>`;
        });
        html += `<tr style="background:#e0f2fe; font-weight:600;">${makeRow('total', '<strong>Всего</strong>')}</tr>`;
        
        tbody.innerHTML = html;
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
function applyColumnRestrictions() {
    if (userIsAdmin || userIsPlanner) return; // Нет ограничений

    const role = currentUserRole;

    for (let planNum = 1; planNum <= 8; planNum++) {
        const tbody = document.getElementById(`plan${planNum}-tbody`);
        if (!tbody) continue;

        tbody.querySelectorAll('tr').forEach((row) => {
            const inputs = row.querySelectorAll('input');
            // plan7: inputs[0]=kol_del, inputs[1]=planned_qty, inputs[2]=planned_pct,
            //        inputs[3]=actual_pct, inputs[4]=coeff(readonly)
            // others: inputs[0]=planned, inputs[1]=actual, inputs[2]=coeff(readonly)
            const isP7 = (planNum === 7);

            if (role === 'viewer') {
                // Блокируем все редактируемые поля
                const editCount = isP7 ? 4 : 2;
                for (let k = 0; k < editCount; k++) {
                    if (inputs[k]) lockInput(inputs[k]);
                }
            } else if (role === 'plan_only') {
                // Только плановые: для plan7 — col1(qty) и col2(pct), col0 и col3 блокируем
                if (isP7) {
                    if (inputs[0]) lockInput(inputs[0]); // kol_del
                    if (inputs[3]) lockInput(inputs[3]); // actual_pct
                } else {
                    if (inputs[1]) lockInput(inputs[1]); // actual
                }
            } else if (userRegionIndex !== null) {
                // Региональный: только фактический (inputs[3] для plan7, inputs[1] иначе)
                if (isP7) {
                    if (inputs[0]) lockInput(inputs[0]); // kol_del
                    if (inputs[1]) lockInput(inputs[1]); // planned_qty
                    if (inputs[2]) lockInput(inputs[2]); // planned_pct
                } else {
                    if (inputs[0]) lockInput(inputs[0]); // planned
                }
            }
        });
    }

    // Скрываем кнопку сохранения для viewer
    if (role === 'viewer') {
        const saveBtn = document.getElementById('savePlansBtn');
        if (saveBtn) saveBtn.style.display = 'none';
    }
}

function lockInput(input) {
    input.disabled = true;
    input.style.background = '#f3f4f6';
    input.style.cursor = 'not-allowed';
}

// Расчет коэффициента исполнения
// Для план 7: planned_pct=col2, actual_pct=col3, coeff=col4
//             (col0=kol_del, col1=planned_qty — не участвуют в расчёте)
// Для остальных: planned=col0, actual=col1, coeff=col2
function calculateCoefficient(planNum, rowIdx) {
    const pCol = planNum === 7 ? 2 : 0;
    const aCol = planNum === 7 ? 3 : 1;
    const cCol = planNum === 7 ? 4 : 2;
    const plannedInput    = document.querySelector(`input[data-plan="${planNum}"][data-row="${rowIdx}"][data-col="${pCol}"]`);
    const actualInput     = document.querySelector(`input[data-plan="${planNum}"][data-row="${rowIdx}"][data-col="${aCol}"]`);
    const coefficientInput = document.querySelector(`input[data-plan="${planNum}"][data-row="${rowIdx}"][data-col="${cCol}"]`);
    
    if (!plannedInput || !actualInput || !coefficientInput) return;
    
    const planned = parseFloat(plannedInput.value) || 0;
    const actual = parseFloat(actualInput.value) || 0;
    
    if (planned === 0) {
        coefficientInput.value = '';
        return;
    }
    
    // Рассчитываем процент фактического от планового
    let coefficient = (actual / planned) * 100;
    
    // Ограничиваем максимум 100%
    if (coefficient > 100) {
        coefficient = 100;
    }
    
    // Округляем до 1 знака после запятой
    coefficientInput.value = coefficient.toFixed(1);
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
                inputs[i].value = value || '';
            }
        });
    });
}

// Сохранение всех планов
async function saveAllPlans() {
    const token = localStorage.getItem('accessToken');
    const plans = {};
    
    for (let i = 1; i <= 8; i++) {
        const planId = `plan${i}`;
        plans[planId] = collectTableData(planId);
    }
    
    // Собираем даты планов 1 и 2
    const planDates = {};
    const d1 = document.getElementById('plan1-date');
    const d2 = document.getElementById('plan2-date');
    if (d1) planDates.plan1 = d1.value;
    if (d2) planDates.plan2 = d2.value;

    try {
        const response = await fetch('/api/plans/save', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ plans, notes, planDates })
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
            
            // Восстанавливаем даты планов 1 и 2
            if (result.planDates) {
                const d1 = document.getElementById('plan1-date');
                const d2 = document.getElementById('plan2-date');
                if (d1 && result.planDates.plan1) d1.value = result.planDates.plan1;
                if (d2 && result.planDates.plan2) d2.value = result.planDates.plan2;
            }

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
        // После загрузки данных применяем ограничения (инпуты пересозданы)
        applyColumnRestrictions();
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

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    initializeTables();
    initTabs();
    initSortableHeaders();
    loadPlansFromServer();
});
