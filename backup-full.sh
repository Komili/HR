#!/bin/bash
# Еженедельный полный бэкап (БД + storage) — cron каждое воскресенье в 01:00
set -e

source "$(dirname "$0")/.env"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_LABEL=$(date '+%d.%m.%Y в %H:%M')
BACKUP_DIR="$PROJECT_DIR/backups"
DB_DUMP="/tmp/hrms_db_${TIMESTAMP}.sql"
ARCHIVE="$BACKUP_DIR/hrms_full_${TIMESTAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Начинаю полный бэкап..."

docker exec hrms_db mysqldump \
    -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" \
    --single-transaction --quick --lock-tables=false --no-tablespaces \
    "$MYSQL_DATABASE" 2>/dev/null > "$DB_DUMP"

tar -czf "$ARCHIVE" \
    -C "$PROJECT_DIR" storage/ \
    -C /tmp "hrms_db_${TIMESTAMP}.sql"
rm -f "$DB_DUMP"

SIZE=$(du -sh "$ARCHIVE" | cut -f1)
FILE_SIZE_MB=$(du -m "$ARCHIVE" | cut -f1)
echo "[$(date)] Архив готов: $SIZE"

# Вспомогательная функция для запросов к БД
q() { docker exec hrms_db mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -sN 2>/dev/null -e "$1"; }

COMPANIES=$(q "SELECT COUNT(*) FROM Company")
EMP_ACTIVE=$(q "SELECT COUNT(*) FROM Employee WHERE status NOT IN ('Уволен','Ожидает','Отклонён')")
EMP_TOTAL=$(q "SELECT COUNT(*) FROM Employee")
EVENTS_WEEK=$(q "SELECT COUNT(*) FROM AttendanceEvent WHERE timestamp >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)")
EVENTS_TOTAL=$(q "SELECT COUNT(*) FROM AttendanceEvent")
HIK_DEVICES=$(q "SELECT COUNT(*) FROM HikvisionDevice WHERE companyId IS NOT NULL")

PHOTOS_SIZE=$(du -sh "$PROJECT_DIR/storage/companies" 2>/dev/null | cut -f1 || echo "0")
DB_BACKUPS_SIZE=$(du -sh "$PROJECT_DIR/storage/backups" 2>/dev/null | cut -f1 || echo "0")
PHOTOS_COUNT=$(find "$PROJECT_DIR/storage/companies" -name "photo.jpg" 2>/dev/null | wc -l)
FULL_BACKUPS=$(ls "$BACKUP_DIR"/hrms_full_*.tar.gz 2>/dev/null | wc -l)

CAPTION="📦 HRMS — Еженедельный полный бэкап
━━━━━━━━━━━━━━━━━━━━━━
📅 $DATE_LABEL
💾 Размер архива: $SIZE
📁 Содержит: БД + все фото + документы

👥 Сотрудники:
  • Всего: $EMP_TOTAL (активных: $EMP_ACTIVE)
  • Фотографий: $PHOTOS_COUNT
🏢 Компаний: $COMPANIES
📷 Устройств СКУД: $HIK_DEVICES

📊 Посещаемость:
  • За эту неделю: $EVENTS_WEEK событий
  • Всего в БД: $EVENTS_TOTAL событий

🗂 Хранилище:
  • Фото/документы: $PHOTOS_SIZE
  • Дневные бэкапы БД: $DB_BACKUPS_SIZE
  • Полных бэкапов: $FULL_BACKUPS шт."

if [ "$FILE_SIZE_MB" -lt 50 ]; then
    curl -s \
        -F "chat_id=$BACKUP_TELEGRAM_CHAT_ID" \
        -F "document=@$ARCHIVE;filename=hrms_full_${TIMESTAMP}.tar.gz" \
        -F "caption=$CAPTION" \
        "https://api.telegram.org/bot${BACKUP_TELEGRAM_TOKEN}/sendDocument" | \
        python3 -c "import sys,json; r=json.load(sys.stdin); print('✅ Отправлен в Telegram' if r.get('ok') else '❌ Ошибка: '+str(r))"
else
    FULL_CAPTION="$CAPTION

⚠️ Файл ${FILE_SIZE_MB}MB — слишком большой для Telegram
💿 Сохранён локально: backups/hrms_full_${TIMESTAMP}.tar.gz"

    python3 -c "
import json, urllib.request
text = open('/dev/stdin').read()
data = json.dumps({'chat_id': '$BACKUP_TELEGRAM_CHAT_ID', 'text': text}).encode()
req = urllib.request.Request(
    'https://api.telegram.org/bot${BACKUP_TELEGRAM_TOKEN}/sendMessage',
    data=data, headers={'Content-Type': 'application/json'}
)
r = json.loads(urllib.request.urlopen(req).read())
print('✅ Уведомление отправлено' if r.get('ok') else '❌ Ошибка: ' + str(r))
" <<< "$FULL_CAPTION"

    echo "⚠️  Файл ${FILE_SIZE_MB}MB — сохранён локально: $ARCHIVE"
fi

echo "[$(date)] Готово."
