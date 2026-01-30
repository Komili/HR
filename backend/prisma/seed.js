const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Начало заполнения базы данных...');

  // Создание ролей
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

  // Создание отделов
  const departments = [
    'IT-отдел',
    'Бухгалтерия',
    'Отдел продаж',
    'HR-отдел',
    'Маркетинг',
  ];

  for (const name of departments) {
    await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('✅ Отделы созданы');

  // Создание должностей
  const positions = [
    'Разработчик',
    'Менеджер',
    'Бухгалтер',
    'HR-специалист',
    'Маркетолог',
    'Тестировщик',
    'Дизайнер',
    'Руководитель отдела',
  ];

  for (const name of positions) {
    await prisma.position.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('✅ Должности созданы');

  // Создание пользователей
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash('password', saltRounds);

  await prisma.user.upsert({
    where: { email: 'hr@example.com' },
    update: {},
    create: {
      email: 'hr@example.com',
      password: hashedPassword,
      roleId: roleHr.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      email: 'manager@example.com',
      password: hashedPassword,
      roleId: roleManager.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'accountant@example.com' },
    update: {},
    create: {
      email: 'accountant@example.com',
      password: hashedPassword,
      roleId: roleAccountant.id,
    },
  });

  console.log('✅ Пользователи созданы');

  // Получаем отделы и должности для привязки
  const itDept = await prisma.department.findUnique({ where: { name: 'IT-отдел' } });
  const hrDept = await prisma.department.findUnique({ where: { name: 'HR-отдел' } });
  const salesDept = await prisma.department.findUnique({ where: { name: 'Отдел продаж' } });

  const devPos = await prisma.position.findUnique({ where: { name: 'Разработчик' } });
  const hrPos = await prisma.position.findUnique({ where: { name: 'HR-специалист' } });
  const managerPos = await prisma.position.findUnique({ where: { name: 'Менеджер' } });

  // Создание тестовых сотрудников
  const testEmployees = [
    {
      firstName: 'Иван',
      lastName: 'Петров',
      patronymic: 'Сергеевич',
      latinFirstName: 'Ivan',
      latinLastName: 'Petrov',
      email: 'ivan.petrov@company.com',
      phone: '+7 (999) 123-45-67',
      departmentId: itDept?.id,
      positionId: devPos?.id,
    },
    {
      firstName: 'Мария',
      lastName: 'Сидорова',
      patronymic: 'Александровна',
      latinFirstName: 'Maria',
      latinLastName: 'Sidorova',
      email: 'maria.sidorova@company.com',
      phone: '+7 (999) 234-56-78',
      departmentId: hrDept?.id,
      positionId: hrPos?.id,
    },
    {
      firstName: 'Алексей',
      lastName: 'Козлов',
      patronymic: 'Дмитриевич',
      latinFirstName: 'Alexey',
      latinLastName: 'Kozlov',
      email: 'alexey.kozlov@company.com',
      phone: '+7 (999) 345-67-89',
      departmentId: salesDept?.id,
      positionId: managerPos?.id,
    },
    {
      firstName: 'Елена',
      lastName: 'Новикова',
      patronymic: 'Владимировна',
      latinFirstName: 'Elena',
      latinLastName: 'Novikova',
      email: 'elena.novikova@company.com',
      phone: '+7 (999) 456-78-90',
      departmentId: itDept?.id,
      positionId: devPos?.id,
    },
    {
      firstName: 'Дмитрий',
      lastName: 'Волков',
      patronymic: 'Андреевич',
      latinFirstName: 'Dmitry',
      latinLastName: 'Volkov',
      email: 'dmitry.volkov@company.com',
      phone: '+7 (999) 567-89-01',
      departmentId: itDept?.id,
      positionId: devPos?.id,
    },
  ];

  for (const emp of testEmployees) {
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
  console.log('   hr@example.com / password (Кадровик)');
  console.log('   manager@example.com / password (Руководитель)');
  console.log('   accountant@example.com / password (Бухгалтер)');
  console.log('');
  console.log('🎉 Заполнение базы данных завершено!');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
