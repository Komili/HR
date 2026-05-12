#!/bin/bash
# Ежедневный бэкап базы данных — сохраняет в storage/backups и отправляет в Telegram
set -e

source "$(dirname "$0")/.env"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_LABEL=$(date '+%d.%m.%Y в %H:%M')
BACKUP_DIR="$PROJECT_DIR/storage/backups"
BACKUP_FILE="$BACKUP_DIR/hrms_db_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Начинаю бэкап БД..."

docker exec hrms_db mysqldump \
    -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" \
    --single-transaction --quick --lock-tables=false --no-tablespaces \
    "$MYSQL_DATABASE" 2>/dev/null | gzip > "$BACKUP_FILE"

SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Дамп готов: $SIZE"

# Вспомогательная функция для запросов к БД
q() { docker exec hrms_db mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -sN 2>/dev/null -e "$1"; }

COMPANIES=$(q "SELECT COUNT(*) FROM Company")
EMP_ACTIVE=$(q "SELECT COUNT(*) FROM Employee WHERE status NOT IN ('Уволен','Ожидает','Отклонён')")
EMP_TOTAL=$(q "SELECT COUNT(*) FROM Employee")
EMP_FIRED=$(q "SELECT COUNT(*) FROM Employee WHERE status = 'Уволен'")
EVENTS_TODAY=$(q "SELECT COUNT(*) FROM AttendanceEvent WHERE DATE(timestamp) = CURDATE()")
EVENTS_TOTAL=$(q "SELECT COUNT(*) FROM AttendanceEvent")
ATT_TOTAL=$(q "SELECT COUNT(*) FROM Attendance")
BACKUPS_COUNT=$(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)

CAPTION="🗄 HRMS — Ежедневный бэкап БД
━━━━━━━━━━━━━━━━━━━━━━
📅 $DATE_LABEL
💾 Размер дампа: $SIZE
📂 Бэкапов в хранилище: $BACKUPS_COUNT

👥 Сотрудники:
  • Всего: $EMP_TOTAL
  • Активных: $EMP_ACTIVE
  • Уволенных: $EMP_FIRED
🏢 Компаний: $COMPANIES

📊 Посещаемость:
  • Событий сегодня: $EVENTS_TODAY
  • Событий всего: $EVENTS_TOTAL
  • Дневных записей: $ATT_TOTAL

✅ Бэкап успешно создан"

curl -s \
    -F "chat_id=$TELEGRAM_CHAT_IDS" \
    -F "document=@$BACKUP_FILE;filename=hrms_db_${TIMESTAMP}.sql.gz" \
    -F "caption=$CAPTION" \
    "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument" | \
    python3 -c "import sys,json; r=json.load(sys.stdin); print('✅ Отправлен в Telegram' if r.get('ok') else '❌ Ошибка: '+str(r))"

echo "[$(date)] Готово. Файл сохранён: $BACKUP_FILE"
