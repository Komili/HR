#!/bin/bash
# Еженедельный полный бэкап (БД + storage) — cron каждое воскресенье в 01:00
set -e

BOT_TOKEN="8474518444:AAFDPMDNKLtDJKqkkckrprKinhiO99edDcY"
CHAT_ID="5409029684"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_LABEL=$(date '+%d.%m.%Y %H:%M')
PROJECT_DIR="/home/komil/projects/HR"
BACKUP_DIR="$PROJECT_DIR/backups"
DB_DUMP="/tmp/hrms_db_${TIMESTAMP}.sql"
ARCHIVE="$BACKUP_DIR/hrms_full_${TIMESTAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Начинаю полный бэкап..."

docker exec hrms_db mysqldump \
    -u hrms -pr523LfAW2jd84yz6ChGxDat9 \
    --single-transaction --quick --lock-tables=false --no-tablespaces \
    hrms > "$DB_DUMP"

tar -czf "$ARCHIVE" \
    -C "$PROJECT_DIR" storage/ \
    -C /tmp "hrms_db_${TIMESTAMP}.sql"
rm -f "$DB_DUMP"

SIZE=$(du -sh "$ARCHIVE" | cut -f1)
FILE_SIZE_MB=$(du -m "$ARCHIVE" | cut -f1)
echo "[$(date)] Архив готов: $SIZE"

if [ "$FILE_SIZE_MB" -lt 50 ]; then
    curl -s \
        -F "chat_id=$CHAT_ID" \
        -F "document=@$ARCHIVE;filename=hrms_full_${TIMESTAMP}.tar.gz" \
        -F "caption=📦 HRMS — Полный бэкап
📅 $DATE_LABEL
💾 Размер: $SIZE
📁 БД + все фото/документы" \
        "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument" | \
        python3 -c "import sys,json; r=json.load(sys.stdin); print('✅ Отправлен' if r.get('ok') else '❌ Ошибка: '+str(r))"
else
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\":\"$CHAT_ID\",\"text\":\"📦 HRMS — Полный бэкап готов\\n📅 $DATE_LABEL\\n💾 Размер: ${SIZE}\\n⚠️ Файл ${FILE_SIZE_MB}MB — слишком большой для Telegram\\n📁 Сохранён: backups/hrms_full_${TIMESTAMP}.tar.gz\"}" > /dev/null
    echo "⚠️  Файл ${FILE_SIZE_MB}MB — сохранён локально: $ARCHIVE"
fi

echo "[$(date)] Готово."
