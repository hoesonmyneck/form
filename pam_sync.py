"""
pam_sync.py — запускать на компьютере PAM.

Что делает:
  1. Подключается к Oracle и читает REGION + PROC из view_es_vipoln_ipr_qlik
  2. Нормализует названия регионов под формат сайта
  3. Отправляет данные на сервер через POST /api/plans/oracle-push

Требования:
  pip install oracledb requests

Настройка:
  Отредактируй SERVER_URL и PUSH_SECRET ниже (или задай через переменные окружения).

Запуск:
  python pam_sync.py
"""

import oracledb
import requests
import os
import json
import sys
from datetime import datetime

# ─── НАСТРОЙКИ ORACLE ─────────────────────────────────────────────────────────
ORACLE_HOST    = os.environ.get('ORACLE_HOST',    '172.31.33.17')
ORACLE_PORT    = os.environ.get('ORACLE_PORT',    '1521')
ORACLE_SERVICE = os.environ.get('ORACLE_SERVICE', 'gcvp')
ORACLE_USER    = os.environ.get('ORACLE_USER',    'zhartanovav')
ORACLE_PASS    = os.environ.get('ORACLE_PASS',    'vV_zZ1141')

ORACLE_QUERY = "SELECT REGION, PROC FROM cbdiapp.view_es_vipoln_ipr_qlik"

# ─── НАСТРОЙКИ СЕРВЕРА ────────────────────────────────────────────────────────
# Адрес вашего сайта на внутреннем сервере (замените на реальный IP/имя хоста)
SERVER_URL  = os.environ.get('SERVER_URL',  'http://172.16.125.21:3000')
PUSH_SECRET = os.environ.get('PUSH_SECRET', 'oracle_push_secret_2026')

# ─── МАППИНГ РЕГИОНОВ ─────────────────────────────────────────────────────────
# Из Oracle приходит верхний регистр (АКМОЛИНСКАЯ ОБЛАСТЬ) →
# нужно привести к названиям, которые используются в таблице сайта.
REGION_MAP = {
    'Г. АСТАНА':                    'г. Астана',
    'АСТАНА':                       'г. Астана',
    'Г. АЛМАТЫ':                    'г. Алматы',
    'АЛМАТЫ':                       'г. Алматы',
    'Г. ШЫМКЕНТ':                   'г. Шымкент',
    'ШЫМКЕНТ':                      'г. Шымкент',
    'АКМОЛИНСКАЯ ОБЛАСТЬ':          'Акмолинская область',
    'АКТЮБИНСКАЯ ОБЛАСТЬ':          'Актюбинская область',
    'АЛМАТИНСКАЯ ОБЛАСТЬ':          'Алматинская область',
    'АТЫРАУСКАЯ ОБЛАСТЬ':           'Атырауская область',
    'ВОСТОЧНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ':'Восточно-Казахстанская область',
    'ЖАМБЫЛСКАЯ ОБЛАСТЬ':           'Жамбылская область',
    'ЗАПАДНО-КАЗАХСТАНСКАЯ ОБЛАСТЬ':'Западно-Казахстанская область',
    'КАРАГАНДИНСКАЯ ОБЛАСТЬ':       'Карагандинская область',
    'КОСТАНАЙСКАЯ ОБЛАСТЬ':         'Костанайская область',
    'КЫЗЫЛОРДИНСКАЯ ОБЛАСТЬ':       'Кызылординская область',
    'МАНГИСТАУСКАЯ ОБЛАСТЬ':        'Мангистауская область',
    'ПАВЛОДАРСКАЯ ОБЛАСТЬ':         'Павлодарская область',
    'СЕВЕРО-КАЗАХСТАНСКАЯ ОБЛАСТЬ': 'Северо-Казахстанская область',
    'ТУРКЕСТАНСКАЯ ОБЛАСТЬ':        'Туркестанская область',
    'ОБЛАСТЬ АБАЙ':                 'Область Абай',
    'АБАЙСКАЯ ОБЛАСТЬ':             'Область Абай',
    'ОБЛАСТЬ УЛЫТАУ':               'Область Улытау',
    'УЛЫТАУСКАЯ ОБЛАСТЬ':           'Область Улытау',
    'ОБЛАСТЬ ЖЕТЫСУ':               'Область Жетысу',
    'ЖЕТЫСУСКАЯ ОБЛАСТЬ':           'Область Жетысу',
}

def normalize_region(raw):
    key = str(raw).strip().upper()
    return REGION_MAP.get(key, None)

def normalize_proc(raw):
    """Конвертирует '53,43' → 53.43, '48' → 48.0"""
    try:
        return float(str(raw).replace(',', '.').strip())
    except Exception:
        return None

def fetch_oracle_data():
    dsn = f"{ORACLE_HOST}:{ORACLE_PORT}/{ORACLE_SERVICE}"
    print(f"[Oracle] Подключаемся к {dsn} ...")
    conn = oracledb.connect(user=ORACLE_USER, password=ORACLE_PASS, dsn=dsn)
    print("[Oracle] ✅ Подключено")
    cursor = conn.cursor()
    cursor.execute(ORACLE_QUERY)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    print(f"[Oracle] Получено строк: {len(rows)}")
    return rows

def build_payload(rows):
    """Формирует словарь { 'г. Астана': 53.43, ... }"""
    result = {}
    skipped = []
    for row in rows:
        region_raw, proc_raw = row[0], row[1]
        region = normalize_region(region_raw)
        proc   = normalize_proc(proc_raw)
        if region is None:
            skipped.append(str(region_raw))
            continue
        if proc is None:
            skipped.append(f"{region_raw} (нет числа)")
            continue
        result[region] = proc
    if skipped:
        print(f"[Маппинг] Пропущено (нет в карте): {skipped}")
    print(f"[Маппинг] Нормализовано регионов: {len(result)}")
    return result

def push_to_server(region_proc_map):
    url = f"{SERVER_URL}/api/plans/oracle-push"
    payload = {
        'secret':     PUSH_SECRET,
        'plan2Source': region_proc_map,
        'fetchedAt':  datetime.utcnow().isoformat() + 'Z',
    }
    print(f"[Сервер] Отправляем на {url} ...")
    resp = requests.post(url, json=payload, timeout=10)
    if resp.ok:
        print(f"[Сервер] ✅ Успешно: {resp.json()}")
    else:
        print(f"[Сервер] ❌ Ошибка {resp.status_code}: {resp.text}")
        sys.exit(1)

def main():
    print("=== PAM → Oracle → Сервер синхронизация ===")
    print(f"Время: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    if not SERVER_URL:
        print("❌ Не задан SERVER_URL!")
        sys.exit(1)

    try:
        rows = fetch_oracle_data()
    except Exception as e:
        print(f"[Oracle] ❌ Ошибка подключения: {e}")
        sys.exit(1)

    region_proc_map = build_payload(rows)

    if not region_proc_map:
        print("❌ Нет данных для отправки (все регионы пропущены)")
        sys.exit(1)

    push_to_server(region_proc_map)

    print()
    print("=== Готово ===")

if __name__ == '__main__':
    main()
