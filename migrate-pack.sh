#!/bin/bash
# Упаковка для переноса на сервер
# Запускать на локальной машине из папки проекта
# Результат: hrms_migrate_ДАТА.tar.gz
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT="$SCRIPT_DIR/hrms_migrate_${TIMESTAMP}.tar.gz"
SKUD_SQL="$SCRIPT_DIR/storage/skud.sql"
DB_DUMP="/tmp/hrms_noattend_${TIMESTAMP}.sql"

if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a; source "$SCRIPT_DIR/.env"; set +a
fi
DB_USER="${MYSQL_USER:-hrms}"
DB_PASS="${MYSQL_PASSWORD}"
DB_NAME="${MYSQL_DATABASE:-hrms}"

echo "================================================"
echo "  HRMS — Упаковка для переноса на сервер"
echo "  $(date '+%d.%m.%Y %H:%M:%S')"
echo "================================================"

if [ ! -f "$SKUD_SQL" ]; then
    echo "❌ Файл storage/skud.sql не найден!"
    exit 1
fi

echo ""
echo "[1/3] Дамп БД (без таблиц посещаемости)..."
docker exec hrms_db mysqldump \
    -u "$DB_USER" -p"$DB_PASS" \
    --single-transaction --quick --lock-tables=false --no-tablespaces \
    --ignore-table="${DB_NAME}.Attendance" \
    --ignore-table="${DB_NAME}.AttendanceEvent" \
    "$DB_NAME" > "$DB_DUMP" 2>/dev/null
echo "      ✅ БД: $(du -sh "$DB_DUMP" | cut -f1)"

echo ""
echo "[2/3] Упаковка (БД + skud.sql + storage/companies)..."
echo "      storage/companies: $(du -sh "$SCRIPT_DIR/storage/companies" | cut -f1)"
echo "      skud.sql: $(du -sh "$SKUD_SQL" | cut -f1)"
echo "      Идёт упаковка, подождите..."

tar -czf "$OUTPUT" \
    -C /tmp "hrms_noattend_${TIMESTAMP}.sql" \
    -C "$SCRIPT_DIR" storage/skud.sql \
    -C "$SCRIPT_DIR" storage/companies

rm -f "$DB_DUMP"

SIZE=$(du -sh "$OUTPUT" | cut -f1)

echo ""
echo "[3/3] Готово!"
echo ""
echo "================================================"
echo "  Файл: $(basename "$OUTPUT")"
echo "  Размер: $SIZE"
echo "================================================"
echo ""
echo "Следующие шаги:"
echo ""
echo "  1. Перенести файл на сервер (пример через scp):"
echo "     scp $(basename "$OUTPUT") user@server:/home/komil/projects/HR/"
echo ""
echo "  2. На сервере распаковать и запустить:"
echo "     bash migrate-server.sh $(basename "$OUTPUT")"
echo ""
