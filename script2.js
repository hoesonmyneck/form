// Индекс региона текущего пользователя (null = admin/planner, видит всё)
let userRegionIndex = null;
let userIsAdmin   = false;
let userIsPlanner = false; // krik: редактирует только плановый показатель

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

            // Сохраняем флаги роли и regionIndex
            if (data.user.role === 'admin') {
                userIsAdmin = true;
                document.getElementById('adminPanelBtn').style.display = 'block';
            } else if (data.user.role === 'planner') {
                userIsPlanner = true;
                document.getElementById('adminPanelBtn').style.display = 'block';
            }

            if (data.user.regionIndex !== null && data.user.regionIndex !== undefined) {
                userRegionIndex = data.user.regionIndex;
                applyRegionalFilter();
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
        
        // Для плана 8 используем text вместо number
        const inputType = (i === 8) ? 'text' : 'number';
        const inputAttrs = (i === 8) ? 'placeholder="0/0"' : 'type="number" step="0.01" min="0" placeholder="0"';
        
        // 20 строк регионов
        REGIONS.forEach((region, index) => {
            html += `<tr>
                <td style="text-align: center; font-weight: 600;">${index + 1}</td>
                <td><strong>${region}</strong></td>
                <td><input ${inputAttrs} data-plan="${i}" data-row="${index}" data-col="0" ${i !== 8 ? `oninput="calculateCoefficient(${i}, ${index})"` : ''}><button class="note-btn" onclick="showNoteModal('plan${i}', ${index}, 0)" title="Добавить примечание">📝</button></td>
                <td><input ${inputAttrs} data-plan="${i}" data-row="${index}" data-col="1" ${i !== 8 ? `oninput="calculateCoefficient(${i}, ${index})"` : ''}><button class="note-btn" onclick="showNoteModal('plan${i}', ${index}, 1)" title="Добавить примечание">📝</button></td>
                <td><input ${inputAttrs} data-plan="${i}" data-row="${index}" data-col="2" ${i !== 8 ? 'readonly style="background: #f3f4f6; cursor: not-allowed;"' : ''}><button class="note-btn" onclick="showNoteModal('plan${i}', ${index}, 2)" title="Добавить примечание">📝</button></td>
            </tr>`;
        });
        
        // Строка "Всего"
        html += `<tr style="background: #e0f2fe; font-weight: 600;">
            <td style="text-align: center;">-</td>
            <td><strong>Всего</strong></td>
            <td><input ${inputAttrs} data-plan="${i}" data-row="20" data-col="0" ${i !== 8 ? `oninput="calculateCoefficient(${i}, 20)"` : ''}><button class="note-btn" onclick="showNoteModal('plan${i}', 20, 0)">📝</button></td>
            <td><input ${inputAttrs} data-plan="${i}" data-row="20" data-col="1" ${i !== 8 ? `oninput="calculateCoefficient(${i}, 20)"` : ''}><button class="note-btn" onclick="showNoteModal('plan${i}', 20, 1)">📝</button></td>
            <td><input ${inputAttrs} data-plan="${i}" data-row="20" data-col="2" ${i !== 8 ? 'readonly style="background: #f3f4f6; cursor: not-allowed;"' : ''}><button class="note-btn" onclick="showNoteModal('plan${i}', 20, 2)">📝</button></td>
        </tr>`;
        
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
// admin    → редактирует всё
// planner  → редактирует только col 0 (плановый показатель)
// regional → редактирует только col 1 (фактический показатель) своей строки
function applyColumnRestrictions() {
    if (userIsAdmin) return; // Нет ограничений

    for (let planNum = 1; planNum <= 8; planNum++) {
        const tbody = document.getElementById(`plan${planNum}-tbody`);
        if (!tbody) continue;

        tbody.querySelectorAll('tr').forEach((row, rowIdx) => {
            const inputs = row.querySelectorAll('input');
            // inputs[0] = плановый, inputs[1] = фактический, inputs[2] = коэффициент (всегда readonly)

            if (userIsPlanner) {
                // krik: только плановый показатель (col 0) редактируем
                // Блокируем col 1 (фактический)
                if (inputs[1]) lockInput(inputs[1]);

            } else if (userRegionIndex !== null) {
                // Региональный пользователь: только фактический показатель (col 1)
                // Блокируем col 0 (плановый)
                if (inputs[0]) lockInput(inputs[0]);
            }
        });
    }
}

function lockInput(input) {
    input.disabled = true;
    input.style.background = '#f3f4f6';
    input.style.cursor = 'not-allowed';
}

// Расчет коэффициента исполнения
function calculateCoefficient(planNum, rowIdx) {
    const plannedInput = document.querySelector(`input[data-plan="${planNum}"][data-row="${rowIdx}"][data-col="0"]`);
    const actualInput = document.querySelector(`input[data-plan="${planNum}"][data-row="${rowIdx}"][data-col="1"]`);
    const coefficientInput = document.querySelector(`input[data-plan="${planNum}"][data-row="${rowIdx}"][data-col="2"]`);
    
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
    const rows = tbody.querySelectorAll('tr');
    
    data.forEach((rowData, index) => {
        if (index >= rows.length) return;
        const inputs = rows[index].querySelectorAll('input');
        // Пропускаем первые 2 элемента (номер и название)
        rowData.slice(2).forEach((value, i) => {
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
    
    try {
        const response = await fetch('/api/plans/save', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ plans, notes })
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

// Скачивание текущего плана
async function downloadCurrentPlan() {
    const token = localStorage.getItem('accessToken');
    const planId = currentPlanTab;
    
    try {
        // Собираем данные текущего плана
        const planData = collectTableData(planId);
        const planNumber = planId.replace('plan', '');
        
        const response = await fetch('/api/plans/download', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                planNumber: parseInt(planNumber),
                planData: planData
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
        let filename = `План_${planNumber}.docx`;
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
        
        console.log(`✅ Документ План ${planNumber} успешно загружен`);
        
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

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;
    
    initializeTables();
    initTabs();
    loadPlansFromServer();
});
