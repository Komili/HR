/**
 * Импорт ТОЛЬКО посещаемости из skud.sql в HR-систему.
 * Не трогает сотрудников, компании, отделы и пользователей.
 *
 * Использование:
 *   docker compose exec backend node prisma/import-attendance-only.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// ============ SQL ПАРСЕР ============

function parseSqlInsert(sql, tableName) {
  const insertRegex = new RegExp(
    `INSERT IGNORE INTO \`${tableName}\`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?);`,
    'g'
  );

  const results = [];
  let match;

  while ((match = insertRegex.exec(sql)) !== null) {
    const columns = match[1].split(',').map(c => c.trim().replace(/`/g, ''));
    const rows = parseValueRows(match[2]);

    for (const row of rows) {
      const obj = {};
      for (let i = 0; i < columns.length; i++) {
        obj[columns[i]] = row[i] !== undefined ? row[i] : null;
      }
      results.push(obj);
    }
  }

  return results;
}

function parseValueRows(valuesStr) {
  const rows = [];
  let i = 0;
  const len = valuesStr.length;

  while (i < len) {
    while (i < len && valuesStr[i] !== '(') i++;
    if (i >= len) break;
    i++;

    const values = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let depth = 1;

    while (i < len && depth > 0) {
      const ch = valuesStr[i];

      if (inString) {
        if (ch === '\\' && i + 1 < len) {
          current += ch + valuesStr[i + 1];
          i += 2;
          continue;
        }
        if (ch === stringChar) {
          if (i + 1 < len && valuesStr[i + 1] === stringChar) {
            current += ch + ch;
            i += 2;
            continue;
          }
          inString = false;
          current += ch;
          i++;
          continue;
        }
        current += ch;
        i++;
        continue;
      }

      if (ch === "'" || ch === '"' || ch === '`') {
        inString = true;
        stringChar = ch;
        current += ch;
        i++;
        continue;
      }

      if (ch === '(') { depth++; current += ch; i++; continue; }

      if (ch === ')') {
        depth--;
        if (depth === 0) {
          values.push(parseValue(current.trim()));
          i++;
          break;
        }
        current += ch;
        i++;
        continue;
      }

      if (ch === ',' && depth === 1) {
        values.push(parseValue(current.trim()));
        current = '';
        i++;
        continue;
      }

      current += ch;
      i++;
    }

    if (values.length > 0) rows.push(values);
  }

  return rows;
}

function parseValue(val) {
  if (val === 'NULL' || val === 'null') return null;
  if (val === 'TRUE' || val === 'true') return true;
  if (val === 'FALSE' || val === 'false') return false;
  if ((val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"'))) {
    return val.slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/''/g, "'");
  }
  const num = Number(val);
  if (!isNaN(num) && val !== '') return num;
  return val;
}

// ============ ОСНОВНОЙ СКРИПТ ============

async function main() {
  console.log('🚀 Импорт посещаемости из skud.sql\n');

  // --- ШАГ 1: Чтение skud.sql ---
  console.log('📄 Шаг 1: Чтение skud.sql...');
  const possiblePaths = [
    '/home/komil/skud.sql',                        // хост: основной путь
    '/app/skud.sql/skud.sql',                      // Docker: ./skud.sql смонтирована как директория
    '/app/skud.sql',                               // Docker: если смонтирован как файл
    path.join(__dirname, '../../skud.sql'),        // backend/prisma/../../skud.sql
    path.join(__dirname, '../skud.sql'),
    path.join(process.cwd(), 'skud.sql'),
    '/app/storage/skud.sql',
  ];
  const sqlPath = possiblePaths.find(p => fs.existsSync(p));
  if (!sqlPath) {
    console.error('❌ Файл skud.sql не найден! Проверенные пути:\n' + possiblePaths.join('\n'));
    process.exit(1);
  }
  console.log(`   Найден: ${sqlPath}`);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`   Файл прочитан: ${(sql.length / 1024).toFixed(0)} KB`);

  const skudLogs = parseSqlInsert(sql, 'attendance_logs');
  const skudCorrections = parseSqlInsert(sql, 'attendance_corrections');
  console.log(`   Записи посещаемости: ${skudLogs.length}`);
  console.log(`   Корректировки: ${skudCorrections.length}`);

  // --- ШАГ 2: Загрузка HR-сотрудников по skudId ---
  console.log('\n👤 Шаг 2: Загрузка сотрудников по skudId...');
  const hrEmployees = await prisma.employee.findMany({
    where: { skudId: { not: null } },
    select: { id: true, companyId: true, skudId: true },
  });

  const employeeMap = {}; // skudId (строка) → { id, companyId }
  for (const emp of hrEmployees) {
    if (emp.skudId) employeeMap[emp.skudId] = { id: emp.id, companyId: emp.companyId };
  }
  console.log(`   Найдено HR-сотрудников с skudId: ${Object.keys(employeeMap).length}`);

  const matchable = skudLogs.filter(log => employeeMap[String(log.employeeId)]).length;
  console.log(`   Записей с совпадением: ${matchable} из ${skudLogs.length}`);

  // --- ШАГ 3: Очистка таблиц посещаемости ---
  console.log('\n🧹 Шаг 3: Очистка таблиц посещаемости...');
  await prisma.attendance.deleteMany();
  await prisma.attendanceEvent.deleteMany();
  console.log('   ✅ Таблицы AttendanceEvent и Attendance очищены');

  // --- ШАГ 4: Импорт событий посещаемости ---
  console.log('\n📊 Шаг 4: Импорт событий посещаемости...');
  let eventCount = 0;
  let eventSkipped = 0;
  const BATCH_SIZE = 500;
  let eventBatch = [];

  for (const log of skudLogs) {
    const hrEmployee = employeeMap[String(log.employeeId)];
    if (!hrEmployee) { eventSkipped++; continue; }

    const timestamp = new Date(log.timestamp);
    if (isNaN(timestamp.getTime())) { eventSkipped++; continue; }

    const direction = log.eventType === 'entry' ? 'IN' : 'OUT';
    const deviceName = [log.door, log.terminalIp].filter(Boolean).join(' / ') || null;

    eventBatch.push({
      employeeId: hrEmployee.id,
      companyId: hrEmployee.companyId,
      timestamp,
      direction,
      deviceName,
      officeId: null,
      source: 'HIKVISION',
    });

    if (eventBatch.length >= BATCH_SIZE) {
      await prisma.attendanceEvent.createMany({ data: eventBatch });
      eventCount += eventBatch.length;
      eventBatch = [];
      process.stdout.write(`\r   Импортировано событий: ${eventCount}...`);
    }
  }

  if (eventBatch.length > 0) {
    await prisma.attendanceEvent.createMany({ data: eventBatch });
    eventCount += eventBatch.length;
  }
  console.log(`\r   ✅ Импортировано событий: ${eventCount} (пропущено: ${eventSkipped})`);

  // --- ШАГ 5: Генерация дневных сводок ---
  console.log('\n📅 Шаг 5: Генерация дневных сводок...');

  const dayMap = {};
  for (const log of skudLogs) {
    const hrEmployee = employeeMap[String(log.employeeId)];
    if (!hrEmployee) continue;

    const timestamp = new Date(log.timestamp);
    if (isNaN(timestamp.getTime())) continue;

    const dateStr = timestamp.toISOString().split('T')[0];
    const key = `${hrEmployee.id}_${dateStr}`;

    if (!dayMap[key]) {
      dayMap[key] = {
        employeeId: hrEmployee.id,
        companyId: hrEmployee.companyId,
        date: dateStr,
        events: [],
        locations: new Set(),
      };
    }

    dayMap[key].events.push({
      timestamp,
      direction: log.eventType === 'entry' ? 'IN' : 'OUT',
      location: log.location,
    });

    if (log.location) dayMap[key].locations.add(log.location);
  }

  // Корректировки: hrEmployeeId_date → minutes
  const correctionMap = {};
  for (const corr of skudCorrections) {
    const hrEmployee = employeeMap[String(corr.employee_id)];
    if (!hrEmployee) continue;
    correctionMap[`${hrEmployee.id}_${corr.correction_date}`] = corr.minutes;
  }

  let attendanceCount = 0;
  let attendanceBatch = [];

  for (const day of Object.values(dayMap)) {
    day.events.sort((a, b) => a.timestamp - b.timestamp);

    const entries = day.events.filter(e => e.direction === 'IN');
    const exits = day.events.filter(e => e.direction === 'OUT');

    const firstEntry = entries.length > 0 ? entries[0].timestamp : null;
    const lastExit = exits.length > 0 ? exits[exits.length - 1].timestamp : null;

    let totalMinutes = 0;
    if (firstEntry && lastExit && lastExit > firstEntry) {
      totalMinutes = Math.round((lastExit - firstEntry) / (1000 * 60));
    }

    const corrKey = `${day.employeeId}_${day.date}`;
    const correctionMinutes = correctionMap[corrKey] || 0;

    const status = entries.length > 0 && exits.length > 0 ? 'left' : 'present';

    const locationNames = { Favz: 'Фавз', Makon: 'Макон' };
    const officeName = Array.from(day.locations)
      .map(l => locationNames[l] || l)
      .join(', ') || null;

    attendanceBatch.push({
      employeeId: day.employeeId,
      companyId: day.companyId,
      date: new Date(day.date + 'T00:00:00.000Z'),
      firstEntry,
      lastExit,
      status,
      totalMinutes: totalMinutes + correctionMinutes,
      correctionMinutes,
      correctedBy: correctionMinutes ? 'система' : null,
      correctionNote: correctionMinutes ? `Корректировка из СКУД: +${correctionMinutes} мин` : null,
      officeName,
    });

    if (attendanceBatch.length >= BATCH_SIZE) {
      await prisma.attendance.createMany({ data: attendanceBatch });
      attendanceCount += attendanceBatch.length;
      attendanceBatch = [];
      process.stdout.write(`\r   Создано сводок: ${attendanceCount}...`);
    }
  }

  if (attendanceBatch.length > 0) {
    await prisma.attendance.createMany({ data: attendanceBatch });
    attendanceCount += attendanceBatch.length;
  }
  console.log(`\r   ✅ Создано дневных сводок: ${attendanceCount}`);

  console.log('\n✅ Импорт посещаемости завершён!');
  console.log(`   События (AttendanceEvent): ${eventCount}`);
  console.log(`   Дневные сводки (Attendance): ${attendanceCount}`);
  console.log(`   Пропущено событий (нет совпадения): ${eventSkipped}`);
}

main()
  .catch(err => {
    console.error('❌ Ошибка:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
