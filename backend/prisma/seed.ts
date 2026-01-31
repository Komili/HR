import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Начало заполнения базы данных холдинга...');

  // Создание ролей
  const roleSuperAdmin = await prisma.role.upsert({
    where: { name: 'Суперадмин' },
    update: {},
    create: { name: 'Суперадмин' },
  });

  const roleHr = await prisma.role.upsert({
    where: { name: 'Кадровик' },
    update: {},
    create: { name: 'Кадровик' },
  });

  const roleManager = await prisma.role.upsert({
    where: { name: 'Руководитель' },
    update: {},
    create: { name: 'Руководитель' },
  });

  const roleAccountant = await prisma.role.upsert({
    where: { name: 'Бухгалтер' },
    update: {},
    create: { name: 'Бухгалтер' },
  });

  const roleEmployee = await prisma.role.upsert({
    where: { name: 'Сотрудник' },
    update: {},
    create: { name: 'Сотрудник' },
  });

  console.log('✅ Роли созданы');

  // Создание компаний холдинга
  const companies = [
    { name: 'Бунёд Интернешнл', shortName: 'Бунёд' },
    { name: 'Дезинфекция', shortName: 'Дезинфекция' },
    { name: 'Макон', shortName: 'Макон' },
    { name: 'Макон (Магазин)', shortName: 'Макон Маг' },
    { name: 'Роҳҳои Фавз', shortName: 'Роҳҳои Фавз' },
    { name: 'Фавз', shortName: 'Фавз' },
    { name: 'Фавз Кемикал', shortName: 'Фавз Кемикал' },
    { name: 'Фавз Климат', shortName: 'Фавз Климат' },
  ];

  const createdCompanies: { [key: string]: { id: number; name: string } } = {};

  for (const company of companies) {
    const created = await prisma.company.upsert({
      where: { name: company.name },
      update: { shortName: company.shortName },
      create: company,
    });
    createdCompanies[company.name] = created;
  }

  console.log('✅ Компании холдинга созданы (8 компаний)');

  // Создание типовых отделов для каждой компании
  const departmentNames = [
    'Администрация',
    'Бухгалтерия',
    'Отдел кадров',
    'Отдел продаж',
    'Склад',
  ];

  for (const company of Object.values(createdCompanies)) {
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

  // Создание типовых должностей для каждой компании
  const positionNames = [
    'Директор',
    'Заместитель директора',
    'Главный бухгалтер',
    'Бухгалтер',
    'HR-специалист',
    'Менеджер по продажам',
    'Кладовщик',
    'Водитель',
  ];

  for (const company of Object.values(createdCompanies)) {
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

  // Создание пароля
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash('password', saltRounds);

  // Создание 5 суперадминов холдинга
  const superAdmins = [
    { email: 'admin1@holding.tj', firstName: 'Админ', lastName: 'Первый' },
    { email: 'admin2@holding.tj', firstName: 'Админ', lastName: 'Второй' },
    { email: 'admin3@holding.tj', firstName: 'Админ', lastName: 'Третий' },
    { email: 'admin4@holding.tj', firstName: 'Админ', lastName: 'Четвёртый' },
    { email: 'admin5@holding.tj', firstName: 'Админ', lastName: 'Пятый' },
  ];

  for (const admin of superAdmins) {
    await prisma.user.upsert({
      where: { email: admin.email },
      update: { isHoldingAdmin: true },
      create: {
        email: admin.email,
        password: hashedPassword,
        firstName: admin.firstName,
        lastName: admin.lastName,
        roleId: roleSuperAdmin.id,
        isHoldingAdmin: true,
        companyId: null, // Суперадмин не привязан к компании
      },
    });
  }
  console.log('✅ Суперадмины холдинга созданы (5 пользователей)');

  // Создание тестовых пользователей для первой компании (Бунёд Интернешнл)
  const bunyodCompany = createdCompanies['Бунёд Интернешнл'];

  await prisma.user.upsert({
    where: { email: 'hr@bunyod.tj' },
    update: {},
    create: {
      email: 'hr@bunyod.tj',
      password: hashedPassword,
      firstName: 'Кадровик',
      lastName: 'Бунёд',
      roleId: roleHr.id,
      companyId: bunyodCompany.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'manager@bunyod.tj' },
    update: {},
    create: {
      email: 'manager@bunyod.tj',
      password: hashedPassword,
      firstName: 'Руководитель',
      lastName: 'Бунёд',
      roleId: roleManager.id,
      companyId: bunyodCompany.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'accountant@bunyod.tj' },
    update: {},
    create: {
      email: 'accountant@bunyod.tj',
      password: hashedPassword,
      firstName: 'Бухгалтер',
      lastName: 'Бунёд',
      roleId: roleAccountant.id,
      companyId: bunyodCompany.id,
    },
  });

  // Создание тестовых пользователей для второй компании (Фавз)
  const favzCompany = createdCompanies['Фавз'];

  await prisma.user.upsert({
    where: { email: 'hr@favz.tj' },
    update: {},
    create: {
      email: 'hr@favz.tj',
      password: hashedPassword,
      firstName: 'Кадровик',
      lastName: 'Фавз',
      roleId: roleHr.id,
      companyId: favzCompany.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'manager@favz.tj' },
    update: {},
    create: {
      email: 'manager@favz.tj',
      password: hashedPassword,
      firstName: 'Руководитель',
      lastName: 'Фавз',
      roleId: roleManager.id,
      companyId: favzCompany.id,
    },
  });

  console.log('✅ Тестовые пользователи компаний созданы');

  // Получаем отделы и должности для Бунёд
  const bunyodAdmin = await prisma.department.findFirst({
    where: { name: 'Администрация', companyId: bunyodCompany.id }
  });
  const bunyodSales = await prisma.department.findFirst({
    where: { name: 'Отдел продаж', companyId: bunyodCompany.id }
  });
  const bunyodHR = await prisma.department.findFirst({
    where: { name: 'Отдел кадров', companyId: bunyodCompany.id }
  });

  const bunyodDirector = await prisma.position.findFirst({
    where: { name: 'Директор', companyId: bunyodCompany.id }
  });
  const bunyodManager = await prisma.position.findFirst({
    where: { name: 'Менеджер по продажам', companyId: bunyodCompany.id }
  });
  const bunyodHRSpec = await prisma.position.findFirst({
    where: { name: 'HR-специалист', companyId: bunyodCompany.id }
  });

  // Создание тестовых сотрудников для Бунёд Интернешнл
  const bunyodEmployees = [
    {
      firstName: 'Фаррух',
      lastName: 'Рахимов',
      patronymic: 'Сайфуллоевич',
      latinFirstName: 'Farrukh',
      latinLastName: 'Rahimov',
      email: 'farrukh.rahimov@bunyod.tj',
      phone: '+992 900 123-45-67',
      departmentId: bunyodAdmin?.id,
      positionId: bunyodDirector?.id,
      companyId: bunyodCompany.id,
    },
    {
      firstName: 'Мадина',
      lastName: 'Каримова',
      patronymic: 'Ахмедовна',
      latinFirstName: 'Madina',
      latinLastName: 'Karimova',
      email: 'madina.karimova@bunyod.tj',
      phone: '+992 900 234-56-78',
      departmentId: bunyodHR?.id,
      positionId: bunyodHRSpec?.id,
      companyId: bunyodCompany.id,
    },
    {
      firstName: 'Бехруз',
      lastName: 'Назаров',
      patronymic: 'Содикович',
      latinFirstName: 'Bekhruz',
      latinLastName: 'Nazarov',
      email: 'bekhruz.nazarov@bunyod.tj',
      phone: '+992 900 345-67-89',
      departmentId: bunyodSales?.id,
      positionId: bunyodManager?.id,
      companyId: bunyodCompany.id,
    },
  ];

  for (const emp of bunyodEmployees) {
    const existing = await prisma.employee.findFirst({
      where: { email: emp.email },
    });

    if (!existing) {
      await prisma.employee.create({
        data: emp,
      });
    }
  }

  // Получаем отделы и должности для Фавз
  const favzAdmin = await prisma.department.findFirst({
    where: { name: 'Администрация', companyId: favzCompany.id }
  });
  const favzWarehouse = await prisma.department.findFirst({
    where: { name: 'Склад', companyId: favzCompany.id }
  });

  const favzDirector = await prisma.position.findFirst({
    where: { name: 'Директор', companyId: favzCompany.id }
  });
  const favzStorekeeper = await prisma.position.findFirst({
    where: { name: 'Кладовщик', companyId: favzCompany.id }
  });

  // Создание тестовых сотрудников для Фавз
  const favzEmployees = [
    {
      firstName: 'Ситора',
      lastName: 'Азизова',
      patronymic: 'Рустамовна',
      latinFirstName: 'Sitora',
      latinLastName: 'Azizova',
      email: 'sitora.azizova@favz.tj',
      phone: '+992 900 456-78-90',
      departmentId: favzAdmin?.id,
      positionId: favzDirector?.id,
      companyId: favzCompany.id,
    },
    {
      firstName: 'Комрон',
      lastName: 'Холиков',
      patronymic: 'Шарифович',
      latinFirstName: 'Komron',
      latinLastName: 'Kholikov',
      email: 'komron.kholikov@favz.tj',
      phone: '+992 900 567-89-01',
      departmentId: favzWarehouse?.id,
      positionId: favzStorekeeper?.id,
      companyId: favzCompany.id,
    },
  ];

  for (const emp of favzEmployees) {
    const existing = await prisma.employee.findFirst({
      where: { email: emp.email },
    });

    if (!existing) {
      await prisma.employee.create({
        data: emp,
      });
    }
  }

  console.log('✅ Тестовые сотрудники созданы');
  console.log('');
  console.log('📋 Тестовые учётные записи:');
  console.log('');
  console.log('   🔴 СУПЕРАДМИНЫ ХОЛДИНГА (доступ ко всем компаниям):');
  console.log('   admin1@holding.tj / password');
  console.log('   admin2@holding.tj / password');
  console.log('   admin3@holding.tj / password');
  console.log('   admin4@holding.tj / password');
  console.log('   admin5@holding.tj / password');
  console.log('');
  console.log('   🔵 БУНЁД ИНТЕРНЕШНЛ:');
  console.log('   hr@bunyod.tj / password (Кадровик)');
  console.log('   manager@bunyod.tj / password (Руководитель)');
  console.log('   accountant@bunyod.tj / password (Бухгалтер)');
  console.log('');
  console.log('   🟢 ФАВЗ:');
  console.log('   hr@favz.tj / password (Кадровик)');
  console.log('   manager@favz.tj / password (Руководитель)');
  console.log('');
  console.log('🎉 Заполнение базы данных холдинга завершено!');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
