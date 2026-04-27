#!/bin/bash
# Импорт из архива бэкапа
# Использование: ./import.sh <файл.tar.gz>
set -e

PROJECT_DIR="/home/komil/projects/HR"

if [ -z "$1" ]; then
    echo "Использование: ./import.sh <файл_бэкапа.tar.gz>"
    echo ""
    echo "Доступные бэкапы:"
    ls -lh "$PROJECT_DIR/backups/"*.tar.gz 2>/dev/null || echo "  (бэкапов нет)"
    exit 1
fi

BACKUP_FILE="$1"

# Если передано только имя файла (без пути) — ищем в папке backups
if [ ! -f "$BACKUP_FILE" ]; then
    BACKUP_FILE="$PROJECT_DIR/backups/$1"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Файл не найден: $1"
    exit 1
fi

echo "================================================"
echo "  HRMS — Импорт из бэкапа"
echo "  Файл: $(basename $BACKUP_FILE)"
echo "  $(date '+%d.%m.%Y %H:%M:%S')"
echo "================================================"
echo ""
echo "⚠️  ВНИМАНИЕ: Текущие данные будут ЗАМЕНЕНЫ!"
echo ""
read -p "Вы уверены? Введите 'да' для продолжения: " CONFIRM

if [ "$CONFIRM" != "да" ]; then
    echo "Отменено."
    exit 0
fi

EXTRACT_DIR="/tmp/hrms_import_$$"
mkdir -p "$EXTRACT_DIR"

echo ""
echo "[1/3] Распаковка архива..."
tar -xzf "$BACKUP_FILE" -C "$EXTRACT_DIR"
echo "      ✅ Распаковано"

# Найти SQL файл
SQL_FILE=$(find "$EXTRACT_DIR" -name "*.sql" | head -1)

if [ -n "$SQL_FILE" ]; then
    echo ""
    echo "[2/3] Восстановление базы данных..."
    docker exec -i hrms_db mysql \
        -u hrms -pr523LfAW2jd84yz6ChGxDat9 \
        hrms < "$SQL_FILE"
    echo "      ✅ БД восстановлена"
else
    echo "      ⚠️  SQL файл не найден в архиве, пропускаю БД"
fi

# Восстановить storage
if [ -d "$EXTRACT_DIR/storage" ]; then
    echo ""
    echo "[3/3] Восстановление файлов (storage)..."
    rsync -a --delete "$EXTRACT_DIR/storage/" "$PROJECT_DIR/storage/"
    echo "      ✅ Файлы восстановлены"
else
    echo "      ⚠️  Папка storage не найдена в архиве, пропускаю файлы"
fi

rm -rf "$EXTRACT_DIR"

echo ""
echo "================================================"
echo "  ✅ Импорт завершён успешно!"
echo "  Перезапустите контейнеры если нужно:"
echo "  docker compose restart backend"
echo "================================================"
