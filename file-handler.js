/**
 * ОБРАБОТЧИК ЗАГРУЗКИ ФАЙЛОВ — уровень строк
 * Каждая строка таблицы имеет свою кнопку загрузки файлов.
 * Ключ хранилища: `${tableId}__${rowId}`
 */

const sectionFiles  = {};  // новые файлы перед отправкой
const serverFiles   = {};  // файлы уже сохранённые на сервере
const filesToDelete = {};  // файлы помеченные на удаление

// ─── Генерация ID ────────────────────────────────────────────────────────────

function generateRowId() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
}

// ─── Инициализация всех строк при загрузке страницы ─────────────────────────

function initAllRowFileUploads() {
    document.querySelectorAll('tbody[id]').forEach(tbody => {
        const table = tbody.closest('table');
        if (!table) return;

        // Добавляем заголовок колонки "Документы" (один раз)
        const thead = table.querySelector('thead');
        if (thead && !thead.querySelector('.file-col-header')) {
            const firstHeaderTr = thead.querySelector('tr:first-child');
            if (firstHeaderTr) {
                const allHeaderRows = thead.querySelectorAll('tr');
                const th = document.createElement('th');
                th.className = 'file-col-header';
                th.textContent = 'Документы';
                // Если заголовок многострочный — растягиваем на все строки, кроме col-numbers
                const dataHeaderRows = Array.from(allHeaderRows).filter(r => !r.classList.contains('col-numbers'));
                if (dataHeaderRows.length > 1) {
                    th.rowSpan = dataHeaderRows.length;
                }
                firstHeaderTr.appendChild(th);
            }
            // Добавляем номер колонки в строку col-numbers
            const colNumbersRow = thead.querySelector('tr.col-numbers');
            if (colNumbersRow) {
                const td = document.createElement('td');
                td.className = 'file-col-num';
                td.textContent = colNumbersRow.querySelectorAll('td').length + 1;
                colNumbersRow.appendChild(td);
            }
        }

        // Инициализируем каждую строку tbody
        tbody.querySelectorAll('tr').forEach(tr => {
            _ensureRowFileCell(tbody.id, tr);
        });
    });
}

// Внутренняя: убеждаемся что строка имеет file-cell и rowId
function _ensureRowFileCell(tableId, tr) {
    if (!tr.dataset.rowId) {
        tr.dataset.rowId = generateRowId();
    }
    let cell = tr.querySelector('.file-cell');
    if (!cell) {
        cell = document.createElement('td');
        cell.className = 'file-cell';
        tr.appendChild(cell);
    }
    initRowFileUpload(tableId, tr.dataset.rowId, cell);
}

// ─── Инициализация загрузки для одной строки ────────────────────────────────

function initRowFileUpload(tableId, rowId, cell) {
    if (!cell) return;
    const key = tableId + '__' + rowId;

    if (!sectionFiles[key]) sectionFiles[key] = [];

    cell.innerHTML = `
        <label class="row-file-btn" title="Прикрепить файлы к этой строке">
            📎 Прикрепить
            <input type="file" style="display:none" multiple
                   accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx">
        </label>
        <div class="row-file-list"></div>
    `;

    const input = cell.querySelector('input[type="file"]');
    input.addEventListener('change', e => {
        Array.from(e.target.files).forEach(file => {
            if (file.size > 10 * 1024 * 1024) {
                showNotification(`Файл "${file.name}" слишком большой (макс 10MB)`, 'error');
                return;
            }
            sectionFiles[key].push(file);
        });
        renderRowFiles(key, cell);
        e.target.value = '';
    });

    renderRowFiles(key, cell);
}

// ─── Отрисовка файлов в ячейке строки ───────────────────────────────────────

function renderRowFiles(key, cell) {
    const listEl = cell.querySelector('.row-file-list');
    if (!listEl) return;

    const newFiles  = sectionFiles[key]  || [];
    const existing  = serverFiles[key]   || [];
    let html = '';

    existing.forEach(file => {
        if (filesToDelete[key]?.includes(file.filename)) return;
        html += `
            <div class="file-badge server-file">
                <span class="file-badge-name" title="${escapeAttr(file.originalName)}">📄 ${escapeHtml(file.originalName)}</span>
                <span class="file-badge-remove"
                      onclick="window.fileHandler.removeServerFile('${escapeAttr(key)}','${escapeAttr(file.filename)}')">×</span>
            </div>`;
    });

    newFiles.forEach((file, i) => {
        html += `
            <div class="file-badge">
                <span class="file-badge-name" title="${escapeAttr(file.name)}">📄 ${escapeHtml(file.name)}</span>
                <span class="file-badge-remove"
                      onclick="window.fileHandler.removeFile('${escapeAttr(key)}',${i})">×</span>
            </div>`;
    });

    listEl.innerHTML = html;
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}
function escapeAttr(str) {
    return String(str).replace(/'/g, "\\'");
}

// ─── Поиск ячейки по ключу ──────────────────────────────────────────────────

function findCellByKey(key) {
    const sep = key.indexOf('__');
    if (sep === -1) return null;
    const tableId = key.substring(0, sep);
    const rowId   = key.substring(sep + 2);
    const tbody = document.getElementById(tableId);
    if (!tbody) return null;
    const tr = tbody.querySelector(`tr[data-row-id="${rowId}"]`);
    return tr ? tr.querySelector('.file-cell') : null;
}

// ─── Публичные методы ────────────────────────────────────────────────────────

function removeFile(key, index) {
    if (sectionFiles[key]) {
        sectionFiles[key].splice(index, 1);
        const cell = findCellByKey(key);
        if (cell) renderRowFiles(key, cell);
    }
}

function removeServerFile(key, filename) {
    if (!filesToDelete[key]) filesToDelete[key] = [];
    filesToDelete[key].push(filename);
    const cell = findCellByKey(key);
    if (cell) renderRowFiles(key, cell);
}

// Удалить все файлы строки (при удалении строки из таблицы)
function removeRowFiles(tableId, rowId) {
    const key = tableId + '__' + rowId;
    delete sectionFiles[key];
    delete serverFiles[key];
    delete filesToDelete[key];
}

// Восстановить серверные файлы (после загрузки формы)
function restoreServerFiles(attachedFiles) {
    if (!attachedFiles) return;
    for (const key in attachedFiles) {
        serverFiles[key] = attachedFiles[key];
        const cell = findCellByKey(key);
        if (cell) renderRowFiles(key, cell);
    }
}

function clearServerFiles() {
    Object.keys(serverFiles).forEach(k => delete serverFiles[k]);
    Object.keys(filesToDelete).forEach(k => delete filesToDelete[k]);
}

// Очистить файлы только для конкретной формы (например form1-)
function clearFormFiles(formPrefix) {
    if (!formPrefix) return;

    const startsWithPrefix = key => String(key || '').startsWith(formPrefix);

    Object.keys(sectionFiles).forEach(key => {
        if (startsWithPrefix(key)) delete sectionFiles[key];
    });
    Object.keys(serverFiles).forEach(key => {
        if (startsWithPrefix(key)) delete serverFiles[key];
    });
    Object.keys(filesToDelete).forEach(key => {
        if (startsWithPrefix(key)) delete filesToDelete[key];
    });

    document.querySelectorAll('tbody[id]').forEach(tbody => {
        if (!String(tbody.id).startsWith(formPrefix)) return;
        tbody.querySelectorAll('tr[data-row-id]').forEach(tr => {
            const key = tbody.id + '__' + tr.dataset.rowId;
            const cell = tr.querySelector('.file-cell');
            if (cell) renderRowFiles(key, cell);
        });
    });
}

function getAllFiles() { return sectionFiles; }
function getFilesToDelete() { return filesToDelete; }

function clearAllFiles() {
    // Очищаем новые файлы
    Object.keys(sectionFiles).forEach(k => { sectionFiles[k] = []; });

    // Применяем удаления серверных файлов
    for (const key in filesToDelete) {
        const del = filesToDelete[key] || [];
        if (serverFiles[key]) {
            serverFiles[key] = serverFiles[key].filter(f => !del.includes(f.filename));
            if (serverFiles[key].length === 0) delete serverFiles[key];
        }
    }
    Object.keys(filesToDelete).forEach(k => delete filesToDelete[k]);

    // Перерисовываем все file-cell
    document.querySelectorAll('tbody[id]').forEach(tbody => {
        tbody.querySelectorAll('tr[data-row-id]').forEach(tr => {
            const key = tbody.id + '__' + tr.dataset.rowId;
            const cell = tr.querySelector('.file-cell');
            if (cell) renderRowFiles(key, cell);
        });
    });
}

// ─── Запуск ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initAllRowFileUploads);

window.fileHandler = {
    getAllFiles,
    getFilesToDelete,
    clearAllFiles,
    clearServerFiles,
    clearFormFiles,
    restoreServerFiles,
    initRowFileUpload,
    removeRowFiles,
    removeFile,
    removeServerFile,
    generateRowId,
    sectionFiles,
    serverFiles,
};
