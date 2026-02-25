const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// 8 компаний холдинга
const COMPANIES = [
  { name: 'Фавз',              shortName: 'Фавз',        inn: '678901234', address: 'г. Душанбе, ул. Бохтар 20',                    phone: '+992 372 678901', email: 'info@favz.tj' },
  { name: 'Дезинфекция',       shortName: 'Дезинф.',     inn: '234567890', address: 'г. Душанбе, ул. Сомони 15',                    phone: '+992 372 234567', email: 'info@dezinfection.tj' },
  { name: 'Фавз Кемикал',      shortName: 'Фавз Хим.',   inn: '789012345', address: 'г. Душанбе, ул. Носири Хусрав 8',              phone: '+992 372 789012', email: 'info@favz-chemical.tj' },
  { name: 'Бунёд Интернешнл',  shortName: 'Бунёд',       inn: '123456789', address: 'г. Душанбе, ул. Рудаки 1',                    phone: '+992 372 123456', email: 'info@bunyod.tj' },
  { name: 'Роҳҳои Фавз',       shortName: 'Роҳҳои Ф.',   inn: '567890123', address: 'г. Душанбе, ул. Мирзо Турсунзода 5',          phone: '+992 372 567890', email: 'info@rohhoi-favz.tj' },
  { name: 'Фавз Климат',       shortName: 'Фавз Клим.',  inn: '890123456', address: 'г. Душанбе, ул. Фирдавси 30',                 phone: '+992 372 890123', email: 'info@favz-climat.tj' },
  { name: 'Макон',             shortName: 'Макон',       inn: '345678901', address: 'г. Душанбе, ул. Айни 45',                     phone: '+992 372 345678', email: 'info@makon.tj' },
  { name: 'Макон (Магазин)',   shortName: 'Макон Маг.',  inn: '456789012', address: 'г. Душанбе, пр. Исмоили Сомони 100',          phone: '+992 372 456789', email: 'shop@makon.tj' },
  { name: 'QIS. Калам',        shortName: 'QIS Калам',   inn: '901234567', address: 'г. Душанбе',                                  phone: '+992 372 901234', email: 'info@qalam.tj' },
];

async function main() {
  console.log('🚀 Инициализация базы данных...\n');

  // ========== ОЧИСТКА ==========
  await prisma.registrationToken.deleteMany();
  await prisma.salary.deleteMany();
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
  await prisma.auditLog.deleteMany();
  console.log('🗑️  База данных очищена');

  // ========== РОЛИ ==========
  const roleNames = ['Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер', 'Сотрудник'];
  const roles = {};
  for (const name of roleNames) {
    roles[name] = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log('✅ Роли созданы (5)');

  // ========== КОМПАНИИ ==========
  for (const c of COMPANIES) {
    await prisma.company.upsert({
      where: { name: c.name },
      update: {},
      create: { ...c, isActive: true },
    });
  }
  console.log(`✅ Компании созданы (${COMPANIES.length})`);

  // ========== СУПЕРАДМИН ==========
  const hashedPassword = await bcrypt.hash('password', 10);
  await prisma.user.upsert({
    where: { email: 'admin@holding.tj' },
    update: {},
    create: {
      email: 'admin@holding.tj',
      password: hashedPassword,
      firstName: 'Администратор',
      lastName: 'Холдинга',
      roleId: roles['Суперадмин'].id,
      isHoldingAdmin: true,
      companyId: null,
    },
  });
  console.log('✅ Суперадмин создан: admin@holding.tj / password');

  console.log('\n══════════════════════════════════════════════════════');
  console.log('ℹ️  База готова. Для загрузки реальных данных выполните:');
  console.log('');
  console.log('   # Скопировать skud.sql в контейнер:');
  console.log('   docker cp skud.sql hrms_backend:/app/skud.sql');
  console.log('');
  console.log('   # Запустить импорт:');
  console.log('   docker compose exec backend node prisma/import-skud.js');
  console.log('');
  console.log('   # Разложить фото сотрудников:');
  console.log('   docker compose exec backend node prisma/organize-photos.js');
  console.log('══════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => { console.error('❌ Ошибка:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
