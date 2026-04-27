/**
 * Организация фото сотрудников из СКУД в структуру HR-системы
 *
 * Использование:
 *   1. Скопируйте все фото из СКУД в папку storage/skud-photos/
 *   2. Запустите: docker compose exec backend node prisma/organize-photos.js
 *
 * Скрипт:
 * 1. Читает skud.sql, находит соответствие photoUrl → сотрудник
 * 2. Находит сотрудников в HR-базе (по email/телефону)
 * 3. Создаёт папки: storage/companies/{CompanyName}/employees/{Фамилия}_{Имя}_{id}/
 * 4. Копирует фото в нужную папку
 * 5. Обновляет photoPath в базе данных
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Транслитерация кириллица → латиница (копия из common/transliterate.ts)
const CYR_TO_LAT = [
  [/а/g,'a'],[/А/g,'A'],[/б/g,'b'],[/Б/g,'B'],[/в/g,'v'],[/В/g,'V'],
  [/г/g,'g'],[/Г/g,'G'],[/д/g,'d'],[/Д/g,'D'],[/е/g,'e'],[/Е/g,'E'],
  [/ё/g,'yo'],[/Ё/g,'Yo'],[/ж/g,'zh'],[/Ж/g,'Zh'],[/з/g,'z'],[/З/g,'Z'],
  [/и/g,'i'],[/И/g,'I'],[/й/g,'y'],[/Й/g,'Y'],[/к/g,'k'],[/К/g,'K'],
  [/л/g,'l'],[/Л/g,'L'],[/м/g,'m'],[/М/g,'M'],[/н/g,'n'],[/Н/g,'N'],
  [/о/g,'o'],[/О/g,'O'],[/п/g,'p'],[/П/g,'P'],[/р/g,'r'],[/Р/g,'R'],
  [/с/g,'s'],[/С/g,'S'],[/т/g,'t'],[/Т/g,'T'],[/у/g,'u'],[/У/g,'U'],
  [/ф/g,'f'],[/Ф/g,'F'],[/х/g,'kh'],[/Х/g,'Kh'],[/ц/g,'ts'],[/Ц/g,'Ts'],
  [/ч/g,'ch'],[/Ч/g,'Ch'],[/ш/g,'sh'],[/Ш/g,'Sh'],[/щ/g,'sch'],[/Щ/g,'Sch'],
  [/ъ/g,''],[/Ъ/g,''],[/ы/g,'y'],[/Ы/g,'Y'],[/ь/g,''],[/Ь/g,''],
  [/э/g,'e'],[/Э/g,'E'],[/ю/g,'yu'],[/Ю/g,'Yu'],[/я/g,'ya'],[/Я/g,'Ya'],
  [/ғ/g,'gh'],[/Ғ/g,'Gh'],[/қ/g,'q'],[/Қ/g,'Q'],[/ҳ/g,'h'],[/Ҳ/g,'H'],
  [/ӣ/g,'i'],[/Ӣ/g,'I'],[/ӯ/g,'u'],[/Ӯ/g,'U'],[/ҷ/g,'j'],[/Ҷ/g,'J'],
];

function toFolderName(value) {
  if (!value) return 'unknown';
  let result = value;
  for (const [pattern, replacement] of CYR_TO_LAT) {
    result = result.replace(pattern, replacement);
  }
  return result
    .replace(/\s+/g, '_')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim() || 'unknown';
}

// Парсер SQL (из import-skud.js)
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
        if (ch === '\\' && i + 1 < len) { current += ch + valuesStr[i + 1]; i += 2; continue; }
        if (ch === stringChar) {
          if (i + 1 < len && valuesStr[i + 1] === stringChar) { current += ch + ch; i += 2; continue; }
          inString = false; current += ch; i++; continue;
        }
        current += ch; i++; continue;
      }
      if (ch === '\'' || ch === '"') { inString = true; stringChar = ch; current += ch; i++; continue; }
      if (ch === '(') { depth++; current += ch; i++; continue; }
      if (ch === ')') { depth--; if (depth === 0) { values.push(parseValue(current.trim())); i++; break; } current += ch; i++; continue; }
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
  console.log('══════════════════════════════════════════════');
  console.log('  ОРГАНИЗАЦИЯ ФОТО СОТРУДНИКОВ');
  console.log('══════════════════════════════════════════════\n');

  // Читаем skud.sql
  const possiblePaths = [
    path.join(__dirname, '../../skud.sql'),
    '/app/skud.sql',
    path.join(process.cwd(), 'skud.sql'),
  ];
  const sqlPath = possiblePaths.find(p => fs.existsSync(p));
  if (!sqlPath) { console.error('❌ skud.sql не найден!'); process.exit(1); }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const skudEmployees = parseSqlInsert(sql, 'employees');
  console.log(`📄 Прочитано сотрудников из СКУД: ${skudEmployees.length}`);

  // Папка с фото из СКУД
  const photosDir = path.join(process.cwd(), 'storage', 'skud-photos');
  if (!fs.existsSync(photosDir)) {
    fs.mkdirSync(photosDir, { recursive: true });
    console.log(`\n📁 Создана папка: ${photosDir}`);
    console.log('   Скопируйте туда все фото из СКУД и запустите скрипт снова.');
    process.exit(0);
  }

  const photoFiles = fs.readdirSync(photosDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  console.log(`📷 Найдено фото файлов: ${photoFiles.length}`);

  if (photoFiles.length === 0) {
    console.log('\n⚠️  Папка storage/skud-photos/ пуста!');
    console.log('   Скопируйте туда все фото из СКУД (из папки uploads/) и запустите снова.');
    process.exit(0);
  }

  // Получаем всех сотрудников из HR-базы с компаниями
  const hrEmployees = await prisma.employee.findMany({
    include: { company: true },
  });
  console.log(`👥 Сотрудников в HR-базе: ${hrEmployees.length}`);

  // Строим маппинг: имя файла из photoUrl СКУД → HR employee
  // photoUrl в СКУД выглядит как: /uploads/Комили_Раджабиён-1763118632441.jpg
  // Нам нужно сопоставить по email или телефону
  const emailMap = {};
  const phoneMap = {};
  for (const hr of hrEmployees) {
    if (hr.email) emailMap[hr.email.toLowerCase()] = hr;
    if (hr.phone) {
      const cleanPhone = hr.phone.replace(/[^0-9]/g, '');
      phoneMap[cleanPhone] = hr;
      // Без префикса 992
      if (cleanPhone.startsWith('992')) phoneMap[cleanPhone.slice(3)] = hr;
    }
  }

  let organized = 0;
  let skipped = 0;
  let notFound = 0;

  for (const skudEmp of skudEmployees) {
    if (!skudEmp.photoUrl) { skipped++; continue; }

    // Извлекаем имя файла из пути СКУД
    const skudFileName = path.basename(skudEmp.photoUrl);

    // Ищем файл в папке skud-photos
    const sourceFile = photoFiles.find(f => f === skudFileName);
    if (!sourceFile) { notFound++; continue; }

    // Находим соответствующего HR-сотрудника
    let hrEmp = null;
    if (skudEmp.email) hrEmp = emailMap[skudEmp.email.toLowerCase()];
    if (!hrEmp && skudEmp.phoneNumber) {
      const cleanPhone = String(skudEmp.phoneNumber).replace(/[^0-9]/g, '');
      hrEmp = phoneMap[cleanPhone];
    }

    if (!hrEmp) {
      console.log(`   ⚠️  Не найден HR-сотрудник для: ${skudEmp.fullName}`);
      notFound++;
      continue;
    }

    // Создаём путь: storage/companies/{CompanyName}/employees/{id}/
    // Папка = только ID сотрудника — никогда не дублируется при смене имени
    const companyName = toFolderName(hrEmp.company?.name || 'unknown');
    const empFolder = String(hrEmp.id);
    const destDir = path.join(process.cwd(), 'storage', 'companies', companyName, 'employees', empFolder);
    const docsDir = path.join(destDir, 'docs');

    // Создаём папки
    fs.mkdirSync(destDir, { recursive: true });
    fs.mkdirSync(docsDir, { recursive: true });

    // Копируем фото
    const ext = path.extname(sourceFile);
    const destFile = path.join(destDir, `photo${ext}`);
    fs.copyFileSync(path.join(photosDir, sourceFile), destFile);

    // Обновляем photoPath в базе
    const relativePath = path.relative(process.cwd(), destFile).replace(/\\/g, '/');
    await prisma.employee.update({
      where: { id: hrEmp.id },
      data: { photoPath: relativePath },
    });

    organized++;
  }

  console.log('\n══════════════════════════════════════════════');
  console.log('✅ ОРГАНИЗАЦИЯ ЗАВЕРШЕНА!');
  console.log('══════════════════════════════════════════════');
  console.log(`   Фото разложено:  ${organized}`);
  console.log(`   Без фото (СКУД): ${skipped}`);
  console.log(`   Не найдено:      ${notFound}`);
  console.log('══════════════════════════════════════════════\n');

  // Выводим структуру
  const companiesDir = path.join(process.cwd(), 'storage', 'companies');
  if (fs.existsSync(companiesDir)) {
    console.log('📁 Структура storage/companies/:');
    const companies = fs.readdirSync(companiesDir);
    for (const comp of companies) {
      const empDir = path.join(companiesDir, comp, 'employees');
      if (fs.existsSync(empDir)) {
        const emps = fs.readdirSync(empDir);
        console.log(`   📂 ${comp}/ (${emps.length} сотрудников)`);
      }
    }
  }
}

main()
  .catch((e) => { console.error('\n❌ Ошибка:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
