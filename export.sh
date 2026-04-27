#!/bin/bash
# Ручной экспорт всего — БД + storage → архив → Telegram
# Использование: ./export.sh
set -e

BOT_TOKEN="8474518444:AAFDPMDNKLtDJKqkkckrprKinhiO99edDcY"
CHAT_ID="5409029684"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_LABEL=$(date '+%d.%m.%Y %H:%M')
PROJECT_DIR="/home/komil/projects/HR"
BACKUP_DIR="$PROJECT_DIR/backups"
DB_DUMP="/tmp/hrms_db_${TIMESTAMP}.sql"
EXPORT_FILE="$BACKUP_DIR/hrms_export_${TIMESTAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "================================================"
echo "  HRMS — Ручной экспорт"
echo "  $(date '+%d.%m.%Y %H:%M:%S')"
echo "================================================"

echo ""
echo "[1/3] Дамп базы данных..."
docker exec hrms_db mysqldump \
    -u hrms -pr523LfAW2jd84yz6ChGxDat9 \
    --single-transaction --quick --lock-tables=false --no-tablespaces \
    hrms > "$DB_DUMP"
echo "      ✅ БД экспортирована"

echo ""
echo "[2/3] Создание архива (БД + storage)..."
tar -czf "$EXPORT_FILE" \
    -C "$PROJECT_DIR" storage/ \
    -C /tmp "hrms_db_${TIMESTAMP}.sql"
rm -f "$DB_DUMP"

SIZE=$(du -sh "$EXPORT_FILE" | cut -f1)
echo "      ✅ Архив: $EXPORT_FILE ($SIZE)"

echo ""
echo "[3/3] Отправка в Telegram..."
FILE_SIZE_MB=$(du -m "$EXPORT_FILE" | cut -f1)

if [ "$FILE_SIZE_MB" -lt 50 ]; then
    RESULT=$(curl -s \
        -F "chat_id=$CHAT_ID" \
        -F "document=@$EXPORT_FILE;filename=hrms_export_${TIMESTAMP}.tar.gz" \
        -F "caption=📤 HRMS — Ручной экспорт
📅 $DATE_LABEL
💾 Размер: $SIZE
📁 Содержит: БД + все документы/фото" \
        "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument")
    echo "$RESULT" | python3 -c "import sys,json; r=json.load(sys.stdin); print('      ✅ Файл отправлен в Telegram' if r.get('ok') else '      ❌ Ошибка: '+str(r))"
else
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\":\"$CHAT_ID\",\"text\":\"📤 HRMS Экспорт готов\\n📅 $DATE_LABEL\\n💾 Размер: ${SIZE}\\n⚠️ Файл ${FILE_SIZE_MB}MB — слишком большой для Telegram\\n📁 Сохранён локально: $EXPORT_FILE\"}" > /dev/null
    echo "      ⚠️  Файл ${FILE_SIZE_MB}MB — слишком большой для Telegram (лимит 50MB)"
    echo "      📁 Сохранён локально: $EXPORT_FILE"
fi

echo ""
echo "================================================"
echo "  Экспорт завершён: $EXPORT_FILE"
echo "================================================"
