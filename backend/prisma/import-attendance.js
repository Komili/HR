/**
 * Импорт ТОЛЬКО посещаемости из skud.sql в существующую HR базу
 * Сотрудников, компании и прочее НЕ трогает.
 *
 * Использование:
 *   docker compose exec backend node prisma/import-attendance.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

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
      for (let i = 0; i < columns.length; i++) obj[columns[i]] = row[i] !== undefined ? row[i] : null;
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
        if (ch === '\\' && i + 1 < len) { current += ch + valuesStr[i + 1]; i += 2; continue; }
        if (ch === stringChar) {
          if (i + 1 < len && valuesStr[i + 1] === stringChar) { current += ch + ch; i += 2; continue; }
          inString = false; current += ch; i++; continue;
        }
        current += ch; i++; continue;
      }
      if (ch === '\'' || ch === '"') { inString = true; stringChar = ch; current += ch; i++; continue; }
      if (ch === '(') { depth++; current += ch; i++; continue; }
      if (ch === ')') {
        depth--;
        if (depth === 0) { values.push(parseValue(current.trim())); i++; break; }
        current += ch; i++; continue;
      }
      if (ch === ',' && depth === 1) { values.push(parseValue(current.trim())); current = ''; i++; continue; }
      current += ch; i++;
    }
    if (values.length > 0) rows.push(values);
  }
  return rows;
}

function parseValue(val) {
  if (!val || val === '' || val === 'NULL') return null;
  if (val === 'CURRENT_TIMESTAMP') return new Date().toISOString();
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
    let s = val.slice(1, -1);
    s = s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/''/g, "'");
    return s;
  }
  if (/^-?\d+(\.\d+)?$/.test(val)) return val.includes('.') ? parseFloat(val) : parseInt(val, 10);
  return val;
}

async function main() {
  console.log('================================================');
  console.log('  HRMS — Импорт посещаемости из skud.sql');
  console.log('================================================');

  // Ищем skud.sql
  const possiblePaths = [
    '/app/storage/skud.sql',
    path.join(__dirname, '../../storage/skud.sql'),
    path.join(process.cwd(), 'storage/skud.sql'),
  ];
  let sqlPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) { sqlPath = p; break; }
  }
  if (!sqlPath) {
    console.error('❌ Файл skud.sql не найден!');
    console.error('   Ожидается в: storage/skud.sql');
    process.exit(1);
  }
  console.log(`\n📂 Файл: ${sqlPath}`);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`   Размер: ${(sql.length / 1024).toFixed(0)} KB`);

  const skudLogs = parseSqlInsert(sql, 'attendance_logs');
  const skudCorrections = parseSqlInsert(sql, 'attendance_corrections');
  console.log(`   Событий посещаемости: ${skudLogs.length}`);
  console.log(`   Корректировок: ${skudCorrections.length}`);

  // Загружаем сотрудников из HR по skudId
  console.log('\n👥 Загрузка сотрудников из БД...');
  const hrEmployees = await prisma.employee.findMany({
    where: { skudId: { not: null } },
    select: { id: true, companyId: true, skudId: true },
  });

  // employeeMap: skudId (число) → hrEmployee
  const employeeMap = {};
  for (const emp of hrEmployees) {
    if (emp.skudId) employeeMap[parseInt(emp.skudId)] = emp;
  }
  console.log(`   Найдено сотрудников с СКУД-ID: ${hrEmployees.length}`);

  // Очищаем посещаемость
  console.log('\n🧹 Очистка старой посещаемости...');
  await prisma.attendance.deleteMany();
  await prisma.attendanceEvent.deleteMany();
  console.log('   ✅ Очищено');

  // Импорт событий
  console.log('\n📊 Импорт событий посещаемости...');
  const BATCH_SIZE = 500;
  let eventBatch = [];
  let eventCount = 0;
  let eventSkipped = 0;

  for (const log of skudLogs) {
    const hrEmployee = employeeMap[log.employeeId];
    if (!hrEmployee) { eventSkipped++; continue; }
    const timestamp = new Date(log.timestamp);
    if (isNaN(timestamp.getTime())) { eventSkipped++; continue; }
    const direction = log.eventType === 'entry' ? 'IN' : 'OUT';
    const deviceName = [log.door, log.terminalIp].filter(Boolean).join(' / ') || null;
    eventBatch.push({ employeeId: hrEmployee.id, companyId: hrEmployee.companyId, timestamp, direction, deviceName, officeId: null });
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

  // Генерация дневных сводок
  console.log('\n📅 Генерация дневных сводок...');
  const dayMap = {};
  const correctionMap = {};

  for (const corr of skudCorrections) {
    const hrEmployee = employeeMap[corr.employee_id];
    if (!hrEmployee) continue;
    correctionMap[`${hrEmployee.id}_${corr.correction_date}`] = corr.minutes;
  }

  for (const log of skudLogs) {
    const hrEmployee = employeeMap[log.employeeId];
    if (!hrEmployee) continue;
    const timestamp = new Date(log.timestamp);
    if (isNaN(timestamp.getTime())) continue;
    const dateStr = timestamp.toISOString().split('T')[0];
    const key = `${hrEmployee.id}_${dateStr}`;
    if (!dayMap[key]) {
      dayMap[key] = { employeeId: hrEmployee.id, companyId: hrEmployee.companyId, date: dateStr, events: [] };
    }
    dayMap[key].events.push({ timestamp, direction: log.eventType === 'entry' ? 'IN' : 'OUT' });
  }

  let attendanceBatch = [];
  let attendanceCount = 0;

  for (const [key, day] of Object.entries(dayMap)) {
    day.events.sort((a, b) => a.timestamp - b.timestamp);
    const entries = day.events.filter(e => e.direction === 'IN');
    const exits = day.events.filter(e => e.direction === 'OUT');
    const firstEntry = entries.length > 0 ? entries[0].timestamp : null;
    const lastExit = exits.length > 0 ? exits[exits.length - 1].timestamp : null;
    let totalMinutes = 0;
    if (firstEntry && lastExit && lastExit > firstEntry) {
      totalMinutes = Math.round((lastExit - firstEntry) / (1000 * 60));
    }
    const correctionMinutes = correctionMap[key] || 0;
    const status = (entries.length > 0 && exits.length > 0) ? 'left' : 'present';

    attendanceBatch.push({
      employeeId: day.employeeId,
      companyId: day.companyId,
      date: new Date(day.date),
      firstEntry,
      lastExit,
      totalMinutes,
      correctionMinutes,
      status,
      isLate: false,
      isEarlyLeave: false,
    });

    if (attendanceBatch.length >= BATCH_SIZE) {
      await prisma.attendance.createMany({ data: attendanceBatch, skipDuplicates: true });
      attendanceCount += attendanceBatch.length;
      attendanceBatch = [];
      process.stdout.write(`\r   Создано сводок: ${attendanceCount}...`);
    }
  }
  if (attendanceBatch.length > 0) {
    await prisma.attendance.createMany({ data: attendanceBatch, skipDuplicates: true });
    attendanceCount += attendanceBatch.length;
  }
  console.log(`\r   ✅ Создано сводок: ${attendanceCount}`);

  console.log('\n================================================');
  console.log('  ✅ Импорт посещаемости завершён!');
  console.log('================================================');
}

main()
  .catch(e => { console.error('❌ Ошибка:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
