#!/bin/bash
# Импорт на сервере
# Использование: bash migrate-server.sh hrms_migrate_ДАТА.tar.gz
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$1" ]; then
    echo "Использование: bash migrate-server.sh <файл.tar.gz>"
    echo ""
    echo "Доступные архивы:"
    ls -lh "$SCRIPT_DIR"/hrms_migrate_*.tar.gz 2>/dev/null || echo "  (архивов нет)"
    exit 1
fi

ARCHIVE="$1"
[ ! -f "$ARCHIVE" ] && ARCHIVE="$SCRIPT_DIR/$1"
if [ ! -f "$ARCHIVE" ]; then
    echo "❌ Файл не найден: $1"
    exit 1
fi

if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a; source "$SCRIPT_DIR/.env"; set +a
fi
DB_USER="${MYSQL_USER:-hrms}"
DB_PASS="${MYSQL_PASSWORD}"
DB_NAME="${MYSQL_DATABASE:-hrms}"

echo "================================================"
echo "  HRMS — Импорт на сервере"
echo "  Архив: $(basename "$ARCHIVE") ($(du -sh "$ARCHIVE" | cut -f1))"
echo "  $(date '+%d.%m.%Y %H:%M:%S')"
echo "================================================"
echo ""
echo "⚠️  Текущие данные БД (кроме посещаемости) будут заменены!"
echo "   Посещаемость будет импортирована из skud.sql"
echo ""
read -p "Продолжить? Введите 'да': " CONFIRM
[ "$CONFIRM" != "да" ] && echo "Отменено." && exit 0

EXTRACT_DIR="/tmp/hrms_import_$$"
mkdir -p "$EXTRACT_DIR"

echo ""
echo "[1/5] Распаковка архива..."
tar -xzf "$ARCHIVE" -C "$EXTRACT_DIR"
echo "      ✅ Готово"

# Находим SQL файл (имя может быть разным)
SQL_FILE=$(find "$EXTRACT_DIR" -name "*.sql" ! -name "skud.sql" | head -1)
if [ -z "$SQL_FILE" ]; then
    echo "❌ SQL файл не найден в архиве"
    rm -rf "$EXTRACT_DIR"
    exit 1
fi

echo ""
echo "[2/5] Импорт базы данных (без посещаемости)..."
docker exec -i hrms_db mysql \
    -u "$DB_USER" -p"$DB_PASS" \
    --default-character-set=utf8mb4 \
    "$DB_NAME" < "$SQL_FILE" 2>/dev/null
echo "      ✅ БД импортирована"

echo ""
echo "[3/5] Копирование storage/companies..."
if [ -d "$EXTRACT_DIR/storage/companies" ]; then
    mkdir -p "$SCRIPT_DIR/storage/companies"
    rsync -a --delete "$EXTRACT_DIR/storage/companies/" "$SCRIPT_DIR/storage/companies/"
    echo "      ✅ Фото и документы скопированы"
else
    echo "      ⚠️  storage/companies не найден в архиве"
fi

echo ""
echo "[4/5] Копирование skud.sql..."
if [ -f "$EXTRACT_DIR/storage/skud.sql" ]; then
    cp "$EXTRACT_DIR/storage/skud.sql" "$SCRIPT_DIR/storage/skud.sql"
    echo "      ✅ skud.sql скопирован"
fi

rm -rf "$EXTRACT_DIR"

echo ""
echo "[5/5] Импорт посещаемости из skud.sql..."
docker compose exec -T backend node prisma/import-attendance.js
echo ""
echo "================================================"
echo "  ✅ Перенос завершён!"
echo "================================================"
echo ""
echo "Статистика БД:"
docker exec hrms_db mysql -u "$DB_USER" -p"$DB_PASS" -N "$DB_NAME" \
    -e "SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_ROWS DESC;" \
    2>/dev/null | awk '{printf "  %-25s %s строк\n", $1, $2}'
