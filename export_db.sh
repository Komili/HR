#!/bin/bash
# Быстрый экспорт БД для проверки — дамп + статистика + Telegram
set -e

# Читаем переменные из .env
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

BOT_TOKEN="${TELEGRAM_TOKEN}"
CHAT_ID="${TELEGRAM_CHAT_IDS%%,*}"   # берём первый chat_id если несколько
DB_USER="${MYSQL_USER:-hrms}"
DB_PASS="${MYSQL_PASSWORD}"
DB_NAME="${MYSQL_DATABASE:-hrms}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_LABEL=$(date '+%d.%m.%Y %H:%M')
DUMP_FILE="/tmp/hrms_check_${TIMESTAMP}.sql.gz"

# На Windows (Git Bash) curl требует Windows-путь для загрузки файлов
if command -v cygpath &>/dev/null; then
    CURL_FILE_PATH() { cygpath -w "$1"; }
else
    CURL_FILE_PATH() { echo "$1"; }
fi

echo "================================================"
echo "  HRMS — Экспорт БД (проверка)"
echo "  $(date '+%d.%m.%Y %H:%M:%S')"
echo "================================================"

# 1. Дамп
echo ""
echo "[1/3] Дамп базы данных..."
docker exec hrms_db mysqldump \
    -u "$DB_USER" -p"$DB_PASS" \
    --single-transaction --quick --lock-tables=false --no-tablespaces \
    "$DB_NAME" | gzip > "$DUMP_FILE"

SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
echo "      ✅ Готово: $DUMP_FILE ($SIZE)"

# 2. Статистика таблиц
echo ""
echo "[2/3] Количество записей по таблицам:"
docker exec hrms_db mysql -u "$DB_USER" -p"$DB_PASS" -N "$DB_NAME" \
    --default-character-set=utf8mb4 \
    -e "SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_ROWS DESC;" \
    2>/dev/null | awk '{printf "      %-25s %s строк\n", $1, $2}' || true

# 3. Telegram
echo ""
echo "[3/3] Отправка в Telegram..."

if [ -z "$BOT_TOKEN" ] || [ -z "$CHAT_ID" ]; then
    echo "      ⚠️  TELEGRAM_TOKEN или TELEGRAM_CHAT_IDS не заданы — пропускаю"
else
    STATS=$(docker exec hrms_db mysql -u "$DB_USER" -p"$DB_PASS" -N "$DB_NAME" \
        -e "SELECT CONCAT(TABLE_NAME, ': ', TABLE_ROWS) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_ROWS DESC;" \
        2>/dev/null || true)

    CAPTION="HRMS - Eksport BD (proverka)
Data: $DATE_LABEL
Razmer: $SIZE

Zapisej v tablitsah:
$STATS"

    RESULT=$(curl -s \
        -F "chat_id=$CHAT_ID" \
        -F "document=@$(CURL_FILE_PATH "$DUMP_FILE");filename=hrms_db_${TIMESTAMP}.sql.gz" \
        -F "caption=$CAPTION" \
        "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument")

    if echo "$RESULT" | python3 -c "import sys,json; r=json.load(sys.stdin); exit(0 if r.get('ok') else 1)" 2>/dev/null; then
        echo "      ✅ Файл отправлен в Telegram"
    else
        echo "      ❌ Ошибка Telegram: $RESULT"
    fi
fi

rm -f "$DUMP_FILE"

echo ""
echo "================================================"
echo "  ✅ Проверка завершена"
echo "================================================"
