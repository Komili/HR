/**
 * Импорт данных из СКУД (skud.sql) в HR-систему
 *
 * Использование:
 *   docker compose exec backend node prisma/import-skud.js
 *
 * Скрипт:
 * 1. Очищает базу данных HR
 * 2. Читает skud.sql и парсит INSERT-ы
 * 3. Создаёт компании, отделы, должности
 * 4. Импортирует сотрудников
 * 5. Импортирует события посещаемости
 * 6. Генерирует дневные сводки посещаемости
 * 7. Создаёт тестовых пользователей
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// ============ SQL ПАРСЕР ============

/**
 * Парсит INSERT IGNORE INTO из SQL-дампа
 * Возвращает массив объектов { col1: val1, col2: val2, ... }
 */
function parseSqlInsert(sql, tableName) {
  // Находим блок INSERT для таблицы
  const insertRegex = new RegExp(
    `INSERT IGNORE INTO \`${tableName}\`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?);`,
    'g'
  );

  const results = [];
  let match;

  while ((match = insertRegex.exec(sql)) !== null) {
    const columnsStr = match[1];
    const valuesStr = match[2];

    // Парсим названия колонок
    const columns = columnsStr.split(',').map(c => c.trim().replace(/`/g, ''));

    // Парсим строки значений
    const rows = parseValueRows(valuesStr);

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

/**
 * Парсит строки значений из VALUES (...), (...), ...
 */
function parseValueRows(valuesStr) {
  const rows = [];
  let i = 0;
  const len = valuesStr.length;

  while (i < len) {
    // Ищем начало строки значений '('
    while (i < len && valuesStr[i] !== '(') i++;
    if (i >= len) break;
    i++; // пропускаем '('

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
          // Проверяем двойное кавычку (экранирование '')
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

      if (ch === '\'' || ch === '"') {
        inString = true;
        stringChar = ch;
        current += ch;
        i++;
        continue;
      }

      if (ch === '(') {
        depth++;
        current += ch;
        i++;
        continue;
      }

      if (ch === ')') {
        depth--;
        if (depth === 0) {
          // Конец строки значений
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

    if (values.length > 0) {
      rows.push(values);
    }
  }

  return rows;
}

/**
 * Парсит одно значение из SQL: строку, число, NULL, CURRENT_TIMESTAMP
 */
function parseValue(val) {
  if (!val || val === '' || val === 'NULL') return null;
  if (val === 'CURRENT_TIMESTAMP') return new Date().toISOString();

  // Строка в кавычках
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
    let s = val.slice(1, -1);
    // Раскрываем экранированные символы
    s = s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/''/g, "'");
    return s;
  }

  // Число
  if (/^-?\d+(\.\d+)?$/.test(val)) {
    return val.includes('.') ? parseFloat(val) : parseInt(val, 10);
  }

  return val;
}

// ============ УТИЛИТЫ ============

/**
 * Транслитерация кириллицы в латиницу
 */
function transliterate(text) {
  if (!text) return '';
  const map = {
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
    'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
    'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
    'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
    'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    // Таджикские буквы
    'Ғ': 'Gh', 'ғ': 'gh', 'Ӣ': 'I', 'ӣ': 'i', 'Қ': 'Q', 'қ': 'q',
    'Ӯ': 'U', 'ӯ': 'u', 'Ҳ': 'H', 'ҳ': 'h', 'Ҷ': 'J', 'ҷ': 'j',
    'Ӯ': 'U', 'ӯ': 'u',
  };

  return text.split('').map(ch => map[ch] || ch).join('');
}

/**
 * Парсит полное имя: "Фамилия Имя Отчество" → { firstName, lastName, patronymic }
 */
function parseName(fullName) {
  if (!fullName) return { firstName: 'Неизвестно', lastName: 'Неизвестно', patronymic: null };

  const parts = fullName.trim().split(/\s+/).filter(p => p.length > 0);

  if (parts.length >= 3) {
    return { lastName: parts[0], firstName: parts[1], patronymic: parts.slice(2).join(' ') };
  } else if (parts.length === 2) {
    return { lastName: parts[0], firstName: parts[1], patronymic: null };
  } else {
    return { lastName: parts[0], firstName: parts[0], patronymic: null };
  }
}

/**
 * Зарплата по должности
 */
function getSalaryByPosition(positionName) {
  if (!positionName) return 3000;
  const p = positionName.toLowerCase();
  if (p.includes('директор') || p.includes('учредитель') || p.includes('ceo')) return 15000;
  if (p.includes('главный бухгалтер') || p.includes('сармуҳосиб')) return 8000;
  if (p.includes('главный инженер')) return 10000;
  if (p.includes('финансовый директор')) return 12000;
  if (p.includes('руководитель')) return 10000;
  if (p.includes('рохбар')) return 10000;
  if (p.includes('архитектор')) return 8000;
  if (p.includes('проектировщик') || p.includes('инженер')) return 7000;
  if (p.includes('юрист') || p.includes('помощник юриста')) return 6500;
  if (p.includes('бухгалтер') || p.includes('кассир')) return 5000;
  if (p.includes('hr') || p.includes('кадр')) return 5500;
  if (p.includes('it') || p.includes('безопасность') || p.includes('программист')) return 7000;
  if (p.includes('прораб') || p.includes('бригадир')) return 7500;
  if (p.includes('менеджер')) return 5500;
  if (p.includes('снабженец') || p.includes('логист')) return 5000;
  if (p.includes('продавец') || p.includes('продовец') || p.includes('администратор')) return 4000;
  if (p.includes('электрик') || p.includes('механик') || p.includes('сварщик')) return 4500;
  if (p.includes('водитель') || p.includes('ронанда')) return 4000;
  if (p.includes('охранник') || p.includes('служба безопасности')) return 3500;
  if (p.includes('оператор') || p.includes('рабочий')) return 3500;
  if (p.includes('дезинфектор') || p.includes('дизинфектор')) return 3500;
  if (p.includes('уборщ') || p.includes('повар') || p.includes('фаррош')) return 2500;
  if (p.includes('специалист') || p.includes('консультант')) return 5000;
  if (p.includes('ассистент') || p.includes('ёрдамчи')) return 3000;
  if (p.includes('завсклад') || p.includes('кладовщик')) return 4000;
  if (p.includes('доставщик')) return 3500;
  if (p.includes('переводчик')) return 5000;
  if (p.includes('диспетчер')) return 4000;
  if (p.includes('печатник')) return 4000;
  if (p.includes('начальник')) return 7000;
  if (p.includes('кочегар')) return 3000;
  return 3500;
}

/**
 * Дополнительные данные для компаний
 */
const COMPANY_EXTRA = {
  'Фавз': { shortName: 'Фавз', inn: '678901234', address: 'г. Душанбе, ул. Бохтар 20', phone: '+992 372 678901', email: 'info@favz.tj' },
  'Дезинфекция': { shortName: 'Дезинф.', inn: '234567890', address: 'г. Душанбе, ул. Сомони 15', phone: '+992 372 234567', email: 'info@dezinfection.tj' },
  'Фавз Кемикал': { shortName: 'Фавз Хим.', inn: '789012345', address: 'г. Душанбе, ул. Носири Хусрав 8', phone: '+992 372 789012', email: 'info@favz-chemical.tj' },
  'Бунёд Интернешнл': { shortName: 'Бунёд', inn: '123456789', address: 'г. Душанбе, ул. Рудаки 1', phone: '+992 372 123456', email: 'info@bunyod.tj' },
  'Роҳҳои Фавз': { shortName: 'Роҳҳои Ф.', inn: '567890123', address: 'г. Душанбе, ул. Мирзо Турсунзода 5', phone: '+992 372 567890', email: 'info@rohhoi-favz.tj' },
  'Фавз Климат': { shortName: 'Фавз Клим.', inn: '890123456', address: 'г. Душанбе, ул. Фирдавси 30', phone: '+992 372 890123', email: 'info@favz-climat.tj' },
  'Макон': { shortName: 'Макон', inn: '345678901', address: 'г. Душанбе, ул. Айни 45', phone: '+992 372 345678', email: 'info@makon.tj' },
  'Макон (Магазин)': { shortName: 'Макон Маг.', inn: '456789012', address: 'г. Душанбе, пр. Исмоили Сомони 100', phone: '+992 372 456789', email: 'shop@makon.tj' },
  'QIS. Калам': { shortName: 'QIS Калам', inn: '901234567', address: 'г. Душанбе', phone: '+992 372 901234', email: 'info@qalam.tj' },
};

/**
 * Пользователи для каждой компании
 */
function getUsersForCompany(companyName) {
  const keyMap = {
    'Фавз': 'favz',
    'Дезинфекция': 'dezinfection',
    'Фавз Кемикал': 'favz-chemical',
    'Бунёд Интернешнл': 'bunyod',
    'Роҳҳои Фавз': 'rohhoi-favz',
    'Фавз Климат': 'favz-climat',
    'Макон': 'makon',
    'Макон (Магазин)': 'makon-shop',
    'QIS. Калам': 'qalam',
  };
  const key = keyMap[companyName] || companyName.toLowerCase().replace(/\s+/g, '-');
  return [
    { email: `hr@${key}.tj`, firstName: 'Кадровик', lastName: companyName, role: 'Кадровик' },
    { email: `manager@${key}.tj`, firstName: 'Руководитель', lastName: companyName, role: 'Руководитель' },
    { email: `accountant@${key}.tj`, firstName: 'Бухгалтер', lastName: companyName, role: 'Бухгалтер' },
  ];
}

// ============ ГЛАВНАЯ ФУНКЦИЯ ============

async function main() {
  console.log('══════════════════════════════════════════════');
  console.log('  ИМПОРТ ДАННЫХ ИЗ СКУД В HR-СИСТЕМУ');
  console.log('══════════════════════════════════════════════\n');

  // --- ШАГ 1: Чтение и парсинг skud.sql ---
  console.log('📄 Шаг 1: Чтение skud.sql...');
  // Ищем skud.sql в нескольких местах
  const possiblePaths = [
    path.join(__dirname, '../../skud.sql'),     // локально: backend/prisma/../../skud.sql
    path.join(__dirname, '../skud.sql'),         // backend/skud.sql
    path.join(process.cwd(), 'skud.sql'),        // текущая папка
    '/app/skud.sql',                             // Docker: /app/skud.sql
  ];
  const sqlPath = possiblePaths.find(p => fs.existsSync(p));
  if (!sqlPath) {
    console.error('❌ Файл skud.sql не найден! Проверенные пути:', possiblePaths.join(', '));
    process.exit(1);
  }
  console.log(`   Найден: ${sqlPath}`);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`   Файл прочитан: ${(sql.length / 1024).toFixed(0)} KB`);

  const skudCompanies = parseSqlInsert(sql, 'companies');
  const skudDepartments = parseSqlInsert(sql, 'departments');
  const skudEmployees = parseSqlInsert(sql, 'employees');
  const skudLogs = parseSqlInsert(sql, 'attendance_logs');
  const skudCorrections = parseSqlInsert(sql, 'attendance_corrections');

  console.log(`   Компании: ${skudCompanies.length}`);
  console.log(`   Отделы: ${skudDepartments.length}`);
  console.log(`   Сотрудники: ${skudEmployees.length}`);
  console.log(`   Записи посещаемости: ${skudLogs.length}`);
  console.log(`   Корректировки: ${skudCorrections.length}`);

  // Находим ID компании QIS. Калам в СКУД для назначения сотрудников без компании
  const qisCompany = skudCompanies.find(c => c.name === 'QIS. Калам');
  const qisCompanyId = qisCompany ? qisCompany.id : null;

  // Все сотрудники: если companyId=NULL — назначаем в QIS. Калам
  let pendingCount = 0;
  const validEmployees = skudEmployees.map(e => {
    if (e.companyId === null || e.companyId === undefined) {
      pendingCount++;
      return { ...e, companyId: qisCompanyId };
    }
    return e;
  }).filter(e => e.companyId !== null && e.companyId !== undefined);
  console.log(`   Сотрудники с компанией: ${validEmployees.length} (из них pending → QIS. Калам: ${pendingCount})`);

  // --- ШАГ 2: Очистка базы данных ---
  console.log('\n🧹 Шаг 2: Очистка базы данных...');
  await prisma.salary.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.attendanceEvent.deleteMany();
  await prisma.inventoryHistory.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.employeeDocument.deleteMany();
  await prisma.office.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.registrationToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.position.deleteMany();
  await prisma.department.deleteMany();
  await prisma.company.deleteMany();
  await prisma.auditLog.deleteMany();
  console.log('   ✅ База данных очищена');

  // --- ШАГ 3: Создание ролей ---
  console.log('\n👥 Шаг 3: Создание ролей...');
  const roleNames = ['Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер', 'Сотрудник'];
  const roles = {};
  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    roles[name] = role;
  }
  console.log(`   ✅ Роли: ${roleNames.join(', ')}`);

  // --- ШАГ 4: Создание суперадминов ---
  console.log('\n🔑 Шаг 4: Создание суперадминов...');
  const hashedPassword = await bcrypt.hash('password', 10);

  const superadmins = [
    { email: 'admin@holding.tj', firstName: 'Администратор', lastName: 'Холдинга' },
    { email: 'admin1@holding.tj', firstName: 'Админ1', lastName: 'Холдинга' },
    { email: 'admin2@holding.tj', firstName: 'Админ2', lastName: 'Холдинга' },
    { email: 'admin3@holding.tj', firstName: 'Админ3', lastName: 'Холдинга' },
    { email: 'admin4@holding.tj', firstName: 'Админ4', lastName: 'Холдинга' },
    { email: 'admin5@holding.tj', firstName: 'Админ5', lastName: 'Холдинга' },
  ];

  for (const sa of superadmins) {
    await prisma.user.create({
      data: {
        email: sa.email,
        password: hashedPassword,
        firstName: sa.firstName,
        lastName: sa.lastName,
        roleId: roles['Суперадмин'].id,
        isHoldingAdmin: true,
        isActive: true,
      },
    });
  }
  console.log(`   ✅ Суперадмины: ${superadmins.map(s => s.email).join(', ')}`);

  // --- ШАГ 5: Создание компаний ---
  console.log('\n🏢 Шаг 5: Создание компаний...');
  const companyMap = {}; // skudId → hrCompany

  for (const sc of skudCompanies) {
    const extra = COMPANY_EXTRA[sc.name] || {};
    const company = await prisma.company.create({
      data: {
        name: sc.name,
        shortName: extra.shortName || sc.name,
        inn: extra.inn || null,
        address: extra.address || null,
        phone: extra.phone || null,
        email: extra.email || null,
        isActive: true,
      },
    });
    companyMap[sc.id] = company;
    console.log(`   ✅ ${sc.name} (SKUD id=${sc.id} → HR id=${company.id})`);
  }

  // --- ШАГ 6: Создание отделов ---
  console.log('\n📋 Шаг 6: Создание отделов...');
  // Собираем какие отделы нужны для каких компаний
  const deptPerCompany = {}; // companyId → Set<deptId>
  for (const emp of validEmployees) {
    if (emp.departmentId) {
      if (!deptPerCompany[emp.companyId]) deptPerCompany[emp.companyId] = new Set();
      deptPerCompany[emp.companyId].add(emp.departmentId);
    }
  }

  const deptNameMap = {}; // skudDeptId → name
  for (const d of skudDepartments) {
    deptNameMap[d.id] = d.name;
  }

  // departmentMap: `${skudCompanyId}_${skudDeptId}` → hrDepartment
  const departmentMap = {};
  let deptCount = 0;

  for (const [skudCompId, deptIds] of Object.entries(deptPerCompany)) {
    const hrCompany = companyMap[parseInt(skudCompId)];
    if (!hrCompany) continue;

    for (const skudDeptId of deptIds) {
      const deptName = deptNameMap[skudDeptId];
      if (!deptName) continue;

      const dept = await prisma.department.create({
        data: {
          name: deptName,
          companyId: hrCompany.id,
        },
      });
      departmentMap[`${skudCompId}_${skudDeptId}`] = dept;
      deptCount++;
    }
  }
  console.log(`   ✅ Создано отделов: ${deptCount}`);

  // --- ШАГ 7: Создание должностей ---
  console.log('\n💼 Шаг 7: Создание должностей...');
  // Собираем уникальные (position, companyId) пары
  const posPerCompany = {}; // companyId → Set<positionName>
  for (const emp of validEmployees) {
    if (emp.position) {
      const posName = emp.position.trim();
      if (!posPerCompany[emp.companyId]) posPerCompany[emp.companyId] = new Set();
      posPerCompany[emp.companyId].add(posName);
    }
  }

  // positionMap: `${skudCompanyId}_${positionName}` → hrPosition
  const positionMap = {};
  let posCount = 0;

  for (const [skudCompId, posNames] of Object.entries(posPerCompany)) {
    const hrCompany = companyMap[parseInt(skudCompId)];
    if (!hrCompany) continue;

    for (const posName of posNames) {
      const pos = await prisma.position.upsert({
        where: {
          name_companyId: { name: posName, companyId: hrCompany.id },
        },
        update: {},
        create: {
          name: posName,
          companyId: hrCompany.id,
        },
      });
      positionMap[`${skudCompId}_${posName}`] = pos;
      posCount++;
    }
  }
  console.log(`   ✅ Создано должностей: ${posCount}`);

  // --- ШАГ 8: Импорт сотрудников ---
  console.log('\n👤 Шаг 8: Импорт сотрудников...');
  const employeeMap = {}; // skudEmployeeId → hrEmployee
  let empCount = 0;
  let empErrors = 0;

  // Собираем уникальные email-ы чтобы избежать дубликатов
  const usedEmails = new Set();

  for (const emp of validEmployees) {
    try {
      const hrCompany = companyMap[emp.companyId];
      if (!hrCompany) {
        empErrors++;
        continue;
      }

      const { firstName, lastName, patronymic } = parseName(emp.fullName);
      const latinFirst = transliterate(firstName);
      const latinLast = transliterate(lastName);

      // Обработка email (избегаем дубликатов)
      let email = emp.email || null;
      if (email && usedEmails.has(email.toLowerCase())) {
        email = `${emp.id}_${email}`;
      }
      if (email) usedEmails.add(email.toLowerCase());

      // Обработка телефона
      let phone = emp.phoneNumber || null;
      if (phone) {
        phone = phone.replace(/[^0-9+]/g, '');
        if (!phone.startsWith('+') && phone.length >= 9) {
          phone = '+992' + phone.replace(/^992/, '');
        }
      }

      // Отдел и должность
      const deptKey = `${emp.companyId}_${emp.departmentId}`;
      const hrDept = emp.departmentId ? departmentMap[deptKey] : null;

      const posKey = `${emp.companyId}_${(emp.position || '').trim()}`;
      const hrPos = emp.position ? positionMap[posKey] : null;

      // Дата рождения и найма
      const birthDate = emp.dateOfBirth ? new Date(emp.dateOfBirth) : null;
      const hireDate = emp.hireDate ? new Date(emp.hireDate) : null;

      const employee = await prisma.employee.create({
        data: {
          firstName,
          lastName,
          patronymic,
          latinFirstName: latinFirst || 'Unknown',
          latinLastName: latinLast || 'Unknown',
          birthDate: birthDate && !isNaN(birthDate.getTime()) ? birthDate : null,
          hireDate: hireDate && !isNaN(hireDate.getTime()) ? hireDate : null,
          phone,
          email,
          salary: 1000,
          status: emp.status || 'Активен',
          photoPath: emp.photoUrl || null,
          skudId: emp.id ? String(emp.id) : null,
          companyId: hrCompany.id,
          departmentId: hrDept ? hrDept.id : null,
          positionId: hrPos ? hrPos.id : null,
        },
      });

      employeeMap[emp.id] = employee;
      empCount++;
    } catch (err) {
      console.error(`   ⚠️ Ошибка импорта сотрудника ${emp.id} (${emp.fullName}): ${err.message}`);
      empErrors++;
    }
  }
  console.log(`   ✅ Импортировано сотрудников: ${empCount} (ошибок: ${empErrors})`);

  // --- ШАГ 9: Импорт событий посещаемости ---
  console.log('\n📊 Шаг 9: Импорт событий посещаемости...');
  let eventCount = 0;
  let eventSkipped = 0;
  const BATCH_SIZE = 500;
  let eventBatch = [];

  for (const log of skudLogs) {
    const hrEmployee = employeeMap[log.employeeId];
    if (!hrEmployee) {
      eventSkipped++;
      continue;
    }

    const timestamp = new Date(log.timestamp);
    if (isNaN(timestamp.getTime())) {
      eventSkipped++;
      continue;
    }
    // СКУД хранит время в UTC+5 (Душанбе), корректируем на -5 часов для хранения в UTC
    timestamp.setHours(timestamp.getHours() - 5);

    const direction = log.eventType === 'entry' ? 'IN' : 'OUT';
    const deviceName = [log.door, log.terminalIp].filter(Boolean).join(' / ') || null;

    eventBatch.push({
      employeeId: hrEmployee.id,
      companyId: hrEmployee.companyId,
      timestamp,
      direction,
      deviceName,
      officeId: null,
    });

    if (eventBatch.length >= BATCH_SIZE) {
      await prisma.attendanceEvent.createMany({ data: eventBatch });
      eventCount += eventBatch.length;
      eventBatch = [];
      process.stdout.write(`\r   Импортировано событий: ${eventCount}...`);
    }
  }

  // Оставшиеся
  if (eventBatch.length > 0) {
    await prisma.attendanceEvent.createMany({ data: eventBatch });
    eventCount += eventBatch.length;
  }
  console.log(`\r   ✅ Импортировано событий: ${eventCount} (пропущено: ${eventSkipped})`);

  // --- ШАГ 10: Генерация дневных сводок посещаемости ---
  console.log('\n📅 Шаг 10: Генерация дневных сводок...');

  // Группируем события по (employee, date)
  const dayMap = {}; // `${hrEmployeeId}_${YYYY-MM-DD}` → { events[], employee }

  for (const log of skudLogs) {
    const hrEmployee = employeeMap[log.employeeId];
    if (!hrEmployee) continue;

    const timestamp = new Date(log.timestamp);
    if (isNaN(timestamp.getTime())) continue;
    // Корректируем на -5 часов (СКУД хранит в UTC+5)
    timestamp.setHours(timestamp.getHours() - 5);

    const dateStr = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
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

  // Маппинг корректировок: skudEmployeeId_date → minutes
  const correctionMap = {};
  for (const corr of skudCorrections) {
    const hrEmployee = employeeMap[corr.employee_id];
    if (!hrEmployee) continue;
    const key = `${hrEmployee.id}_${corr.correction_date}`;
    correctionMap[key] = corr.minutes;
  }

  // Создаём записи Attendance
  let attendanceCount = 0;
  let attendanceBatch = [];

  for (const [key, day] of Object.entries(dayMap)) {
    // Сортируем события по времени
    day.events.sort((a, b) => a.timestamp - b.timestamp);

    // Находим первый вход и последний выход
    const entries = day.events.filter(e => e.direction === 'IN');
    const exits = day.events.filter(e => e.direction === 'OUT');

    const firstEntry = entries.length > 0 ? entries[0].timestamp : null;
    const lastExit = exits.length > 0 ? exits[exits.length - 1].timestamp : null;

    // Вычисляем рабочее время
    let totalMinutes = 0;
    if (firstEntry && lastExit && lastExit > firstEntry) {
      totalMinutes = Math.round((lastExit - firstEntry) / (1000 * 60));
    }

    // Корректировка
    const corrKey = `${day.employeeId}_${day.date}`;
    const correctionMinutes = correctionMap[corrKey] || 0;

    // Статус
    let status = 'present';
    if (entries.length > 0 && exits.length > 0) {
      status = 'left'; // Пришёл и ушёл
    } else if (entries.length > 0) {
      status = 'present'; // Только вход (возможно ещё на работе)
    }

    // Имя офиса
    const locationNames = { 'Favz': 'Фавз', 'Makon': 'Макон' };
    const officeName = Array.from(day.locations)
      .map(l => locationNames[l] || l)
      .join(', ') || null;

    const dateObj = new Date(day.date + 'T00:00:00.000Z');

    attendanceBatch.push({
      employeeId: day.employeeId,
      companyId: day.companyId,
      date: dateObj,
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

  // --- ШАГ 11: Создание пользователей для компаний ---
  console.log('\n🔐 Шаг 11: Создание пользователей...');
  let userCount = 0;

  for (const sc of skudCompanies) {
    const hrCompany = companyMap[sc.id];
    if (!hrCompany) continue;

    const users = getUsersForCompany(sc.name);
    for (const u of users) {
      try {
        const role = roles[u.role];
        if (!role) continue;

        await prisma.user.create({
          data: {
            email: u.email,
            password: hashedPassword,
            firstName: u.firstName,
            lastName: u.lastName,
            roleId: role.id,
            companyId: hrCompany.id,
            isHoldingAdmin: false,
            isActive: true,
          },
        });
        userCount++;
      } catch (err) {
        // Дубликат email — пропускаем
      }
    }
  }
  console.log(`   ✅ Создано пользователей: ${userCount}`);

  // --- ИТОГО ---
  console.log('\n══════════════════════════════════════════════');
  console.log('🎉 ИМПОРТ ЗАВЕРШЁН!');
  console.log('══════════════════════════════════════════════');
  console.log(`   Компании:      ${Object.keys(companyMap).length}`);
  console.log(`   Отделы:        ${deptCount}`);
  console.log(`   Должности:     ${posCount}`);
  console.log(`   Сотрудники:    ${empCount}`);
  console.log(`   События:       ${eventCount}`);
  console.log(`   Дневные сводки: ${attendanceCount}`);
  console.log(`   Пользователи:  ${userCount + superadmins.length}`);
  console.log('');
  console.log('   🔑 Вход: admin@holding.tj / password');
  console.log('   🔑 Кадровик Фавз: hr@favz.tj / password');
  console.log('   🔑 Кадровик Макон: hr@makon.tj / password');
  console.log('══════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('\n❌ Ошибка импорта:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
