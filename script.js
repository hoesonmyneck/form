/**
 * ФОРМЫ ОТЧЕТНОСТИ МТСЗН РК
 * Скрипт для управления формами
 */

// =====================================================
// ИНИЦИАЛИЗАЦИЯ
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initAddRowButtons();
    initAutoSave();
    loadSavedData();
    initButtons();
});

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
            
            // Прокручиваем к верху формы
            window.scrollTo({ top: 200, behavior: 'smooth' });
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
    
    const rowCount = tbody.querySelectorAll('tr').length + 1;
    const newRow = document.createElement('tr');
    
    // Определяем тип формы по ID таблицы
    if (tableId.startsWith('form4')) {
        // Форма 4 - 6 колонок
        newRow.innerHTML = `
            <td>${rowCount}</td>
            <td><textarea></textarea></td>
            <td><textarea></textarea></td>
            <td><textarea></textarea></td>
            <td><textarea></textarea></td>
            <td><textarea></textarea></td>
        `;
    } else {
        // Формы 1 и 2 - 8 колонок
        newRow.innerHTML = `
            <td>${rowCount}</td>
            <td><textarea></textarea></td>
            <td><textarea></textarea></td>
            <td><textarea></textarea></td>
            <td><textarea></textarea></td>
            <td><textarea></textarea></td>
            <td><textarea></textarea></td>
            <td><textarea></textarea></td>
        `;
    }
    
    tbody.appendChild(newRow);
    
    // Анимация появления
    newRow.style.animation = 'fadeIn 0.3s ease';
    
    // Фокус на первом textarea новой строки
    const firstTextarea = newRow.querySelector('textarea');
    if (firstTextarea) {
        firstTextarea.focus();
    }
    
    showNotification('Строка добавлена', 'success');
}

function removeRow(tableId) {
    const tbody = document.getElementById(tableId);
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr');
    
    // Нельзя удалить последнюю строку
    if (rows.length <= 1) {
        showNotification('Нельзя удалить последнюю строку', 'error');
        return;
    }
    
    // Удаляем последнюю строку
    const lastRow = rows[rows.length - 1];
    lastRow.style.animation = 'fadeIn 0.3s ease reverse';
    
    setTimeout(() => {
        lastRow.remove();
        // Обновляем нумерацию
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
            restoreFormData(data);
            
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
    section.querySelectorAll('.form-header input').forEach((input, index) => {
        header[`input_${index}`] = input.value;
    });
    return header;
}

function collectTableData(section) {
    const tables = {};
    
    section.querySelectorAll('tbody').forEach(tbody => {
        const tableId = tbody.id;
        if (!tableId) return;
        
        const rows = [];
        tbody.querySelectorAll('tr').forEach(tr => {
            const row = [];
            tr.querySelectorAll('textarea, input').forEach(field => {
                row.push(field.value);
            });
            rows.push(row);
        });
        
        tables[tableId] = rows;
    });
    
    return tables;
}

function restoreFormData(data) {
    if (!data.forms) return;
    
    Object.keys(data.forms).forEach(formId => {
        const section = document.getElementById(formId);
        if (!section) return;
        
        const formData = data.forms[formId];
        
        // Восстанавливаем заголовок
        if (formData.header) {
            const inputs = section.querySelectorAll('.form-header input');
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
                
                const rows = formData.tables[tableId];
                
                // Добавляем недостающие строки
                while (tbody.querySelectorAll('tr').length < rows.length) {
                    addRow(tableId);
                }
                
                // Заполняем данные
                const trs = tbody.querySelectorAll('tr');
                rows.forEach((rowData, rowIndex) => {
                    if (!trs[rowIndex]) return;
                    const fields = trs[rowIndex].querySelectorAll('textarea, input');
                    rowData.forEach((value, fieldIndex) => {
                        if (fields[fieldIndex]) {
                            fields[fieldIndex].value = value;
                        }
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
        
        // 2. Отправляем ВСЕ формы на сервер (не только текущую)
        await submitAllFormsToServer();
        
    } catch (error) {
        showNotification('Ошибка при сохранении. Попробуйте позже.', 'error');
        console.error('Save error:', error);
    } finally {
        btn.innerHTML = '<span class="btn-icon">💾</span> Сохранить';
        btn.disabled = false;
    }
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
    const API_URL = `/api/forms/${formId}`; // Замените на реальный URL
    
    const response = await fetch(API_URL);
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    restoreFormData(data);
}

// Делаем функцию закрытия модального окна глобальной
window.closeModal = closeModal;
