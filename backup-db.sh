#!/bin/bash
# Ежедневный бэкап базы данных — отправляет в Telegram
set -e

BOT_TOKEN="8474518444:AAFDPMDNKLtDJKqkkckrprKinhiO99edDcY"
CHAT_ID="5409029684"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_LABEL=$(date '+%d.%m.%Y %H:%M')
BACKUP_FILE="/tmp/hrms_db_${TIMESTAMP}.sql.gz"

echo "[$(date)] Начинаю бэкап БД..."

docker exec hrms_db mysqldump \
    -u hrms -pr523LfAW2jd84yz6ChGxDat9 \
    --single-transaction --quick --lock-tables=false --no-tablespaces \
    hrms | gzip > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Дамп готов: $SIZE"

curl -s \
    -F "chat_id=$CHAT_ID" \
    -F "document=@$BACKUP_FILE;filename=hrms_db_${TIMESTAMP}.sql.gz" \
    -F "caption=🗄 HRMS — Бэкап БД
📅 $DATE_LABEL
💾 Размер: $SIZE" \
    "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument" | \
    python3 -c "import sys,json; r=json.load(sys.stdin); print('✅ Отправлен' if r.get('ok') else '❌ Ошибка: '+str(r))"

rm -f "$BACKUP_FILE"
echo "[$(date)] Готово."
