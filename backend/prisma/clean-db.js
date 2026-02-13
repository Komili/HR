/**
 * Скрипт очистки базы данных
 * Удаляет ВСЕ данные, кроме:
 * - Ролей (Суперадмин, Кадровик, Руководитель, Бухгалтер, Сотрудник)
 * - Единственного суперадмина (admin@holding.tj)
 *
 * Использование:
 *   docker-compose exec backend node prisma/clean-db.js
 *   # или локально:
 *   npx ts-node prisma/clean-db.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Начало очистки базы данных...\n');

  // 1. Удаляем всё зависимое
  const salary = await prisma.salary.deleteMany();
  console.log(`   Зарплаты: ${salary.count} удалено`);

  const attendance = await prisma.attendance.deleteMany();
  console.log(`   Посещаемость: ${attendance.count} удалено`);

  const events = await prisma.attendanceEvent.deleteMany();
  console.log(`   События посещаемости: ${events.count} удалено`);

  const invHistory = await prisma.inventoryHistory.deleteMany();
  console.log(`   История инвентаря: ${invHistory.count} удалено`);

  const inventory = await prisma.inventoryItem.deleteMany();
  console.log(`   Инвентарь: ${inventory.count} удалено`);

  const docs = await prisma.employeeDocument.deleteMany();
  console.log(`   Документы: ${docs.count} удалено`);

  const offices = await prisma.office.deleteMany();
  console.log(`   Офисы: ${offices.count} удалено`);

  const employees = await prisma.employee.deleteMany();
  console.log(`   Сотрудники: ${employees.count} удалено`);

  // 2. Удаляем всех пользователей КРОМЕ суперадмина
  const users = await prisma.user.deleteMany({
    where: { email: { not: 'admin@holding.tj' } },
  });
  console.log(`   Пользователи: ${users.count} удалено (admin@holding.tj сохранён)`);

  // 3. Удаляем должности, отделы, компании
  const positions = await prisma.position.deleteMany();
  console.log(`   Должности: ${positions.count} удалено`);

  const departments = await prisma.department.deleteMany();
  console.log(`   Отделы: ${departments.count} удалено`);

  const companies = await prisma.company.deleteMany();
  console.log(`   Компании: ${companies.count} удалено`);

  // 4. Аудит-лог тоже чистим
  const audit = await prisma.auditLog.deleteMany();
  console.log(`   Аудит-лог: ${audit.count} удалено`);

  // Роли НЕ трогаем!
  console.log('\n   ✅ Роли сохранены (Суперадмин, Кадровик, Руководитель, Бухгалтер, Сотрудник)');
  console.log('   ✅ Суперадмин сохранён (admin@holding.tj / password)');

  console.log('\n══════════════════════════════════════════════');
  console.log('🎉 База данных очищена!');
  console.log('   Суперадмин может теперь:');
  console.log('   1. Создать компании');
  console.log('   2. Создать пользователей с ролями');
  console.log('   3. Пользователи заполнят данные');
  console.log('══════════════════════════════════════════════\n');
}

main()
  .catch((e) => { console.error('❌ Ошибка:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
