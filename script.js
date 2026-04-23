/**
 * ФОРМЫ ОТЧЕТНОСТИ МТСЗН РК
 * Скрипт для управления формами
 */

// =====================================================
// АВТОРИЗАЦИЯ
// =====================================================

// Проверка авторизации при загрузке
function checkAuth() {
    const token = localStorage.getItem('accessToken');
    
    if (!token) {
        // Если токена нет, редиректим на страницу входа
        window.location.href = '/login.html';
        return false;
    }
    
    // Проверяем токен и загружаем информацию о пользователе
    fetch('/api/user/profile', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Unauthorized');
        }
        return response.json();
    })
    .then(data => {
        if (data.success && data.user) {
            // Проверяем что пользователь admin2 НЕ может зайти в старые формы
            if (data.user.username === 'admin2' || data.user.formType === 'plans') {
                window.location.href = '/index2';
                return;
            }
            
            // Отображаем имя пользователя
            const userNameDisplay = document.getElementById('userNameDisplay');
            if (userNameDisplay) {
                userNameDisplay.textContent = data.user.fullName || data.user.username;
            }
            
            // Показываем кнопку админки если пользователь - админ
            if (data.user.role === 'admin') {
                const adminBtn = document.getElementById('adminPanelBtn');
                if (adminBtn) {
                    adminBtn.style.display = 'block';
                }
            } else {
                // Для обычных пользователей показываем кнопку личного кабинета
                const cabinetBtn = document.getElementById('userCabinetBtn');
                if (cabinetBtn) {
                    cabinetBtn.style.display = 'block';
                }
            }
            
            // Заполняем и блокируем поля организации для всех пользователей
            if (data.user.organization) {
                fillOrganizationFields(data.user.organization);
            }

            // Полностью отключаем локальные черновики старой модели
            clearLegacyDraftStorage();
        } else {
            throw new Error('User data not found');
        }
    })
    .catch(error => {
        console.error('Ошибка проверки авторизации:', error);
        // Удаляем недействительный токен
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        // Редирект на логин
        window.location.href = '/login.html';
    });
    
    return true;
}

// Заполнение полей организации
function fillOrganizationFields(organization) {
    // 1. Заполняем поля "наименование организации"
    const orgInputs = document.querySelectorAll('.org-input');
    orgInputs.forEach(input => {
        input.value = organization;
        input.readOnly = true;
        input.style.cursor = 'not-allowed';
        
        // Автоматически расширяем высоту под содержимое
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight + 4) + 'px';
    });
    
    // УБРАНО: Автозаполнение истцов и ответчиков
    // Теперь только поле организации заполняется автоматически
}

const INDEX1_FORM_NUMBERS = [1, 2, 3, 4];
const INDEX1_PERIOD_PREFS_KEY = 'index1_period_prefs_v1';
const ROW_META_KEYS = {
    isNew: 'rowNew',
    editing: 'rowEditing',
    version: 'rowVersion',
    original: 'originalCells'
};

function clearLegacyDraftStorage() {
    localStorage.removeItem('formsRetainedState');
    localStorage.removeItem('mtszn_forms_data');
    localStorage.removeItem('mtszn_forms_timestamp');
    localStorage.removeItem('mtszn_submissions');
}

function readPeriodPreferences() {
    try {
        const raw = localStorage.getItem(INDEX1_PERIOD_PREFS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writePeriodPreferences(nextPrefs) {
    localStorage.setItem(INDEX1_PERIOD_PREFS_KEY, JSON.stringify(nextPrefs || {}));
}

function saveFormPeriodPreference(formNumber, period) {
    const prefs = readPeriodPreferences();
    prefs[`form${formNumber}`] = {
        year: period.year,
        quarter: period.quarter
    };
    writePeriodPreferences(prefs);
}

function applyStoredPeriodPreferences() {
    const prefs = readPeriodPreferences();
    INDEX1_FORM_NUMBERS.forEach(formNumber => {
        const saved = prefs[`form${formNumber}`];
        if (!saved) return;
        if (!Number.isInteger(saved.year) || !Number.isInteger(saved.quarter)) return;
        setFormPeriod(formNumber, {
            year: saved.year,
            quarter: saved.quarter
        });
    });
}

// УДАЛЕНО: Функция observeNewRows больше не нужна

// Функция перехода в админку
function goToAdmin() {
    window.location.href = '/admin';
}

// Функция перехода в личный кабинет
function goToCabinet() {
    window.location.href = '/cabinet';
}

// Функция выхода
function logout() {
    const refreshToken = localStorage.getItem('refreshToken');

    // Очищаем все данные сессии из localStorage перед выходом
    function clearSessionData() {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        localStorage.removeItem('formsRetainedState');
        localStorage.removeItem('mtszn_forms_data');
        localStorage.removeItem('mtszn_forms_timestamp');
    }
    
    fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
    })
    .then(() => {
        clearSessionData();
        window.location.href = '/login.html';
    })
    .catch(error => {
        console.error('Ошибка при выходе:', error);
        clearSessionData();
        window.location.href = '/login.html';
    });
}

// =====================================================
// ИНИЦИАЛИЗАЦИЯ
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    // Сначала проверяем авторизацию
    if (!checkAuth()) {
        return; // Если не авторизован, прекращаем инициализацию
    }
    
    initTabs();
    initAddRowButtons();
    initRowActions();
    initPeriodPreferenceHandlers();
    applyStoredPeriodPreferences();
    loadFormsFromServer(); // Загружаем с сервера
    initButtons();
});

// Загрузка сохранённых данных с сервера
async function loadFormsFromServer() {
    const token = localStorage.getItem('accessToken');
    if (!token) {
        console.log('⚠️ Нет токена, пропускаем загрузку с сервера');
        return;
    }

    console.log('📥 Начинаем загрузку форм index1/v2...');

    if (window.fileHandler && window.fileHandler.clearServerFiles) {
        window.fileHandler.clearServerFiles();
    }

    for (const formNum of INDEX1_FORM_NUMBERS) {
        await loadFormPeriodFromServer(formNum);
    }

    console.log('✅ Загрузка index1/v2 завершена');
}

function getFormPeriod(formNumber) {
    const section = document.getElementById(`form${formNumber}`);
    if (!section) {
        const now = new Date();
        return { quarter: Math.floor(now.getMonth() / 3) + 1, year: now.getFullYear() };
    }

    const numericInputs = section.querySelectorAll('.form-meta input[type="number"]');
    const quarter = Number(numericInputs[0]?.value);
    const year = Number(numericInputs[1]?.value);

    const now = new Date();
    return {
        quarter: Number.isInteger(quarter) && quarter >= 1 && quarter <= 4
            ? quarter
            : Math.floor(now.getMonth() / 3) + 1,
        year: Number.isInteger(year) && year >= 2020 && year <= 2100
            ? year
            : now.getFullYear()
    };
}

function setFormPeriod(formNumber, period) {
    const section = document.getElementById(`form${formNumber}`);
    if (!section) return;
    const numericInputs = section.querySelectorAll('.form-meta input[type="number"]');
    if (numericInputs[0]) numericInputs[0].value = period.quarter;
    if (numericInputs[1]) numericInputs[1].value = period.year;
}

function initPeriodPreferenceHandlers() {
    INDEX1_FORM_NUMBERS.forEach(formNumber => {
        const section = document.getElementById(`form${formNumber}`);
        if (!section) return;
        const numericInputs = section.querySelectorAll('.form-meta input[type="number"]');
        const quarterInput = numericInputs[0];
        const yearInput = numericInputs[1];
        const handler = () => {
            const period = getFormPeriod(formNumber);
            saveFormPeriodPreference(formNumber, period);
        };
        if (quarterInput) {
            quarterInput.addEventListener('change', handler);
            quarterInput.addEventListener('input', handler);
        }
        if (yearInput) {
            yearInput.addEventListener('change', handler);
            yearInput.addEventListener('input', handler);
        }
    });
}

async function loadActiveFormPeriod() {
    const formNumber = Number(getCurrentFormNumber());
    if (!Number.isInteger(formNumber) || !INDEX1_FORM_NUMBERS.includes(formNumber)) {
        showNotification('Выберите форму 1-4', 'error');
        return;
    }
    await loadFormPeriodFromServer(formNumber, true);
}

async function loadFormPeriodFromServer(formNumber, showToast = false) {
    const token = localStorage.getItem('accessToken');
    const period = getFormPeriod(formNumber);

    try {
        const response = await fetch(
            `/api/index1/forms/${formNumber}?year=${period.year}&quarter=${period.quarter}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        const payload = await response.json();

        if (!response.ok || !payload.success) {
            throw new Error(payload.error || `HTTP ${response.status}`);
        }

        if (window.fileHandler?.clearFormFiles) {
            window.fileHandler.clearFormFiles(`form${formNumber}-`);
        }
        applyIndex1PayloadToForm(formNumber, payload);
        saveFormPeriodPreference(formNumber, period);
        if (showToast) {
            showNotification(`Загружен ${payload.quarter} квартал ${payload.year} г. (форма ${formNumber})`, 'success');
        }
    } catch (err) {
        console.error(`❌ Ошибка загрузки формы ${formNumber}:`, err);
        showNotification(`Ошибка загрузки формы ${formNumber}: ${err.message}`, 'error');
    }
}

function applyIndex1PayloadToForm(formNumber, payload) {
    const section = document.getElementById(`form${formNumber}`);
    if (!section) return;

    setFormPeriod(formNumber, { quarter: payload.quarter, year: payload.year });
    saveFormPeriodPreference(formNumber, { quarter: payload.quarter, year: payload.year });
    section.dataset.headerVersion = String(payload.headerVersion || 0);
    section.dataset.loadedPeriod = `${payload.year}-${payload.quarter}`;

    const tables = {};
    section.querySelectorAll('tbody[id]').forEach(tbody => {
        const tableRows = (payload.rowsByTable && payload.rowsByTable[tbody.id]) || [];
        tables[tbody.id] = {
            rows: tableRows.map(r => Array.isArray(r.cells) ? r.cells : []),
            rowIds: tableRows.map(r => r.id)
        };
    });

    restoreFormData(`form${formNumber}`, {
        header: payload.header || {},
        tables
    });

    section.querySelectorAll('tbody[id]').forEach(tbody => {
        const tableRows = (payload.rowsByTable && payload.rowsByTable[tbody.id]) || [];
        const trs = Array.from(tbody.querySelectorAll('tr'));

        if (tableRows.length === 0) {
            if (trs[0]) {
                setRowAsNewDraft(trs[0], tbody.id);
            }
            updateRemoveButtonState(tbody.id);
            return;
        }

        trs.forEach((tr, index) => {
            const row = tableRows[index];
            if (!row) {
                tr.remove();
                return;
            }
            tr.dataset.rowId = row.id;
            tr.dataset[ROW_META_KEYS.version] = String(row.version || 1);
            tr.dataset[ROW_META_KEYS.isNew] = '0';
            tr.dataset[ROW_META_KEYS.editing] = '0';
            tr.dataset.tableId = tbody.id;
            tr.dataset.formNumber = String(formNumber);
            setRowEditable(tr, false);
            ensureRowActionsCell(tbody.id, tr);
            refreshRowActionButtons(tr);
        });

        renumberRows(tbody.id);
        updateRemoveButtonState(tbody.id);
    });

    if (payload.attachedFiles && window.fileHandler?.restoreServerFiles) {
        const formPrefix = `form${formNumber}-`;
        const filteredFiles = {};
        Object.keys(payload.attachedFiles).forEach(key => {
            if (String(key).startsWith(formPrefix)) {
                filteredFiles[key] = payload.attachedFiles[key];
            }
        });
        window.fileHandler.restoreServerFiles(filteredFiles);
    }
}

// Восстановление данных конкретной формы
function restoreFormData(formId, formData) {
    console.log(`🔄 Восстановление формы ${formId}:`, formData);
    
    const section = document.getElementById(formId);
    if (!section) {
        console.error(`❌ Секция ${formId} не найдена`);
        return;
    }
    
    // Восстанавливаем заголовок
    const headerInputs = section.querySelectorAll('.form-header input, .form-meta input, .form-meta textarea');
    headerInputs.forEach((input, index) => {
        const value = formData.header[`input_${index}`];
        if (value) {
            input.value = value;
            console.log(`  📝 Заголовок поле ${index}: ${value}`);
        }
    });
    
    // Восстанавливаем таблицы
    section.querySelectorAll('tbody[id]').forEach(tbody => {
        const tableId = tbody.id;
        const savedTable = (formData.tables && formData.tables[tableId]) || { rows: [] };
        const savedRows = Array.isArray(savedTable.rows || savedTable) ? (savedTable.rows || savedTable) : [];
        const savedRowIds = savedTable.rowIds || [];

        // Всегда держим минимум одну строку
        const targetCount = Math.max(savedRows.length, 1);

        while (tbody.querySelectorAll('tr').length < targetCount) {
            addRow(tableId, { silent: true, focus: false, markAsNew: true });
        }
        while (tbody.querySelectorAll('tr').length > targetCount) {
            const lastRow = tbody.querySelector('tr:last-child');
            if (!lastRow) break;
            const rowId = lastRow.dataset.rowId;
            if (rowId && window.fileHandler) {
                window.fileHandler.removeRowFiles(tableId, rowId);
            }
            lastRow.remove();
        }

        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.forEach((row, rowIndex) => {
            // Сначала очищаем все поля
            row.querySelectorAll('textarea, input:not([type="file"])').forEach(input => {
                input.value = '';
            });

            const rowData = savedRows[rowIndex] || null;
            if (rowData && Array.isArray(rowData)) {
                // Восстанавливаем rowId для привязки файлов
                if (savedRowIds[rowIndex]) {
                    row.dataset.rowId = savedRowIds[rowIndex];
                }
                const fileCell = row.querySelector('.file-cell');
                if (fileCell && window.fileHandler && row.dataset.rowId) {
                    window.fileHandler.initRowFileUpload(tableId, row.dataset.rowId, fileCell);
                }

                // Заполняем ячейки, пропуская служебные колонки
                let dataIdx = 0;
                row.querySelectorAll('td').forEach(td => {
                    if (td.classList.contains('file-cell') || td.classList.contains('row-actions-cell')) return;
                    const input = td.querySelector('textarea, input:not([type="file"])');
                    if (input && rowData[dataIdx] !== undefined) {
                        input.value = rowData[dataIdx];
                    }
                    dataIdx++;
                });
            }

            ensureRowActionsCell(tableId, row);
        });

        renumberRows(tableId);
    });
    
    console.log(`✅ Форма ${formId} восстановлена`);
}

// =====================================================
// НАВИГАЦИЯ ПО ТАБАМ
// =====================================================

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Убираем активный класс со всех кнопок
            tabButtons.forEach(b => b.classList.remove('active'));
            // Добавляем активный класс текущей кнопке
            btn.classList.add('active');
            
            // Скрываем все секции форм
            document.querySelectorAll('.form-section').forEach(section => {
                section.classList.remove('active');
            });
            
            // Показываем нужную секцию
            const tabId = btn.dataset.tab;
            document.getElementById(tabId).classList.add('active');
            
        });
    });
}

// =====================================================
// ДОБАВЛЕНИЕ СТРОК В ТАБЛИЦЫ
// =====================================================

function initRowActions() {
    document.querySelectorAll('table .row-actions-header').forEach(el => el.remove());
    document.querySelectorAll('table .row-actions-num').forEach(el => el.remove());
    document.querySelectorAll('tbody[id] tr').forEach(tr => {
        ensureRowActionsCell(tr.closest('tbody').id, tr);
        setRowAsNewDraft(tr, tr.closest('tbody').id);
    });
}

function ensureActionsHeaderForTable(tableId) {
    const tbody = document.getElementById(tableId);
    const table = tbody?.closest('table');
    if (!table) return;

    const thead = table.querySelector('thead');
    if (!thead || thead.querySelector('.row-actions-header')) return;

    const firstHeaderRow = thead.querySelector('tr:first-child');
    if (firstHeaderRow) {
        const th = document.createElement('th');
        th.className = 'row-actions-header';
        th.textContent = 'Действия';
        const fileHeader = firstHeaderRow.querySelector('.file-col-header');
        if (fileHeader) firstHeaderRow.insertBefore(th, fileHeader);
        else firstHeaderRow.appendChild(th);
    }

    const colNumbersRow = thead.querySelector('tr.col-numbers');
    if (colNumbersRow && !colNumbersRow.querySelector('.row-actions-num')) {
        const td = document.createElement('td');
        td.className = 'row-actions-num';
        const visibleCols = colNumbersRow.querySelectorAll('td:not(.file-col-num)').length;
        td.textContent = String(visibleCols + 1);
        const fileNum = colNumbersRow.querySelector('.file-col-num');
        if (fileNum) colNumbersRow.insertBefore(td, fileNum);
        else colNumbersRow.appendChild(td);
    }
}

function ensureRowActionsCell(tableId, row) {
    if (!row) return;
    ensureActionsHeaderForTable(tableId);

    let actionCell = row.querySelector('.row-actions-cell');
    if (!actionCell) {
        actionCell = document.createElement('td');
        actionCell.className = 'row-actions-cell';
        const fileCell = row.querySelector('.file-cell');
        if (fileCell) row.insertBefore(actionCell, fileCell);
        else row.appendChild(actionCell);
    }

    actionCell.innerHTML = `
        <div class="row-actions">
            <button type="button" class="row-action-btn" data-action="edit">Ред.</button>
            <button type="button" class="row-action-btn" data-action="save" hidden>Сохр.</button>
            <button type="button" class="row-action-btn" data-action="cancel" hidden>Отмена</button>
            <button type="button" class="row-action-btn" data-action="delete">Удалить</button>
        </div>
    `;

    const canDeleteRows = !!document.querySelector(`.add-row-btn[data-table="${tableId}"]`);
    const deleteBtn = actionCell.querySelector('[data-action="delete"]');
    if (deleteBtn && !canDeleteRows) {
        deleteBtn.hidden = true;
    }

    actionCell.querySelector('[data-action="edit"]').addEventListener('click', () => startRowEdit(row));
    actionCell.querySelector('[data-action="save"]').addEventListener('click', () => saveRowToServer(tableId, row));
    actionCell.querySelector('[data-action="cancel"]').addEventListener('click', () => cancelRowEdit(tableId, row));
    if (deleteBtn && !deleteBtn.hidden) {
        deleteBtn.addEventListener('click', () => deleteRowFromServer(tableId, row));
    }
}

function setRowEditable(row, editable) {
    row.querySelectorAll('textarea, input:not([type="file"])').forEach(el => {
        el.disabled = !editable;
        if (editable) {
            el.removeAttribute('readonly');
            el.style.background = '';
            el.style.cursor = '';
        } else {
            el.setAttribute('readonly', 'readonly');
            el.style.background = '#f8fafc';
            el.style.cursor = 'not-allowed';
        }
    });
}

function setRowAsNewDraft(row, tableId) {
    if (!row) return;
    if (!row.dataset.rowId && window.fileHandler?.generateRowId) {
        row.dataset.rowId = window.fileHandler.generateRowId();
    }
    row.dataset[ROW_META_KEYS.version] = '0';
    row.dataset[ROW_META_KEYS.isNew] = '1';
    row.dataset[ROW_META_KEYS.editing] = '1';
    row.dataset.tableId = tableId;
    row.dataset.formNumber = String(getFormNumberByTableId(tableId));
    setRowEditable(row, true);
    ensureRowActionsCell(tableId, row);
    refreshRowActionButtons(row);
}

function refreshRowActionButtons(row) {
    const editBtn = row.querySelector('.row-action-btn[data-action="edit"]');
    const saveBtn = row.querySelector('.row-action-btn[data-action="save"]');
    const cancelBtn = row.querySelector('.row-action-btn[data-action="cancel"]');
    if (!editBtn || !saveBtn || !cancelBtn) return;

    const isEditing = row.dataset[ROW_META_KEYS.editing] === '1';
    editBtn.hidden = isEditing;
    saveBtn.hidden = !isEditing;
    cancelBtn.hidden = !isEditing;
}

function getFormNumberByTableId(tableId) {
    const match = String(tableId || '').match(/^form(\d+)-/);
    return match ? Number(match[1]) : null;
}

function getRowData(row) {
    const values = [];
    row.querySelectorAll('td').forEach(td => {
        if (td.classList.contains('file-cell') || td.classList.contains('row-actions-cell')) return;
        const input = td.querySelector('textarea, input:not([type="file"])');
        if (input) values.push(input.value);
        else values.push(td.textContent.trim());
    });
    return values;
}

function applyRowData(row, rowData) {
    if (!Array.isArray(rowData)) return;
    let idx = 0;
    row.querySelectorAll('td').forEach(td => {
        if (td.classList.contains('file-cell') || td.classList.contains('row-actions-cell')) return;
        const input = td.querySelector('textarea, input:not([type="file"])');
        if (input && rowData[idx] !== undefined) {
            input.value = rowData[idx];
        }
        idx++;
    });
}

function startRowEdit(row) {
    row.dataset[ROW_META_KEYS.original] = JSON.stringify(getRowData(row));
    row.dataset[ROW_META_KEYS.editing] = '1';
    setRowEditable(row, true);
    refreshRowActionButtons(row);
}

function cancelRowEdit(tableId, row) {
    const isNew = row.dataset[ROW_META_KEYS.isNew] === '1';
    if (isNew) {
        row.remove();
        ensureAtLeastOneRow(tableId);
        renumberRows(tableId);
        updateRemoveButtonState(tableId);
        return;
    }

    try {
        const original = JSON.parse(row.dataset[ROW_META_KEYS.original] || '[]');
        applyRowData(row, original);
    } catch (e) {
        console.warn('Не удалось восстановить исходные данные строки:', e);
    }
    row.dataset[ROW_META_KEYS.editing] = '0';
    setRowEditable(row, false);
    refreshRowActionButtons(row);
}

function ensureAtLeastOneRow(tableId) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;
    if (tbody.querySelectorAll('tr').length > 0) return;
    addRow(tableId, { silent: true, focus: false, markAsNew: true });
}

function initAddRowButtons() {
    // Кнопки добавления строк
    document.querySelectorAll('.add-row-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tableId = btn.dataset.table;
            addRow(tableId, { silent: false, focus: true, markAsNew: true });
            updateRemoveButtonState(tableId);
        });
    });
    
    // Кнопки удаления строк
    document.querySelectorAll('.remove-row-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tableId = btn.dataset.table;
            removeRow(tableId);
            updateRemoveButtonState(tableId);
        });
    });
    
    // Инициализируем состояние кнопок удаления
    document.querySelectorAll('.remove-row-btn').forEach(btn => {
        updateRemoveButtonState(btn.dataset.table);
    });
}

function addRow(tableId, options = {}) {
    const { silent = false, focus = true, markAsNew = true } = options;
    const tbody = document.getElementById(tableId);
    if (!tbody) return;

    // Клонируем первую строку чтобы сохранить структуру колонок
    const firstRow = tbody.querySelector('tr');
    if (!firstRow) return;

    const newRow = firstRow.cloneNode(true);

    // Очищаем все поля ввода
    newRow.querySelectorAll('textarea, input:not([type="file"])').forEach(el => { el.value = ''; });

    // Назначаем новый rowId
    const rowId = window.fileHandler ? window.fileHandler.generateRowId() : ('r' + Date.now());
    newRow.dataset.rowId = rowId;

    // Очищаем и переинициализируем file-cell
    const fileCell = newRow.querySelector('.file-cell');
    if (fileCell) {
        fileCell.innerHTML = '';
        if (window.fileHandler) {
            window.fileHandler.initRowFileUpload(tableId, rowId, fileCell);
        }
    }

    ensureRowActionsCell(tableId, newRow);
    if (markAsNew) {
        setRowAsNewDraft(newRow, tableId);
    } else {
        newRow.dataset[ROW_META_KEYS.isNew] = '0';
        newRow.dataset[ROW_META_KEYS.editing] = '0';
        newRow.dataset[ROW_META_KEYS.version] = newRow.dataset[ROW_META_KEYS.version] || '1';
        setRowEditable(newRow, false);
        refreshRowActionButtons(newRow);
    }

    tbody.appendChild(newRow);
    renumberRows(tableId);

    newRow.style.animation = 'fadeIn 0.3s ease';
    const firstTextarea = newRow.querySelector('textarea');
    if (focus && firstTextarea) firstTextarea.focus();

    if (!silent) showNotification('Строка добавлена', 'success');
}

function removeRow(tableId) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');

    if (rows.length <= 1) {
        showNotification('Нельзя удалить последнюю строку', 'error');
        return;
    }

    const lastRow = rows[rows.length - 1];

    // Сохранённые строки удаляем только через кнопку "Удалить" в самой строке
    if (lastRow.dataset[ROW_META_KEYS.isNew] !== '1') {
        showNotification('Сохранённые строки удаляются кнопкой "Удалить" в строке', 'info');
        return;
    }

    const rowId = lastRow.dataset.rowId;

    // Удаляем файлы строки из хранилища
    if (rowId && window.fileHandler) {
        window.fileHandler.removeRowFiles(tableId, rowId);
    }

    lastRow.style.animation = 'fadeIn 0.3s ease reverse';
    setTimeout(() => {
        lastRow.remove();
        renumberRows(tableId);
        showNotification('Строка удалена', 'success');
    }, 200);
}

function renumberRows(tableId) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr');
    rows.forEach((row, index) => {
        const firstCell = row.querySelector('td:first-child');
        if (firstCell) {
            firstCell.textContent = index + 1;
        }
    });
}

function updateRemoveButtonState(tableId) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;
    
    const rowCount = tbody.querySelectorAll('tr').length;
    const removeBtn = document.querySelector(`.remove-row-btn[data-table="${tableId}"]`);
    
    if (removeBtn) {
        removeBtn.disabled = rowCount <= 1;
    }
}

async function saveRowToServer(tableId, row, options = {}) {
    const { silent = false } = options;
    const token = localStorage.getItem('accessToken');
    const formNumber = getFormNumberByTableId(tableId);
    if (!formNumber) {
        showNotification('Не удалось определить форму для строки', 'error');
        return;
    }
    const period = getFormPeriod(formNumber);
    const cells = getRowData(row);
    const section = document.getElementById(`form${formNumber}`);

    const isNew = row.dataset[ROW_META_KEYS.isNew] === '1';
    const loadedPeriod = section?.dataset.loadedPeriod;
    const currentPeriod = `${period.year}-${period.quarter}`;
    if (!isNew && loadedPeriod && loadedPeriod !== currentPeriod) {
        if (!silent) showNotification('Сначала загрузите выбранный квартал формы', 'info');
        return;
    }
    const endpoint = isNew
        ? `/api/index1/forms/${formNumber}/rows`
        : `/api/index1/forms/${formNumber}/rows/${row.dataset.rowId}`;
    const method = isNew ? 'POST' : 'PUT';
    const payload = {
        year: period.year,
        quarter: period.quarter,
        tableId,
        cells
    };
    if (!isNew) {
        payload.expectedVersion = Number(row.dataset[ROW_META_KEYS.version] || 0);
    } else if (row.dataset.rowId) {
        payload.rowId = row.dataset.rowId;
    }

    try {
        const response = await fetch(endpoint, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (response.status === 409) {
            if (!silent) showNotification('Конфликт версии строки. Перезагрузите квартал формы.', 'error');
            return;
        }
        if (!response.ok || !result.success) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        const saved = result.row;
        row.dataset.rowId = saved.id;
        row.dataset[ROW_META_KEYS.version] = String(saved.version || 1);
        row.dataset[ROW_META_KEYS.isNew] = '0';
        row.dataset[ROW_META_KEYS.editing] = '0';
        row.dataset.formNumber = String(formNumber);
        row.dataset.tableId = tableId;
        setRowEditable(row, false);
        refreshRowActionButtons(row);

        if (section) section.dataset.loadedPeriod = `${period.year}-${period.quarter}`;

        if (!silent) showNotification('Строка сохранена', 'success');
    } catch (err) {
        console.error('Ошибка сохранения строки:', err);
        if (!silent) showNotification(`Ошибка сохранения строки: ${err.message}`, 'error');
    }
}

async function deleteRowFromServer(tableId, row) {
    const token = localStorage.getItem('accessToken');
    const formNumber = getFormNumberByTableId(tableId);
    if (!formNumber) return;

    const rowId = row.dataset.rowId;
    const isNew = row.dataset[ROW_META_KEYS.isNew] === '1';
    if (isNew || !rowId) {
        row.remove();
        ensureAtLeastOneRow(tableId);
        renumberRows(tableId);
        updateRemoveButtonState(tableId);
        showNotification('Черновая строка удалена', 'success');
        return;
    }

    const confirmed = confirm('Удалить эту строку?');
    if (!confirmed) return;

    const period = getFormPeriod(formNumber);
    try {
        const response = await fetch(`/api/index1/forms/${formNumber}/rows/${rowId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                year: period.year,
                quarter: period.quarter,
                tableId,
                expectedVersion: Number(row.dataset[ROW_META_KEYS.version] || 0)
            })
        });
        const result = await response.json();

        if (response.status === 409) {
            showNotification('Конфликт версии при удалении. Обновите период формы.', 'error');
            return;
        }
        if (!response.ok || !result.success) {
            throw new Error(result.error || `HTTP ${response.status}`);
        }

        if (row.dataset.rowId && window.fileHandler) {
            window.fileHandler.removeRowFiles(tableId, row.dataset.rowId);
        }
        row.remove();
        ensureAtLeastOneRow(tableId);
        renumberRows(tableId);
        updateRemoveButtonState(tableId);
        showNotification('Строка удалена', 'success');
    } catch (err) {
        console.error('Ошибка удаления строки:', err);
        showNotification(`Ошибка удаления строки: ${err.message}`, 'error');
    }
}

// =====================================================
// АВТОСОХРАНЕНИЕ
// =====================================================

function initAutoSave() {
    // Сохраняем каждые 30 секунд
    setInterval(saveToLocalStorage, 30000);
    
    // Сохраняем при вводе (с debounce)
    let saveTimeout;
    document.querySelectorAll('input, textarea').forEach(input => {
        input.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveToLocalStorage, 2000);
        });
    });
    
    // Сохраняем перед закрытием страницы
    window.addEventListener('beforeunload', saveToLocalStorage);
}

function saveToLocalStorage() {
    const data = collectFormData();
    localStorage.setItem('mtszn_forms_data', JSON.stringify(data));
    localStorage.setItem('mtszn_forms_timestamp', new Date().toISOString());
}

function loadSavedData() {
    const savedData = localStorage.getItem('mtszn_forms_data');
    const timestamp = localStorage.getItem('mtszn_forms_timestamp');
    
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            restoreAllFormsData(data);
            
            if (timestamp) {
                const date = new Date(timestamp);
                showNotification(`Данные восстановлены (${formatDate(date)})`, 'info');
            }
        } catch (e) {
            console.error('Ошибка восстановления данных:', e);
        }
    }
}

// =====================================================
// СБОР И ВОССТАНОВЛЕНИЕ ДАННЫХ
// =====================================================

function collectFormData() {
    const data = {
        metadata: {
            savedAt: new Date().toISOString(),
            version: '1.0'
        },
        forms: {}
    };
    
    // Собираем данные из каждой формы
    document.querySelectorAll('.form-section').forEach(section => {
        const formId = section.id;
        data.forms[formId] = {
            header: collectHeaderData(section),
            tables: collectTableData(section)
        };
    });
    
    return data;
}

function collectHeaderData(section) {
    const header = {};
    section.querySelectorAll('.form-header input, .form-meta input, .form-meta textarea').forEach((input, index) => {
        header[`input_${index}`] = input.value;
    });
    return header;
}

function collectTableData(section) {
    const tables = {};

    section.querySelectorAll('tbody').forEach(tbody => {
        const tableId = tbody.id;
        if (!tableId) return;

        const table = tbody.closest('table');
        let colCount = 0;
        if (table) {
            const colNumbersRow = table.querySelector('thead tr.col-numbers');
            if (colNumbersRow) {
                // Не считаем служебную колонку файлов
                colCount = colNumbersRow.querySelectorAll('td:not(.file-col-num)').length;
            }
        }

        const rows   = [];
        const rowIds = [];

        tbody.querySelectorAll('tr').forEach(tr => {
            const rowId = tr.dataset.rowId || '';

            const row = [];
            tr.querySelectorAll('td').forEach(td => {
                if (td.classList.contains('file-cell') || td.classList.contains('row-actions-cell')) return; // пропускаем служебные колонки
                const input = td.querySelector('textarea, input:not([type="file"])');
                if (input) {
                    row.push(input.value);
                } else {
                    row.push(td.textContent.trim());
                }
            });

            // Пропускаем строки где все редактируемые поля пусты
            const inputs = Array.from(tr.querySelectorAll('textarea, input:not([type="file"])'));
            const hasData = inputs.some(el => el.value.trim() !== '');

            if (hasData) {
                rows.push(row);
                rowIds.push(rowId);
            }
        });

        tables[tableId] = { colCount, rows, rowIds };
    });

    return tables;
}

function restoreAllFormsData(data) {
    if (!data.forms) return;
    
    Object.keys(data.forms).forEach(formId => {
        const section = document.getElementById(formId);
        if (!section) return;
        
        const formData = data.forms[formId];
        
        // Восстанавливаем заголовок
        if (formData.header) {
            const inputs = section.querySelectorAll('.form-header input, .form-meta input, .form-meta textarea');
            Object.keys(formData.header).forEach(key => {
                const index = parseInt(key.split('_')[1]);
                if (inputs[index]) {
                    inputs[index].value = formData.header[key];
                }
            });
        }
        
        // Восстанавливаем таблицы
        if (formData.tables) {
            Object.keys(formData.tables).forEach(tableId => {
                const tbody = document.getElementById(tableId);
                if (!tbody) return;
                
                const tableData = formData.tables[tableId];
                // Поддержка нового формата (с rows) и старого (просто массив)
                const rows = tableData.rows || tableData;
                
                // Проверяем что rows это массив
                if (!Array.isArray(rows)) {
                    console.warn(`⚠️ Данные таблицы ${tableId} не являются массивом:`, rows);
                    return;
                }
                
                // Добавляем недостающие строки
                while (tbody.querySelectorAll('tr').length < rows.length) {
                    addRow(tableId);
                }
                
                // Заполняем данные
                const rowIds = tableData.rowIds || [];
                const trs = tbody.querySelectorAll('tr');
                rows.forEach((rowData, rowIndex) => {
                    if (!trs[rowIndex]) return;
                    if (!Array.isArray(rowData)) return;

                    // Восстанавливаем rowId — чтобы файлы привязались к нужной строке
                    if (rowIds[rowIndex]) {
                        trs[rowIndex].dataset.rowId = rowIds[rowIndex];
                        const fileCell = trs[rowIndex].querySelector('.file-cell');
                        if (fileCell && window.fileHandler) {
                            window.fileHandler.initRowFileUpload(tableId, rowIds[rowIndex], fileCell);
                        }
                    }

                    // Заполняем ячейки, пропуская file-cell
                    let dataIdx = 0;
                    trs[rowIndex].querySelectorAll('td').forEach(td => {
                        if (td.classList.contains('file-cell') || td.classList.contains('row-actions-cell')) return;
                        const input = td.querySelector('textarea, input:not([type="file"])');
                        if (input && rowData[dataIdx] !== undefined) {
                            input.value = rowData[dataIdx];
                        }
                        dataIdx++;
                    });
                });
            });
        }
    });
}

// =====================================================
// КНОПКИ ДЕЙСТВИЙ
// =====================================================

function initButtons() {
    const saveBtn = document.getElementById('saveAndSubmitBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveAndSubmitAll);

    const loadPeriodBtn = document.getElementById('loadPeriodBtn');
    if (loadPeriodBtn) loadPeriodBtn.addEventListener('click', loadActiveFormPeriod);
}

/**
 * Получение номера текущей активной формы
 */
function getCurrentFormNumber() {
    const activeTab = document.querySelector('.tab-btn.active');
    if (!activeTab) return 'all';
    const tabId = activeTab.dataset.tab;
    return tabId.replace('form', '');
}

async function saveHeaderForForm(formNumber, options = {}) {
    const { silent = false } = options;
    const token = localStorage.getItem('accessToken');
    const section = document.getElementById(`form${formNumber}`);
    if (!section) return false;

    const period = getFormPeriod(formNumber);
    const header = collectHeaderData(section);
    const expectedVersionRaw = section.dataset.headerVersion;
    const expectedVersion = expectedVersionRaw != null && expectedVersionRaw !== ''
        ? Number(expectedVersionRaw)
        : null;

    const payload = {
        year: period.year,
        quarter: period.quarter,
        header
    };
    if (Number.isInteger(expectedVersion) && expectedVersion >= 0) {
        payload.expectedVersion = expectedVersion;
    }

    const response = await fetch(`/api/index1/forms/${formNumber}/header`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (response.status === 409) {
        if (!silent) showNotification(`Конфликт шапки формы ${formNumber}. Перезагрузите период.`, 'error');
        return false;
    }
    if (!response.ok || !result.success) {
        throw new Error(result.error || `HTTP ${response.status}`);
    }

    section.dataset.headerVersion = String(result.version || 1);
    return true;
}

/**
 * Сохранить черновик + отправить ВСЕ формы на сервер
 */
async function saveAndSubmitAll() {
    const btn = document.getElementById('saveAndSubmitBtn');
    
    try {
        btn.innerHTML = '<span class="btn-icon">⏳</span> Сохранение...';
        btn.disabled = true;

        let headerSavedCount = 0;
        for (const formNumber of INDEX1_FORM_NUMBERS) {
            const saved = await saveHeaderForForm(formNumber, { silent: true });
            if (saved) headerSavedCount++;
        }

        const pendingRows = Array.from(document.querySelectorAll('tbody[id] tr')).filter(tr => {
            return tr.dataset[ROW_META_KEYS.editing] === '1' || tr.dataset[ROW_META_KEYS.isNew] === '1';
        });

        let rowSavedCount = 0;
        for (const row of pendingRows) {
            const tbody = row.closest('tbody');
            if (!tbody) continue;
            await saveRowToServer(tbody.id, row, { silent: true });
            if (row.dataset[ROW_META_KEYS.editing] === '0' && row.dataset[ROW_META_KEYS.isNew] === '0') {
                rowSavedCount++;
            }
        }

        // Сохраняем/обновляем прикреплённые документы через legacy multipart API.
        // Это нужно, потому что file-handler работает с attachments в documents.attached_files.
        const allData = collectFormData();
        const filesSavedCount = await saveFormsAsJSON(allData, { silent: true });

        document.getElementById('successModal').classList.add('active');
        showNotification(`Сохранено: шапки ${headerSavedCount}, строки ${rowSavedCount}, формы(файлы) ${filesSavedCount}`, 'success');
        
    } catch (error) {
        showNotification('Ошибка при сохранении. Попробуйте позже.', 'error');
        console.error('Save error:', error);
    } finally {
        btn.innerHTML = '<span class="btn-icon">💾</span> Сохранить';
        btn.disabled = false;
    }
}

// Новая функция: сохранение данных форм как JSON
async function saveFormsAsJSON(data, options = {}) {
    const { silent = false } = options;
    const token = localStorage.getItem('accessToken');
    let savedCount = 0;
    
    console.log('💾 Начинаем сохранение форм:', data.forms);
    
    // Получаем все прикреплённые файлы
    const allFiles = window.fileHandler.getAllFiles();
    
    // Получаем список файлов на удаление
    const filesToDelete = window.fileHandler.getFilesToDelete();
    
    // Отправляем каждую форму отдельно
    for (const formId in data.forms) {
        const formNumber = formId.replace('form', ''); // form1 -> 1
        const formData = data.forms[formId];
        
        // Проверяем, есть ли данные в этой форме
        const hasFormData = checkIfFormHasData(formData);
        console.log(`📋 Форма ${formNumber}: hasData=${hasFormData}`, formData);
        
        if (!hasFormData) continue;
        
        try {
            console.log(`📤 Отправляем форму ${formNumber} на сервер...`);
            
            // Создаём FormData для отправки файлов
            const formDataToSend = new FormData();
            formDataToSend.append('formNumber', formNumber);
            formDataToSend.append('formData', JSON.stringify(formData));
            
            // Добавляем файлы для всех секций этой формы
            let fileCount = 0;
            for (const section in allFiles) {
                if (section.startsWith(`form${formNumber}-`)) {
                    const files = allFiles[section] || [];
                    files.forEach((file, index) => {
                        formDataToSend.append(`files_${section}`, file);
                        fileCount++;
                    });
                }
            }
            
            // Добавляем список файлов на удаление
            for (const section in filesToDelete) {
                if (section.startsWith(`form${formNumber}-`)) {
                    const deleteList = filesToDelete[section] || [];
                    if (deleteList.length > 0) {
                        formDataToSend.append(`delete_${section}`, JSON.stringify(deleteList));
                    }
                }
            }

            // Передаём уже существующие на сервере файлы (retained) — чтобы не перезагружать
            const serverFilesMap = (window.fileHandler && window.fileHandler.serverFiles) || {};
            for (const section in serverFilesMap) {
                if (section.startsWith(`form${formNumber}-`)) {
                    const files = serverFilesMap[section] || [];
                    if (files.length > 0) {
                        formDataToSend.append(`retained_${section}`, JSON.stringify(files));
                    }
                }
            }
            
            const response = await fetch('/api/forms/save', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                    // НЕ добавляем Content-Type - браузер сам установит для FormData
                },
                body: formDataToSend
            });
            
            const result = await response.json();
            console.log(`✅ Ответ сервера для формы ${formNumber}:`, result);
            
            if (response.ok) {
                savedCount++;
            }
        } catch (err) {
            console.error(`❌ Ошибка сохранения формы ${formNumber}:`, err);
        }
    }
    
    console.log(`✅ Сохранено ${savedCount} форм`);
    
    if (savedCount > 0) {
        // Очищаем только новые файлы и применяем удаления
        window.fileHandler.clearAllFiles();
        
        // Перезагружаем файлы с сервера чтобы показать актуальное состояние
        await reloadFilesFromServer();

        if (!silent) {
            document.getElementById('successModal').classList.add('active');
            showNotification(`Сохранено форм: ${savedCount}`, 'success');
        }
    }

    return savedCount;
}

// Перезагрузка файлов с сервера
async function reloadFilesFromServer() {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    
    for (let formNum = 1; formNum <= 4; formNum++) {
        try {
            const response = await fetch(`/api/forms/${formNum}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            
            if (data.success && data.found && data.attachedFiles) {
                // Восстанавливаем файлы для этой формы
                if (window.fileHandler) {
                    window.fileHandler.restoreServerFiles(data.attachedFiles);
                }
            }
        } catch (err) {
            console.error(`❌ Ошибка загрузки файлов формы ${formNum}:`, err);
        }
    }
}

// Проверка наличия данных в конкретной форме
function checkIfFormHasData(formData) {
    // Проверяем заголовок
    for (const key in formData.header) {
        if (formData.header[key] && formData.header[key].trim()) {
            return true;
        }
    }
    
    // Проверяем таблицы (поддержка старого и нового формата)
    for (const tableId in formData.tables) {
        const tableData = formData.tables[tableId];
        const rows = tableData.rows || tableData; // Новый или старый формат
        
        for (const row of rows) {
            for (const cell of row) {
                if (cell && cell.trim()) {
                    return true;
                }
            }
        }
    }
    
    return false;
}

// Делаем функцию доступной глобально
window.getCurrentFormNumber = getCurrentFormNumber;

function checkIfHasData(data) {
    for (const formId in data.forms) {
        const form = data.forms[formId];
        
        // Проверяем заголовок
        for (const key in form.header) {
            if (form.header[key] && form.header[key].trim()) {
                return true;
            }
        }
        
        // Проверяем таблицы
        for (const tableId in form.tables) {
            for (const row of form.tables[tableId]) {
                for (const cell of row) {
                    if (cell && cell.trim()) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

// Эмуляция отправки на сервер
function simulateServerRequest(data) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            // Сохраняем в localStorage как "отправленные данные" для демо
            const submissions = JSON.parse(localStorage.getItem('mtszn_submissions') || '[]');
            submissions.push({
                id: Date.now(),
                data: data,
                submittedAt: new Date().toISOString()
            });
            localStorage.setItem('mtszn_submissions', JSON.stringify(submissions));
            
            console.log('Данные для отправки на сервер:', data);
            resolve({ success: true });
        }, 1500);
    });
}

// =====================================================
// МОДАЛЬНОЕ ОКНО
// =====================================================

function closeModal() {
    document.getElementById('successModal').classList.remove('active');
}

// Закрытие по клику вне модального окна
document.addEventListener('click', (e) => {
    const modal = document.getElementById('successModal');
    if (e.target === modal) {
        closeModal();
    }
});

// Закрытие по Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
});

// =====================================================
// УВЕДОМЛЕНИЯ
// =====================================================

function showNotification(message, type = 'info') {
    // Удаляем предыдущие уведомления
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Автоматически скрываем через 3 секунды
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// =====================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================

function formatDate(date) {
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDateForFilename(date) {
    return date.toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
}

// =====================================================
// ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ БУДУЩЕГО БЭКЕНДА
// =====================================================

/**
 * Функция для отправки данных на реальный сервер
 * Замените URL на ваш эндпоинт API
 */
async function sendToServer(data) {
    const API_URL = '/api/forms/submit'; // Замените на реальный URL
    
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Функция для загрузки ранее сохраненной формы с сервера
 */
async function loadFromServer(formId) {
    const API_URL = `/api/forms/${formId}`;
    
    const response = await fetch(API_URL);
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    restoreAllFormsData(data);
}

// =====================================================
// УДАЛЕНИЕ СВОЕГО ОТВЕТА ИЗ ОБЩЕЙ БАЗЫ
// =====================================================

async function deleteMyResponse() {
    const confirmed = confirm(
        'Вы уверены, что хотите удалить свой ответ из общей базы?\n\n' +
        'Будут удалены строки и шапки из новой модели index1, а также legacy-записи.\n\n' +
        'После удаления можно заполнить и сохранить заново.'
    );
    if (!confirmed) return;

    const token = localStorage.getItem('accessToken');
    const btn = document.getElementById('deleteResponseBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Удаление...';

    try {
        const response = await fetch('/api/index1/my', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            clearLegacyDraftStorage();
            await loadFormsFromServer();
            showNotification('Ответ удалён. Можно начать заполнение заново.', 'success');
        } else {
            showNotification('Ошибка при удалении: ' + (result.error || 'неизвестная ошибка'), 'error');
        }
    } catch (err) {
        console.error('Ошибка удаления:', err);
        showNotification('Ошибка соединения с сервером', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.deleteMyResponse = deleteMyResponse;

// Делаем функцию закрытия модального окна глобальной
window.closeModal = closeModal;
