/**
 * ГЕНЕРАТОР DOCX ДОКУМЕНТОВ
 * Создаёт заполненные Word документы из данных формы
 * Использует библиотеку docx.js
 */

// Импортируем через CDN в HTML, здесь используем глобальный объект docx

/**
 * Генерация документа Формы №1 - Отчет о движении гражданских дел
 */
async function generateForm1Document(data) {
    const { Document, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, BorderStyle, WidthType, HeadingLevel } = docx;
    
    const headerData = data.forms.form1.header;
    const tables = data.forms.form1.tables;
    
    // Получаем значения из заголовка
    const day = headerData.input_0 || '__';
    const year = headerData.input_1 || '2024';
    const orderNumber = headerData.input_2 || '_______';
    const reportDate = headerData.input_3 || '________';
    const reportYear = headerData.input_4 || '__';
    const orgName = headerData.input_5 || '____________________';
    
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                // Приложение - справа
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "Приложение", size: 22 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "к приказу руководителя аппарата", size: 22 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "Министерства труда", size: 22 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "и социальной защиты населения", size: 22 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: "Республики Казахстан", size: 22 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: `от ${day} декабря ${year} года`, size: 22 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: `№ ${orderNumber}`, size: 22 })]
                }),
                
                // Пустая строка
                new Paragraph({ children: [] }),
                new Paragraph({ children: [] }),
                
                // Заголовок формы
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "Форма № 1", bold: true, size: 24 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "Отчет о движении гражданских дел", bold: true, size: 24 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: `по состоянию на ${reportDate} 20${reportYear} года по ${orgName}`, size: 22 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "(наименование организации)", size: 20, italics: true })]
                }),
                
                new Paragraph({ children: [] }),
                
                // Секция "В качестве истцов"
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "В качестве истцов", bold: true, size: 22 })]
                }),
                
                // Таблица истцов
                createReportTable(tables['form1-plaintiffs'] || []),
                
                new Paragraph({ children: [] }),
                
                // Секция "В качестве ответчиков"
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "В качестве ответчиков", bold: true, size: 22 })]
                }),
                
                createReportTable(tables['form1-defendants'] || []),
                
                new Paragraph({ children: [] }),
                
                // Секция "В качестве третьего лица"
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "В качестве третьего лица", bold: true, size: 22 })]
                }),
                
                createReportTable(tables['form1-thirdparty'] || []),
            ]
        }]
    });
    
    return doc;
}

/**
 * Генерация документа Формы №2 - Отчет о движении административных дел
 */
async function generateForm2Document(data) {
    const { Document, Paragraph, TextRun, AlignmentType } = docx;
    
    const headerData = data.forms.form2.header;
    const tables = data.forms.form2.tables;
    
    const quarter = headerData.input_0 || '4';
    const year = headerData.input_1 || '2025';
    const orgName = headerData.input_2 || '____________________';
    
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "Форма № 2", bold: true, size: 24 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "Отчет о движении административных дел", bold: true, size: 24 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: `по состоянию на ${quarter} квартал ${year} года по ${orgName}`, size: 22 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "(наименование организации)", size: 20, italics: true })]
                }),
                
                new Paragraph({ children: [] }),
                
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "В качестве истцов", bold: true, size: 22 })]
                }),
                createReportTable(tables['form2-plaintiffs'] || []),
                
                new Paragraph({ children: [] }),
                
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "В качестве ответчиков", bold: true, size: 22 })]
                }),
                createReportTable(tables['form2-defendants'] || []),
                
                new Paragraph({ children: [] }),
                
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "В качестве третьего лица", bold: true, size: 22 })]
                }),
                createReportTable(tables['form2-thirdparty'] || []),
            ]
        }]
    });
    
    return doc;
}

/**
 * Генерация документа Формы №3 - Отчет о движении запросов
 */
async function generateForm3Document(data) {
    const { Document, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, BorderStyle } = docx;
    
    const headerData = data.forms.form3.header;
    const appealData = data.forms.form3.tables['form3-appeal'] || [];
    const cassationData = data.forms.form3.tables['form3-cassation'] || [];
    
    const quarter = headerData.input_0 || '4';
    const year = headerData.input_1 || '2025';
    const orgName = headerData.input_2 || '____________________';
    
    // Названия строк для формы 3
    const rowLabels = [
        'Всего',
        'Из них:\n1) иски по вопросам социальных выплат',
        '2) иски по вопросам МСЭ',
        '3) иски по трудовым спорам',
        '4) иски по вопросам миграции',
        '5) иски, предъявленные по другим причинам'
    ];
    
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "Форма № 3", bold: true, size: 24 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ 
                        text: "Отчет о движении запросов, направленных на согласование права подачи апелляционного, кассационного обжалования судебных актов", 
                        bold: true, 
                        size: 22 
                    })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: `по состоянию на ${quarter} квартал ${year} года по ${orgName}`, size: 22 })]
                }),
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "(наименование организации)", size: 20, italics: true })]
                }),
                
                new Paragraph({ children: [] }),
                
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "Апелляционная инстанция", bold: true, size: 22 })]
                }),
                
                createForm3Table(appealData, rowLabels),
                
                new Paragraph({ children: [] }),
                
                new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "Кассационная инстанция", bold: true, size: 22 })]
                }),
                
                createForm3Table(cassationData, rowLabels),
                
                new Paragraph({ children: [] }),
                
                new Paragraph({
                    children: [new TextRun({ 
                        text: "* в графе 2,3,4,5,6,7,8 цифры записываются с помощью дробной черты. Над дробной чертой записывается количество запросов, направленных на согласование за отчетный квартал, под дробной чертой записывается количество направленных на согласование с начала года", 
                        size: 18,
                        italics: true
                    })]
                }),
            ]
        }]
    });
    
    return doc;
}

/**
 * Генерация документа Формы №4 - Отчет об актах судебных органов
 */
async function generateForm4Document(data) {
    const { Document, Paragraph, TextRun, AlignmentType } = docx;
    
    const headerData = data.forms.form4.header;
    const tables = data.forms.form4.tables;
    
    const reportDate = headerData.input_0 || '________';
    const reportYear = headerData.input_1 || '__';
    const orgName = headerData.input_2 || '____________________';
    
    const sections = [
        { title: 'Частные определения суда', tableId: 'form4-court-definitions' },
        { title: 'Денежное взыскание суда', tableId: 'form4-monetary' },
        { title: 'Акты прокурорского надзора', tableId: 'form4-prosecutor' },
        { title: 'Предписание других государственных органов', tableId: 'form4-prescriptions' },
        { title: 'Административные штрафы наложенные на госорган/организацию', tableId: 'form4-fines' }
    ];
    
    const children = [
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Форма № 4", bold: true, size: 24 })]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Отчет об актах судебных и контролирующих государственных органов", bold: true, size: 24 })]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `по состоянию на ${reportDate} 20${reportYear} года по ${orgName}`, size: 22 })]
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "(наименование организации)", size: 20, italics: true })]
        }),
        new Paragraph({ children: [] }),
    ];
    
    sections.forEach(section => {
        children.push(
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: section.title, bold: true, size: 22 })]
            }),
            createForm4Table(tables[section.tableId] || []),
            new Paragraph({ children: [] })
        );
    });
    
    const doc = new Document({
        sections: [{
            properties: {},
            children: children
        }]
    });
    
    return doc;
}

/**
 * Создание таблицы для форм 1 и 2
 */
function createReportTable(rowsData) {
    const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle } = docx;
    
    const borderStyle = {
        style: BorderStyle.SINGLE,
        size: 1,
        color: "000000"
    };
    
    const borders = {
        top: borderStyle,
        bottom: borderStyle,
        left: borderStyle,
        right: borderStyle
    };
    
    // Заголовки
    const headers = ['№', 'Истец', 'Ответчик', 'Суть спора (предмет, сумма иска и другие)', 
                     'Судебный акт первой инстанции', 'Апелляция', 'Кассация', 'Примечание'];
    
    const headerRow = new TableRow({
        children: headers.map(header => 
            new TableCell({
                borders,
                children: [new Paragraph({
                    children: [new TextRun({ text: header, bold: true, size: 18 })]
                })]
            })
        )
    });
    
    // Номера колонок
    const colNumbersRow = new TableRow({
        children: ['1', '2', '3', '4', '5', '6', '7', '8'].map(num =>
            new TableCell({
                borders,
                children: [new Paragraph({
                    children: [new TextRun({ text: num, size: 16 })]
                })]
            })
        )
    });
    
    // Данные
    const dataRows = rowsData.map((row, index) => {
        const cells = [
            new TableCell({
                borders,
                children: [new Paragraph({
                    children: [new TextRun({ text: String(index + 1), size: 20 })]
                })]
            })
        ];
        
        for (let i = 0; i < 7; i++) {
            cells.push(new TableCell({
                borders,
                children: [new Paragraph({
                    children: [new TextRun({ text: row[i] || '', size: 20 })]
                })]
            }));
        }
        
        return new TableRow({ children: cells });
    });
    
    // Если нет данных, добавляем пустые строки
    if (dataRows.length === 0) {
        for (let i = 0; i < 3; i++) {
            const cells = [
                new TableCell({
                    borders,
                    children: [new Paragraph({
                        children: [new TextRun({ text: String(i + 1), size: 20 })]
                    })]
                })
            ];
            for (let j = 0; j < 7; j++) {
                cells.push(new TableCell({
                    borders,
                    children: [new Paragraph({ children: [] })]
                }));
            }
            dataRows.push(new TableRow({ children: cells }));
        }
    }
    
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, colNumbersRow, ...dataRows]
    });
}

/**
 * Создание таблицы для формы 3
 */
function createForm3Table(rowsData, rowLabels) {
    const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle } = docx;
    
    const borderStyle = {
        style: BorderStyle.SINGLE,
        size: 1,
        color: "000000"
    };
    
    const borders = {
        top: borderStyle,
        bottom: borderStyle,
        left: borderStyle,
        right: borderStyle
    };
    
    // Заголовки
    const headerRow1 = new TableRow({
        children: [
            new TableCell({ borders, rowSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: 'Предмет спора', bold: true, size: 16 })] })] }),
            new TableCell({ borders, rowSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: 'Количество квартал/год*', bold: true, size: 16 })] })] }),
            new TableCell({ borders, columnSpan: 3, children: [new Paragraph({ children: [new TextRun({ text: 'За отчетный квартал', bold: true, size: 16 })] })] }),
            new TableCell({ borders, columnSpan: 3, children: [new Paragraph({ children: [new TextRun({ text: 'С начала года', bold: true, size: 16 })] })] }),
            new TableCell({ borders, rowSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: 'Примечание', bold: true, size: 16 })] })] }),
        ]
    });
    
    const headerRow2 = new TableRow({
        children: [
            new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: 'Согласовано*', bold: true, size: 14 })] })] }),
            new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: 'Отказано*', bold: true, size: 14 })] })] }),
            new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: 'На рассмотрении*', bold: true, size: 14 })] })] }),
            new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: 'Согласовано*', bold: true, size: 14 })] })] }),
            new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: 'Отказано*', bold: true, size: 14 })] })] }),
            new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: 'На рассмотрении*', bold: true, size: 14 })] })] }),
        ]
    });
    
    // Данные
    const dataRows = rowLabels.map((label, index) => {
        const rowData = rowsData[index] || [];
        return new TableRow({
            children: [
                new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: label, size: 18 })] })] }),
                ...Array(8).fill(null).map((_, i) => 
                    new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: rowData[i] || '/', size: 18 })] })] })
                )
            ]
        });
    });
    
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow1, headerRow2, ...dataRows]
    });
}

/**
 * Создание таблицы для формы 4
 */
function createForm4Table(rowsData) {
    const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle } = docx;
    
    const borderStyle = {
        style: BorderStyle.SINGLE,
        size: 1,
        color: "000000"
    };
    
    const borders = {
        top: borderStyle,
        bottom: borderStyle,
        left: borderStyle,
        right: borderStyle
    };
    
    const headers = ['№', 'Вид акта и наименование органа, направившего акт', 
                     'Вид нарушения, явившейся основанием для вынесения акта',
                     'Принятые меры по устранению причин и условий',
                     'Обжалование актов', 'Примечание'];
    
    const headerRow = new TableRow({
        children: headers.map(header => 
            new TableCell({
                borders,
                children: [new Paragraph({
                    children: [new TextRun({ text: header, bold: true, size: 16 })]
                })]
            })
        )
    });
    
    const colNumbersRow = new TableRow({
        children: ['1', '2', '3', '4', '5', '6'].map(num =>
            new TableCell({
                borders,
                children: [new Paragraph({
                    children: [new TextRun({ text: num, size: 16 })]
                })]
            })
        )
    });
    
    const dataRows = rowsData.length > 0 ? rowsData.map((row, index) => {
        return new TableRow({
            children: [
                new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: String(index + 1), size: 18 })] })] }),
                ...Array(5).fill(null).map((_, i) => 
                    new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: row[i] || '', size: 18 })] })] })
                )
            ]
        });
    }) : [new TableRow({
        children: [
            new TableCell({ borders, children: [new Paragraph({ children: [new TextRun({ text: '1', size: 18 })] })] }),
            ...Array(5).fill(null).map(() => 
                new TableCell({ borders, children: [new Paragraph({ children: [] })] })
            )
        ]
    })];
    
    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, colNumbersRow, ...dataRows]
    });
}

/**
 * Генерация всех форм в один документ
 */
async function generateAllFormsDocument(data) {
    const { Document, Paragraph, TextRun, PageBreak, AlignmentType } = docx;
    
    // Собираем все секции
    const sections = [];
    
    // Форма 1
    const form1Doc = await generateForm1Document(data);
    sections.push(...form1Doc.sections);
    
    // Форма 2
    const form2Doc = await generateForm2Document(data);
    sections.push(...form2Doc.sections);
    
    // Форма 3
    const form3Doc = await generateForm3Document(data);
    sections.push(...form3Doc.sections);
    
    // Форма 4
    const form4Doc = await generateForm4Document(data);
    sections.push(...form4Doc.sections);
    
    return new Document({ sections });
}

/**
 * Главная функция экспорта в DOCX
 */
async function exportToDocx(formNumber = 'all') {
    const data = collectFormData();
    let doc;
    let filename;
    
    switch(formNumber) {
        case '1':
            doc = await generateForm1Document(data);
            filename = 'Форма_1_Гражданские_дела';
            break;
        case '2':
            doc = await generateForm2Document(data);
            filename = 'Форма_2_Административные_дела';
            break;
        case '3':
            doc = await generateForm3Document(data);
            filename = 'Форма_3_Запросы_на_согласование';
            break;
        case '4':
            doc = await generateForm4Document(data);
            filename = 'Форма_4_Акты_судебных_органов';
            break;
        default:
            doc = await generateAllFormsDocument(data);
            filename = 'Все_формы_отчетности';
    }
    
    const timestamp = new Date().toISOString().slice(0, 10);
    filename = `${filename}_${timestamp}.docx`;
    
    // Генерируем blob
    const blob = await docx.Packer.toBlob(doc);
    
    return { blob, filename, data };
}

/**
 * Скачивание DOCX файла локально
 */
async function downloadDocx(formNumber = 'all') {
    try {
        showNotification('Генерация документа...', 'info');
        
        const { blob, filename } = await exportToDocx(formNumber);
        
        // Создаём ссылку для скачивания
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        
        URL.revokeObjectURL(url);
        showNotification('Документ скачан!', 'success');
        
    } catch (error) {
        console.error('Ошибка генерации DOCX:', error);
        showNotification('Ошибка при генерации документа', 'error');
    }
}

/**
 * Отправка DOCX на сервер
 */
async function submitDocxToServer(formNumber = 'all') {
    try {
        showNotification('Генерация и отправка документа...', 'info');
        
        const { blob, filename, data } = await exportToDocx(formNumber);
        
        // Создаём FormData для отправки файла
        const formData = new FormData();
        formData.append('document', blob, filename);
        formData.append('metadata', JSON.stringify({
            formNumber: formNumber,
            submittedAt: new Date().toISOString(),
            organization: data.forms.form1?.header?.input_5 || 'Не указано'
        }));
        
        // Отправляем на сервер
        const response = await fetch('/api/documents/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Показываем успех
        document.getElementById('successModal').classList.add('active');
        showNotification('Документ успешно отправлен!', 'success');
        
        // Очищаем localStorage
        localStorage.removeItem('mtszn_forms_data');
        localStorage.removeItem('mtszn_forms_timestamp');
        
        return result;
        
    } catch (error) {
        console.error('Ошибка отправки:', error);
        showNotification('Ошибка при отправке. Проверьте подключение к серверу.', 'error');
        throw error;
    }
}

/**
 * Скачивание всех 4 форм по отдельности
 */
async function downloadAllDocuments() {
    try {
        showNotification('Генерация всех документов...', 'info');
        
        const data = collectFormData();
        const timestamp = new Date().toISOString().slice(0, 10);
        
        // Генерируем все 4 формы
        const forms = [
            { num: '1', name: 'Форма_1_Гражданские_дела', generator: generateForm1Document },
            { num: '2', name: 'Форма_2_Административные_дела', generator: generateForm2Document },
            { num: '3', name: 'Форма_3_Запросы_на_согласование', generator: generateForm3Document },
            { num: '4', name: 'Форма_4_Акты_судебных_органов', generator: generateForm4Document }
        ];
        
        // Скачиваем каждый файл отдельно с небольшой задержкой
        for (let i = 0; i < forms.length; i++) {
            const form = forms[i];
            try {
                const doc = await form.generator(data);
                const blob = await docx.Packer.toBlob(doc);
                
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${form.name}_${timestamp}.docx`;
                link.click();
                
                URL.revokeObjectURL(url);
                
                // Небольшая задержка между скачиваниями чтобы браузер успевал обработать
                if (i < forms.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } catch (err) {
                console.error(`Ошибка генерации ${form.name}:`, err);
            }
        }
        
        showNotification('Все 4 документа скачаны!', 'success');
        
    } catch (error) {
        console.error('Ошибка скачивания:', error);
        showNotification('Ошибка при генерации документов', 'error');
    }
}

// Экспортируем функции глобально
window.exportToDocx = exportToDocx;
window.downloadDocx = downloadDocx;
window.downloadAllDocuments = downloadAllDocuments;
window.submitDocxToServer = submitDocxToServer;
