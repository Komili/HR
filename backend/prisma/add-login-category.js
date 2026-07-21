// Одноразовая миграция данных: добавить категорию `login` всем чатам,
// у которых уже включена категория `system` (уведомления о входе в систему —
// новая категория, по умолчанию включаем её там же, где системные алерты).
// Идемпотентно — повторный запуск ничего не ломает.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const chats = await prisma.telegramChat.findMany();
  let updated = 0;

  for (const c of chats) {
    const cats = (c.categories || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (cats.includes('system') && !cats.includes('login')) {
      cats.push('login');
      await prisma.telegramChat.update({
        where: { id: c.id },
        data: { categories: cats.join(',') },
      });
      updated++;
      console.log(`+ login → чат #${c.id} "${c.title}"`);
    }
  }

  console.log(`Готово. Обновлено чатов: ${updated} из ${chats.length}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
