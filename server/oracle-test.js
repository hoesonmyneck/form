/**
 * Диагностический скрипт: проверка сетевой доступности Oracle
 *
 * НЕ требует npm install — использует только встроенные модули Node.js
 *
 * Запуск:
 *   node oracle-test.js
 */

const net = require('net');

const ORACLE_HOST = '172.31.33.17';
const ORACLE_PORT = 1521;
const TIMEOUT_MS  = 5000;

console.log('=== Oracle network connectivity test ===');
console.log(`Проверяем ${ORACLE_HOST}:${ORACLE_PORT} ...`);
console.log('');

const socket = new net.Socket();
let resolved = false;

socket.setTimeout(TIMEOUT_MS);

socket.connect(ORACLE_PORT, ORACLE_HOST, () => {
    resolved = true;
    socket.destroy();
    console.log('✅ TCP соединение установлено!');
    console.log('');
    console.log('Oracle по сети ДОСТУПЕН с этого компьютера.');
    console.log('Следующий шаг: установить oracledb и проверить SQL-запрос.');
    console.log('');
    console.log('Для установки oracledb без интернета:');
    console.log('  1. Скачай на компе с интернетом: npm pack oracledb');
    console.log('  2. Перенеси .tgz файл на этот комп');
    console.log('  3. Установи: npm install ./oracledb-*.tgz');
    console.log('  4. Также нужен Oracle Instant Client:');
    console.log('     https://www.oracle.com/database/technologies/instant-client.html');
    console.log('');
    console.log('Или сообщи результат — подберём способ без установки oracledb.');
});

socket.on('timeout', () => {
    if (resolved) return;
    resolved = true;
    socket.destroy();
    console.log('❌ Таймаут — нет ответа за ' + (TIMEOUT_MS / 1000) + ' секунд.');
    console.log('');
    console.log('Вероятно:');
    console.log('  - Этот компьютер не видит Oracle по сети (172.31.33.17:1521)');
    console.log('  - Нужен другой путь: экспорт данных через PAM или другой сервис');
});

socket.on('error', (err) => {
    if (resolved) return;
    resolved = true;
    socket.destroy();
    console.log('❌ Ошибка соединения: ' + err.message);
    console.log('');
    if (err.code === 'ECONNREFUSED') {
        console.log('Порт 1521 закрыт или Oracle не слушает на этом адресе.');
    } else if (err.code === 'ECONNRESET') {
        console.log('Соединение сброшено — возможно, firewall.');
    } else {
        console.log('Хост недоступен или маршрут не настроен.');
    }
    console.log('');
    console.log('Нужен промежуточный способ получения данных.');
});
