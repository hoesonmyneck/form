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
    initAutoSave();
    loadSavedData(); // Загружаем из localStorage
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
    
    console.log('📥 Начинаем загрузку форм с сервера...');
    
    // Очищаем серверные файлы перед загрузкой
    if (window.fileHandler && window.fileHandler.clearServerFiles) {
        window.fileHandler.clearServerFiles();
    }
    
    // Загружаем каждую форму
    for (let formNum = 1; formNum <= 4; formNum++) {
        try {
            const response = await fetch(`/api/forms/${formNum}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const data = await response.json();
            console.log(`📋 Форма ${formNum}:`, data);
            
            if (data.success && data.found && data.formData) {
                console.log(`✅ Восстанавливаем форму ${formNum}`);
                restoreFormData(`form${formNum}`, data.formData);
                if (data.attachedFiles && window.fileHandler) {
                    window.fileHandler.restoreServerFiles(data.attachedFiles);
                }
                // Раз данные есть в БД — retained state больше не нужен
                localStorage.removeItem('formsRetainedState');
            } else {
                console.log(`ℹ️ Форма ${formNum} не найдена на сервере`);
            }
        } catch (err) {
            console.error(`❌ Ошибка загрузки формы ${formNum}:`, err);
        }
    }
    
    console.log('✅ Загрузка форм завершена');

    // Если пользователь удалил ответ и перешёл на другую страницу —
    // восстанавливаем форму и файлы из localStorage
    const retainedRaw = localStorage.getItem('formsRetainedState');
    if (retainedRaw) {
        try {
            const retained = JSON.parse(retainedRaw);
            if (retained.formData) {
                restoreAllFormsData(retained.formData);
            }
            if (retained.serverFiles && window.fileHandler) {
                window.fileHandler.restoreServerFiles(retained.serverFiles);
            }
            console.log('📦 Восстановлено из localStorage (retained state)');
        } catch (e) {
            console.warn('Ошибка восстановления из localStorage:', e);
        }
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
    for (const tableId in formData.tables) {
        const tbody = document.getElementById(tableId);
        if (!tbody) {
            console.warn(`⚠️ Таблица ${tableId} не найдена`);
            continue;
        }
        
        const savedTable = formData.tables[tableId];
        // Поддержка старого формата (массив) и нового (объект с rows)
        const savedRows = savedTable.rows || savedTable;
        
        console.log(`  📊 Таблица ${tableId}: ${savedRows.length} строк`);
        
        // Добавляем недостающие строки
        while (tbody.querySelectorAll('tr').length < savedRows.length) {
            addRow(tableId);
        }
        
        // Заполняем данные
        const savedRowIds = savedTable.rowIds || [];
        const rows = tbody.querySelectorAll('tr');
        savedRows.forEach((rowData, rowIndex) => {
            if (!rows[rowIndex]) return;

            // Восстанавливаем rowId для привязки файлов
            if (savedRowIds[rowIndex]) {
                rows[rowIndex].dataset.rowId = savedRowIds[rowIndex];
                const fileCell = rows[rowIndex].querySelector('.file-cell');
                if (fileCell && window.fileHandler) {
                    window.fileHandler.initRowFileUpload(tableId, savedRowIds[rowIndex], fileCell);
                }
            }

            // Заполняем ячейки, пропуская file-cell
            let dataIdx = 0;
            rows[rowIndex].querySelectorAll('td').forEach(td => {
                if (td.classList.contains('file-cell')) return;
                const input = td.querySelector('textarea, input:not([type="file"])');
                if (input && rowData[dataIdx] !== undefined) {
                    input.value = rowData[dataIdx];
                }
                dataIdx++;
            });
        });
    }
    
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

function initAddRowButtons() {
    // Кнопки добавления строк
    document.querySelectorAll('.add-row-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tableId = btn.dataset.table;
            addRow(tableId);
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

function addRow(tableId) {
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

    tbody.appendChild(newRow);
    renumberRows(tableId);

    newRow.style.animation = 'fadeIn 0.3s ease';
    const firstTextarea = newRow.querySelector('textarea');
    if (firstTextarea) firstTextarea.focus();

    showNotification('Строка добавлена', 'success');
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
                if (td.classList.contains('file-cell')) return; // пропускаем колонку файлов
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
                        if (td.classList.contains('file-cell')) return;
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
    // Сохранить (черновик + отправка на сервер)
    document.getElementById('saveAndSubmitBtn').addEventListener('click', saveAndSubmitAll);
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

/**
 * Сохранить черновик + отправить ВСЕ формы на сервер
 */
async function saveAndSubmitAll() {
    const data = collectFormData();
    
    // Валидация - проверяем, заполнено ли хоть что-то
    const hasData = checkIfHasData(data);
    
    if (!hasData) {
        showNotification('Пожалуйста, заполните хотя бы одну форму', 'error');
        return;
    }
    
    const btn = document.getElementById('saveAndSubmitBtn');
    
    try {
        // Показываем индикатор загрузки
        btn.innerHTML = '<span class="btn-icon">⏳</span> Сохранение...';
        btn.disabled = true;
        
        // 1. Сохраняем черновик локально
        saveToLocalStorage();
        
        // 2. Сохраняем данные форм на сервер как JSON
        await saveFormsAsJSON(data);
        
    } catch (error) {
        showNotification('Ошибка при сохранении. Попробуйте позже.', 'error');
        console.error('Save error:', error);
    } finally {
        btn.innerHTML = '<span class="btn-icon">💾</span> Сохранить';
        btn.disabled = false;
    }
}

// Новая функция: сохранение данных форм как JSON
async function saveFormsAsJSON(data) {
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
        
        // Данные успешно сохранены — retained state больше не нужен
        localStorage.removeItem('formsRetainedState');
        
        // Перезагружаем файлы с сервера чтобы показать актуальное состояние
        await reloadFilesFromServer();
        
        // Показываем успех
        document.getElementById('successModal').classList.add('active');
        showNotification(`Сохранено форм: ${savedCount}`, 'success');
    }
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
        'Данные в форме останутся заполненными, но больше не будут видны администратору.\n\n' +
        'Чтобы снова отправить — нажмите «Сохранить».'
    );
    if (!confirmed) return;

    const token = localStorage.getItem('accessToken');
    const btn = document.getElementById('deleteResponseBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Удаление...';

    try {
        const response = await fetch('/api/forms/my', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // Сохраняем снимок форм + метаданные файлов в localStorage
            // чтобы восстановить после перезагрузки страницы
            try {
                const formSnapshot = collectFormData();
                const fileSnapshot = (window.fileHandler && window.fileHandler.serverFiles)
                    ? JSON.parse(JSON.stringify(window.fileHandler.serverFiles))
                    : {};
                localStorage.setItem('formsRetainedState', JSON.stringify({
                    formData: formSnapshot,
                    serverFiles: fileSnapshot
                }));
            } catch (e) {
                console.warn('Не удалось сохранить состояние форм:', e);
            }

            showNotification('Ответ удалён из общей базы. Форма и файлы сохранены локально.', 'success');
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
