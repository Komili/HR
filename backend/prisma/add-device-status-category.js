// Одноразовая миграция данных: добавить категорию `device_status` всем чатам,
// у которых уже включена категория `system` (раньше алерты о связи с устройствами/
// агентом шли под `system`). Идемпотентно — повторный запуск ничего не ломает.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const chats = await prisma.telegramChat.findMany();
  let updated = 0;

  for (const c of chats) {
    const cats = (c.categories || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (cats.includes('system') && !cats.includes('device_status')) {
      cats.push('device_status');
      await prisma.telegramChat.update({
        where: { id: c.id },
        data: { categories: cats.join(',') },
      });
      updated++;
      console.log(`+ device_status → чат #${c.id} "${c.title}"`);
    }
  }

  console.log(`Готово. Обновлено чатов: ${updated} из ${chats.length}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
