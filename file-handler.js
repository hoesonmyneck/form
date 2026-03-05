/**
 * ОБРАБОТЧИК ЗАГРУЗКИ ФАЙЛОВ
 * Управляет загрузкой файлов для каждой секции формы
 */

// Хранилище файлов по секциям
const sectionFiles = {};

// Хранилище уже загруженных (серверных) файлов для отображения и удаления
const serverFiles = {};

// Хранилище файлов на удаление
const filesToDelete = {};

/**
 * Инициализация обработчиков файлов
 */
function initFileHandlers() {
    // Автоматически добавляем кнопки загрузки после каждой секции с таблицей
    const tableSections = document.querySelectorAll('.table-container');
    
    tableSections.forEach(container => {
        const headers = container.querySelectorAll('.section-header');
        
        headers.forEach(header => {
            // Находим следующие элементы после заголовка
            let currentElement = header.nextElementSibling;
            let table = null;
            let rowButtons = null;
            
            // Ищем таблицу и кнопки строк
            while (currentElement && !currentElement.classList.contains('section-header')) {
                if (currentElement.tagName === 'TABLE') {
                    table = currentElement;
                }
                if (currentElement.classList.contains('row-buttons')) {
                    rowButtons = currentElement;
                    break;
                }
                currentElement = currentElement.nextElementSibling;
            }
            
            // Если нашли кнопки строк и ещё нет секции загрузки файлов
            if (rowButtons && table) {
                const tbody = table.querySelector('tbody');
                if (tbody && tbody.id && !rowButtons.nextElementSibling?.classList.contains('file-upload-section')) {
                    const section = tbody.id;
                    
                    // Создаём секцию загрузки файлов
                    const fileSection = document.createElement('div');
                    fileSection.className = 'file-upload-section';
                    fileSection.innerHTML = `
                        <label class="file-upload-label">
                            📎 Прикрепить файлы
                            <input type="file" class="file-input" data-section="${section}" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx">
                        </label>
                        <div class="uploaded-files" data-section="${section}"></div>
                    `;
                    
                    // Вставляем после кнопок
                    rowButtons.after(fileSection);
                    
                    // Инициализируем хранилище для секции
                    if (!sectionFiles[section]) {
                        sectionFiles[section] = [];
                    }
                    
                    // Добавляем обработчик
                    const input = fileSection.querySelector('.file-input');
                    input.addEventListener('change', (e) => {
                        handleFileSelect(e, section);
                    });
                }
            }
        });
    });
}

/**
 * Обработка выбора файлов
 */
function handleFileSelect(event, section) {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
        // Проверка размера (макс 10MB)
        if (file.size > 10 * 1024 * 1024) {
            showNotification(`Файл "${file.name}" слишком большой (макс 10MB)`, 'error');
            return;
        }
        
        // Добавляем файл в хранилище
        sectionFiles[section].push(file);
    });
    
    // Обновляем отображение
    renderUploadedFiles(section);
    
    // Очищаем input для возможности повторной загрузки
    event.target.value = '';
}

/**
 * Отрисовка списка загруженных файлов
 */
function renderUploadedFiles(section) {
    const container = document.querySelector(`.uploaded-files[data-section="${section}"]`);
    if (!container) return;
    
    const newFiles = sectionFiles[section] || [];
    const existingFiles = serverFiles[section] || [];
    
    let html = '';
    
    // Сначала показываем уже загруженные файлы с сервера
    existingFiles.forEach((file, index) => {
        const isMarkedForDeletion = filesToDelete[section]?.includes(file.filename);
        if (!isMarkedForDeletion) {
            html += `
                <div class="file-badge" style="background: #e0f2fe; border-color: #0ea5e9;">
                    <span class="file-badge-name" title="${file.originalName}">📄 ${file.originalName}</span>
                    <span class="file-badge-remove" onclick="removeServerFile('${section}', '${file.filename}')" title="Удалить">×</span>
                </div>
            `;
        }
    });
    
    // Потом показываем новые файлы
    newFiles.forEach((file, index) => {
        html += `
            <div class="file-badge">
                <span class="file-badge-name" title="${file.name}">📄 ${file.name}</span>
                <span class="file-badge-remove" onclick="removeFile('${section}', ${index})" title="Удалить">×</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

/**
 * Удаление нового (не загруженного) файла
 */
function removeFile(section, index) {
    if (sectionFiles[section]) {
        sectionFiles[section].splice(index, 1);
        renderUploadedFiles(section);
    }
}

/**
 * Удаление файла с сервера (помечаем на удаление)
 */
function removeServerFile(section, filename) {
    if (!filesToDelete[section]) {
        filesToDelete[section] = [];
    }
    filesToDelete[section].push(filename);
    renderUploadedFiles(section);
}

/**
 * Восстановление серверных файлов (при загрузке формы)
 */
function restoreServerFiles(attachedFiles) {
    if (!attachedFiles) return;
    
    // Загружаем/обновляем файлы из сервера (добавляем к существующим)
    for (const section in attachedFiles) {
        serverFiles[section] = attachedFiles[section];
        renderUploadedFiles(section);
    }
}

/**
 * Полная очистка серверных файлов (при начальной загрузке)
 */
function clearServerFiles() {
    Object.keys(serverFiles).forEach(key => delete serverFiles[key]);
    Object.keys(filesToDelete).forEach(key => delete filesToDelete[key]);
}

/**
 * Получение всех файлов для отправки
 */
function getAllFiles() {
    return sectionFiles;
}

/**
 * Получение списка файлов на удаление
 */
function getFilesToDelete() {
    return filesToDelete;
}

/**
 * Очистка всех файлов после успешного сохранения
 */
function clearAllFiles() {
    // Очищаем только НОВЫЕ файлы (которые не были на сервере)
    Object.keys(sectionFiles).forEach(section => {
        sectionFiles[section] = [];
    });
    
    // Применяем удаления серверных файлов (убираем их из serverFiles)
    for (const section in filesToDelete) {
        const deleteList = filesToDelete[section] || [];
        if (serverFiles[section]) {
            serverFiles[section] = serverFiles[section].filter(file => 
                !deleteList.includes(file.filename)
            );
            // Удаляем пустые секции
            if (serverFiles[section].length === 0) {
                delete serverFiles[section];
            }
        }
    }
    
    // Очищаем список на удаление
    Object.keys(filesToDelete).forEach(key => delete filesToDelete[key]);
    
    // Перерисовываем все секции
    document.querySelectorAll('.uploaded-files').forEach(container => {
        const section = container.getAttribute('data-section');
        if (section) {
            renderUploadedFiles(section);
        }
    });
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', initFileHandlers);

// Экспортируем функции для использования в других скриптах
window.fileHandler = {
    getAllFiles,
    getFilesToDelete,
    clearAllFiles,
    clearServerFiles,
    restoreServerFiles,
    sectionFiles,
    serverFiles
};
