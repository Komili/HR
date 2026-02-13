const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Начало заполнения базы данных холдинга...');

  // Очистка базы данных
  await prisma.attendance.deleteMany();
  await prisma.attendanceEvent.deleteMany();
  await prisma.inventoryHistory.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.employeeDocument.deleteMany();
  await prisma.office.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.position.deleteMany();
  await prisma.department.deleteMany();
  await prisma.company.deleteMany();
  await prisma.role.deleteMany();
  console.log('🗑️ База данных очищена');

  // 1. Создаём роли
  const roles = [
    { name: 'Суперадмин' },
    { name: 'Кадровик' },
    { name: 'Руководитель' },
    { name: 'Бухгалтер' },
    { name: 'Сотрудник' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
  console.log('✅ Роли созданы');

  // 2. Создаём компании холдинга
  const companies = [
    { name: 'Бунёд Интернешнл', shortName: 'Бунёд', inn: '123456789', address: 'г. Душанбе, ул. Рудаки 1', phone: '+992 372 123456', email: 'info@bunyod.tj' },
    { name: 'Дезинфекция', shortName: 'Дезинф.', inn: '234567890', address: 'г. Душанбе, ул. Сомони 15', phone: '+992 372 234567', email: 'info@dezinfection.tj' },
    { name: 'Макон', shortName: 'Макон', inn: '345678901', address: 'г. Душанбе, ул. Айни 45', phone: '+992 372 345678', email: 'info@makon.tj' },
    { name: 'Макон (Магазин)', shortName: 'Макон Маг.', inn: '456789012', address: 'г. Душанбе, пр. Исмоили Сомони 100', phone: '+992 372 456789', email: 'shop@makon.tj' },
    { name: 'Роҳҳои Фавз', shortName: 'Роҳҳои Ф.', inn: '567890123', address: 'г. Душанбе, ул. Мирзо Турсунзода 5', phone: '+992 372 567890', email: 'info@rohhoi-favz.tj' },
    { name: 'Фавз', shortName: 'Фавз', inn: '678901234', address: 'г. Душанбе, ул. Бохтар 20', phone: '+992 372 678901', email: 'info@favz.tj' },
    { name: 'Фавз Кемикал', shortName: 'Фавз Хим.', inn: '789012345', address: 'г. Душанбе, ул. Носири Хусрав 8', phone: '+992 372 789012', email: 'info@favz-chemical.tj' },
    { name: 'Фавз Климат', shortName: 'Фавз Клим.', inn: '890123456', address: 'г. Душанбе, ул. Фирдавси 30', phone: '+992 372 890123', email: 'info@favz-climat.tj' },
  ];

  const createdCompanies = {};

  for (const company of companies) {
    const created = await prisma.company.upsert({
      where: { name: company.name },
      update: {},
      create: company,
    });
    createdCompanies[company.name] = created;
  }
  console.log('✅ Компании холдинга созданы (8 компаний)');

  // 3. Создаём отделы для каждой компании
  const departmentNames = [
    'Администрация',
    'Бухгалтерия',
    'Отдел кадров',
    'Отдел продаж',
    'Производство',
    'Логистика',
    'IT отдел',
    'Маркетинг',
  ];

  for (const companyName of Object.keys(createdCompanies)) {
    const company = createdCompanies[companyName];
    for (const deptName of departmentNames) {
      await prisma.department.upsert({
        where: {
          name_companyId: { name: deptName, companyId: company.id }
        },
        update: {},
        create: { name: deptName, companyId: company.id },
      });
    }
  }
  console.log('✅ Отделы созданы для всех компаний');

  // 4. Создаём должности для каждой компании
  const positionNames = [
    'Генеральный директор',
    'Заместитель директора',
    'Главный бухгалтер',
    'Бухгалтер',
    'Менеджер по кадрам',
    'Специалист по кадрам',
    'Менеджер по продажам',
    'Старший менеджер',
    'Инженер',
    'Техник',
    'Водитель',
    'Кладовщик',
    'Программист',
    'Системный администратор',
    'Маркетолог',
    'Дизайнер',
    'Секретарь',
    'Охранник',
    'Уборщик',
  ];

  for (const companyName of Object.keys(createdCompanies)) {
    const company = createdCompanies[companyName];
    for (const posName of positionNames) {
      await prisma.position.upsert({
        where: {
          name_companyId: { name: posName, companyId: company.id }
        },
        update: {},
        create: { name: posName, companyId: company.id },
      });
    }
  }
  console.log('✅ Должности созданы для всех компаний');

  // 5. Создаём суперадминов холдинга
  const hashedPassword = await bcrypt.hash('password', 10);
  const superadminRole = await prisma.role.findUnique({ where: { name: 'Суперадмин' } });

  const superadmins = [
    { email: 'admin1@holding.tj', firstName: 'Админ', lastName: 'Первый' },
    { email: 'admin2@holding.tj', firstName: 'Админ', lastName: 'Второй' },
    { email: 'admin3@holding.tj', firstName: 'Админ', lastName: 'Третий' },
    { email: 'admin4@holding.tj', firstName: 'Админ', lastName: 'Четвёртый' },
    { email: 'admin5@holding.tj', firstName: 'Админ', lastName: 'Пятый' },
  ];

  for (const admin of superadmins) {
    await prisma.user.upsert({
      where: { email: admin.email },
      update: {},
      create: {
        email: admin.email,
        password: hashedPassword,
        firstName: admin.firstName,
        lastName: admin.lastName,
        roleId: superadminRole.id,
        isHoldingAdmin: true,
        companyId: null,
      },
    });
  }
  console.log('✅ Суперадмины холдинга созданы (5 пользователей)');

  // 6. Создаём пользователей для каждой компании
  const kadrovikRole = await prisma.role.findUnique({ where: { name: 'Кадровик' } });
  const rukovoditelRole = await prisma.role.findUnique({ where: { name: 'Руководитель' } });
  const buhgalterRole = await prisma.role.findUnique({ where: { name: 'Бухгалтер' } });

  const companyUsers = [
    // Бунёд Интернешнл
    { email: 'hr@bunyod.tj', firstName: 'Кадровик', lastName: 'Бунёд', roleId: kadrovikRole.id, companyName: 'Бунёд Интернешнл' },
    { email: 'manager@bunyod.tj', firstName: 'Руководитель', lastName: 'Бунёд', roleId: rukovoditelRole.id, companyName: 'Бунёд Интернешнл' },
    { email: 'accountant@bunyod.tj', firstName: 'Бухгалтер', lastName: 'Бунёд', roleId: buhgalterRole.id, companyName: 'Бунёд Интернешнл' },
    // Фавз
    { email: 'hr@favz.tj', firstName: 'Кадровик', lastName: 'Фавз', roleId: kadrovikRole.id, companyName: 'Фавз' },
    { email: 'manager@favz.tj', firstName: 'Руководитель', lastName: 'Фавз', roleId: rukovoditelRole.id, companyName: 'Фавз' },
    // Дезинфекция
    { email: 'hr@dezinfection.tj', firstName: 'Кадровик', lastName: 'Дезинфекция', roleId: kadrovikRole.id, companyName: 'Дезинфекция' },
    // Макон
    { email: 'hr@makon.tj', firstName: 'Кадровик', lastName: 'Макон', roleId: kadrovikRole.id, companyName: 'Макон' },
    // Фавз Кемикал
    { email: 'hr@favz-chemical.tj', firstName: 'Кадровик', lastName: 'Фавз Хим', roleId: kadrovikRole.id, companyName: 'Фавз Кемикал' },
    // Фавз Климат
    { email: 'hr@favz-climat.tj', firstName: 'Кадровик', lastName: 'Фавз Клим', roleId: kadrovikRole.id, companyName: 'Фавз Климат' },
  ];

  for (const user of companyUsers) {
    const company = createdCompanies[user.companyName];
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        email: user.email,
        password: hashedPassword,
        firstName: user.firstName,
        lastName: user.lastName,
        roleId: user.roleId,
        companyId: company.id,
        isHoldingAdmin: false,
      },
    });
  }
  console.log('✅ Тестовые пользователи компаний созданы');

  // 7. Создаём сотрудников для каждой компании (12 на компанию)
  const employeeTemplates = [
    { firstName: 'Акрам', lastName: 'Рахимов', latinFirst: 'Akram', latinLast: 'Rahimov', patronymic: 'Сафарович' },
    { firstName: 'Бахром', lastName: 'Каримов', latinFirst: 'Bahrom', latinLast: 'Karimov', patronymic: 'Олимович' },
    { firstName: 'Восит', lastName: 'Назаров', latinFirst: 'Vosit', latinLast: 'Nazarov', patronymic: 'Шерович' },
    { firstName: 'Голиб', lastName: 'Сафаров', latinFirst: 'Golib', latinLast: 'Safarov', patronymic: 'Рустамович' },
    { firstName: 'Далер', lastName: 'Ахмедов', latinFirst: 'Daler', latinLast: 'Ahmedov', patronymic: 'Камолович' },
    { firstName: 'Ёқуб', lastName: 'Холиков', latinFirst: 'Yoqub', latinLast: 'Holikov', patronymic: 'Файзович' },
    { firstName: 'Зафар', lastName: 'Мирзоев', latinFirst: 'Zafar', latinLast: 'Mirzoev', patronymic: 'Бахтиёрович' },
    { firstName: 'Икром', lastName: 'Содиков', latinFirst: 'Ikrom', latinLast: 'Sodikov', patronymic: 'Нурович' },
    { firstName: 'Камол', lastName: 'Тошев', latinFirst: 'Kamol', latinLast: 'Toshev', patronymic: 'Акбарович' },
    { firstName: 'Лутфулло', lastName: 'Расулов', latinFirst: 'Lutfullo', latinLast: 'Rasulov', patronymic: 'Саидович' },
    { firstName: 'Манучехр', lastName: 'Давлатов', latinFirst: 'Manuchehr', latinLast: 'Davlatov', patronymic: 'Джамолович' },
    { firstName: 'Наврӯз', lastName: 'Ғаниев', latinFirst: 'Navruz', latinLast: 'Ghaniev', patronymic: 'Фарходович' },
    { firstName: 'Санавбар', lastName: 'Комилова', latinFirst: 'Sanavbar', latinLast: 'Komilova', patronymic: 'Ҳасановна' },
    { firstName: 'Тахмина', lastName: 'Ризоева', latinFirst: 'Tahmina', latinLast: 'Rizoeva', patronymic: 'Файзуллоевна' },
    { firstName: 'Умеда', lastName: 'Рахматова', latinFirst: 'Umeda', latinLast: 'Rahmatova', patronymic: 'Муродовна' },
    { firstName: 'Фарзона', lastName: 'Носирова', latinFirst: 'Farzona', latinLast: 'Nosirova', patronymic: 'Сайфуллоевна' },
  ];

  const statuses = ['Активен', 'Активен', 'Активен', 'Активен', 'В отпуске', 'В командировке'];
  const streets = ['Рудаки', 'Сомони', 'Айни', 'Фирдавси', 'Носири Хусрав', 'Бохтар', 'Мирзо Турсунзода'];

  let employeeCount = 0;

  for (const companyName of Object.keys(createdCompanies)) {
    const company = createdCompanies[companyName];

    const companyDepts = await prisma.department.findMany({ where: { companyId: company.id } });
    const companyPositions = await prisma.position.findMany({ where: { companyId: company.id } });

    for (let i = 0; i < 12; i++) {
      const template = employeeTemplates[i % employeeTemplates.length];
      const dept = companyDepts[i % companyDepts.length];
      const position = companyPositions[i % companyPositions.length];
      const status = statuses[i % statuses.length];
      const street = streets[i % streets.length];

      const birthYear = 1970 + (i * 3 % 30);
      const birthMonth = (i % 12) + 1;
      const birthDay = (i % 28) + 1;
      const hireYear = 2015 + (i % 10);
      const hireMonth = (i % 12) + 1;

      await prisma.employee.create({
        data: {
          firstName: template.firstName,
          lastName: template.lastName,
          patronymic: template.patronymic,
          latinFirstName: template.latinFirst,
          latinLastName: template.latinLast,
          birthDate: new Date(birthYear, birthMonth - 1, birthDay),
          passportSerial: 'А',
          passportNumber: String(1000000 + employeeCount),
          passportIssuedBy: 'ВКД МВД РТ',
          passportIssueDate: new Date(2020, 0, 15),
          inn: String(100000000 + employeeCount),
          address: `г. Душанбе, ул. ${street} ${10 + i}`,
          phone: `+992 93 ${String(1000000 + employeeCount).slice(-7)}`,
          email: `${template.latinFirst.toLowerCase()}.${template.latinLast.toLowerCase()}${employeeCount}@${company.email.split('@')[1]}`,
          salary: 3000 + (i * 500),
          contractNumber: `ТД-${company.id}-${String(employeeCount + 1).padStart(4, '0')}`,
          contractDate: new Date(hireYear, hireMonth - 1, 1),
          hireDate: new Date(hireYear, hireMonth - 1, 1),
          status: status,
          notes: i === 0 ? 'Руководитель подразделения' : null,
          departmentId: dept.id,
          positionId: position.id,
          companyId: company.id,
        },
      });
      employeeCount++;
    }
  }
  console.log(`✅ Тестовые сотрудники созданы (${employeeCount} сотрудников, по 12 на компанию)`);

  // 8. Создаём инвентарь для каждой компании
  const inventoryTemplates = [
    { name: 'Ноутбук Dell', model: 'Latitude 5540', category: 'Компьютеры', price: 5500 },
    { name: 'Монитор Samsung', model: 'S24R350', category: 'Компьютеры', price: 1800 },
    { name: 'Принтер HP', model: 'LaserJet Pro M404dn', category: 'Оргтехника', price: 2500 },
    { name: 'МФУ Canon', model: 'i-SENSYS MF445dw', category: 'Оргтехника', price: 3200 },
    { name: 'Стол офисный', model: 'Ergo 120x60', category: 'Мебель', price: 800 },
    { name: 'Кресло офисное', model: 'Chairman 699', category: 'Мебель', price: 1200 },
    { name: 'Телефон Xiaomi', model: 'Redmi Note 12', category: 'Средства связи', price: 1500 },
    { name: 'Кондиционер', model: 'Midea MSMA-12HRN1', category: 'Прочее', price: 3500 },
  ];

  let inventoryCount = 0;

  for (const companyName of Object.keys(createdCompanies)) {
    const company = createdCompanies[companyName];

    // Получаем сотрудников компании для привязки
    const companyEmployees = await prisma.employee.findMany({
      where: { companyId: company.id },
      take: 4,
    });

    for (let i = 0; i < inventoryTemplates.length; i++) {
      const template = inventoryTemplates[i];
      const invNumber = `ИНВ-${String(company.id).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`;

      // Первые 3 предмета привязываем к сотрудникам (статус "Выдан")
      const assignToEmployee = i < 3 && companyEmployees[i];

      const createdItem = await prisma.inventoryItem.create({
        data: {
          name: template.name,
          model: template.model,
          category: template.category,
          inventoryNumber: invNumber,
          price: template.price,
          acquisitionDate: new Date(2023, i % 12, (i % 28) + 1),
          description: null,
          status: assignToEmployee ? 'Выдан' : 'В наличии',
          companyId: company.id,
          employeeId: assignToEmployee ? assignToEmployee.id : null,
        },
      });

      // История: создание
      await prisma.inventoryHistory.create({
        data: {
          inventoryItemId: createdItem.id,
          action: 'Создан',
          details: `Название: ${template.name}, Категория: ${template.category}, Модель: ${template.model}, Инв. номер: ${invNumber}, Цена: ${template.price}`,
          performedBy: 'admin1@holding.tj',
        },
      });

      // История: выдача сотруднику
      if (assignToEmployee) {
        const empName = `${assignToEmployee.lastName} ${assignToEmployee.firstName}${assignToEmployee.patronymic ? ' ' + assignToEmployee.patronymic : ''}`;
        await prisma.inventoryHistory.create({
          data: {
            inventoryItemId: createdItem.id,
            action: 'Выдан',
            details: `Выдан сотруднику ${empName}`,
            employeeName: empName,
            performedBy: 'admin1@holding.tj',
          },
        });
      }

      inventoryCount++;
    }
  }
  console.log(`✅ Инвентарь создан (${inventoryCount} предметов, по ${inventoryTemplates.length} на компанию)`);

  // 9. Создаём офисы для каждой компании
  const officeTemplates = [
    { name: 'Главный офис', address: 'Центральное здание' },
    { name: 'Склад', address: 'Складская зона' },
    { name: 'Филиал', address: 'Дополнительный офис' },
  ];

  const createdOffices = {};
  for (const companyName of Object.keys(createdCompanies)) {
    const company = createdCompanies[companyName];
    createdOffices[companyName] = [];
    for (const tmpl of officeTemplates) {
      const office = await prisma.office.create({
        data: {
          name: tmpl.name,
          address: `${company.address} — ${tmpl.address}`,
          companyId: company.id,
        },
      });
      createdOffices[companyName].push(office);
    }
  }
  console.log('✅ Офисы созданы (по 3 на компанию)');

  // 10. Создаём данные посещаемости за последние 30 дней
  let eventCount = 0;
  let attendanceCount = 0;

  for (const companyName of Object.keys(createdCompanies)) {
    const company = createdCompanies[companyName];
    const offices = createdOffices[companyName];
    const companyEmployees = await prisma.employee.findMany({
      where: { companyId: company.id },
    });

    for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
      const date = new Date();
      date.setDate(date.getDate() - dayOffset);
      // Пропускаем выходные
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const dateOnly = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

      for (const emp of companyEmployees) {
        // Случайный статус: 80% present, 10% left early, 5% excused, 5% absent
        const rand = Math.random();
        let status, firstEntry, lastExit, totalMinutes;
        const office = offices[Math.floor(Math.random() * offices.length)];

        if (rand < 0.05) {
          // absent — нет записей
          status = 'absent';
          firstEntry = null;
          lastExit = null;
          totalMinutes = 0;
        } else if (rand < 0.10) {
          // excused
          status = 'excused';
          firstEntry = null;
          lastExit = null;
          totalMinutes = 0;
        } else if (rand < 0.20) {
          // left early
          status = 'left';
          const entryHour = 8 + Math.floor(Math.random() * 2); // 8-9
          const entryMin = Math.floor(Math.random() * 60);
          const exitHour = 14 + Math.floor(Math.random() * 2); // 14-15
          const exitMin = Math.floor(Math.random() * 60);
          firstEntry = new Date(dateOnly);
          firstEntry.setUTCHours(entryHour, entryMin, 0, 0);
          lastExit = new Date(dateOnly);
          lastExit.setUTCHours(exitHour, exitMin, 0, 0);
          totalMinutes = Math.round((lastExit.getTime() - firstEntry.getTime()) / 60000);
        } else {
          // present — full day
          status = 'present';
          const entryHour = 8 + Math.floor(Math.random() * 2); // 8-9
          const entryMin = Math.floor(Math.random() * 30);
          const exitHour = 17 + Math.floor(Math.random() * 2); // 17-18
          const exitMin = Math.floor(Math.random() * 60);
          firstEntry = new Date(dateOnly);
          firstEntry.setUTCHours(entryHour, entryMin, 0, 0);
          lastExit = new Date(dateOnly);
          lastExit.setUTCHours(exitHour, exitMin, 0, 0);
          totalMinutes = Math.round((lastExit.getTime() - firstEntry.getTime()) / 60000);
        }

        // Создаём события (IN/OUT)
        if (firstEntry) {
          await prisma.attendanceEvent.create({
            data: {
              employeeId: emp.id,
              companyId: company.id,
              timestamp: firstEntry,
              direction: 'IN',
              officeId: office.id,
            },
          });
          eventCount++;
        }
        if (lastExit) {
          await prisma.attendanceEvent.create({
            data: {
              employeeId: emp.id,
              companyId: company.id,
              timestamp: lastExit,
              direction: 'OUT',
              officeId: office.id,
            },
          });
          eventCount++;
        }

        // Корректировки для нескольких записей
        let correctionMinutes = 0;
        let correctedBy = null;
        let correctionNote = null;
        if (dayOffset < 5 && emp.id % 7 === 0 && status === 'present') {
          correctionMinutes = [30, 60, -30][Math.floor(Math.random() * 3)];
          correctedBy = 'admin1@holding.tj';
          correctionNote = correctionMinutes > 0 ? 'Переработка по указанию' : 'Ранний уход согласован';
          totalMinutes = Math.max(0, totalMinutes + correctionMinutes);
        }

        // Создаём дневную сводку
        await prisma.attendance.create({
          data: {
            employeeId: emp.id,
            companyId: company.id,
            date: dateOnly,
            firstEntry,
            lastExit,
            status,
            totalMinutes: totalMinutes || 0,
            correctionMinutes,
            correctedBy,
            correctionNote,
            officeName: office.name,
          },
        });
        attendanceCount++;
      }
    }
  }
  console.log(`✅ Посещаемость создана (${attendanceCount} записей, ${eventCount} событий)`);

  // Выводим информацию
  console.log('\n📋 Тестовые учётные записи:\n');
  console.log('   🔴 СУПЕРАДМИНЫ ХОЛДИНГА (доступ ко всем компаниям):');
  for (const admin of superadmins) {
    console.log(`   ${admin.email} / password`);
  }
  console.log('\n   🔵 БУНЁД ИНТЕРНЕШНЛ:');
  console.log('   hr@bunyod.tj / password (Кадровик)');
  console.log('   manager@bunyod.tj / password (Руководитель)');
  console.log('   accountant@bunyod.tj / password (Бухгалтер)');
  console.log('\n   🟢 ФАВЗ:');
  console.log('   hr@favz.tj / password (Кадровик)');
  console.log('   manager@favz.tj / password (Руководитель)');
  console.log('\n   🟡 ДЕЗИНФЕКЦИЯ:');
  console.log('   hr@dezinfection.tj / password (Кадровик)');
  console.log('\n   🟠 МАКОН:');
  console.log('   hr@makon.tj / password (Кадровик)');
  console.log('\n   🟣 ФАВЗ КЕМИКАЛ:');
  console.log('   hr@favz-chemical.tj / password (Кадровик)');
  console.log('\n   🔵 ФАВЗ КЛИМАТ:');
  console.log('   hr@favz-climat.tj / password (Кадровик)');

  console.log('\n🎉 Заполнение базы данных холдинга завершено!');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
