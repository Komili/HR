/**
 * Миграция: переименование папок компаний кириллица → латиница
 *
 * Использование:
 *   docker compose exec backend node prisma/rename-company-folders.js
 *
 * Что делает:
 * 1. Переименовывает папки storage/companies/{КириллицаИмя}/ → {LatinName}/
 * 2. Обновляет photoPath всех сотрудников в базе данных
 * 3. Обновляет filePath всех документов в базе данных
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Транслитерация кириллица → латиница
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

async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  МИГРАЦИЯ ПАПОК: кириллица → латиница');
  console.log('══════════════════════════════════════════════════════\n');

  const companiesDir = path.join(process.cwd(), 'storage', 'companies');
  if (!fs.existsSync(companiesDir)) {
    console.log('⚠️  Папка storage/companies/ не найдена. Нечего переименовывать.');
    return;
  }

  const folders = fs.readdirSync(companiesDir);
  console.log(`📁 Найдено папок компаний: ${folders.length}`);

  // Строим маппинг старое имя → новое имя
  const renames = [];
  for (const folder of folders) {
    const newName = toFolderName(folder);
    if (newName !== folder) {
      renames.push({ old: folder, new: newName });
    }
  }

  if (renames.length === 0) {
    console.log('\n✅ Все папки уже на латинице. Ничего не нужно переименовывать.');
    // Всё равно обновим пути в БД на случай рассинхрона
  } else {
    console.log(`\n🔄 Папок для переименования: ${renames.length}`);
    for (const r of renames) {
      console.log(`   ${r.old} → ${r.new}`);
    }
  }

  // Шаг 1: Переименовываем папки на диске
  let renamedCount = 0;
  for (const r of renames) {
    const oldPath = path.join(companiesDir, r.old);
    const newPath = path.join(companiesDir, r.new);

    if (fs.existsSync(newPath)) {
      // Папка с новым именем уже существует — объединяем
      console.log(`\n⚠️  Папка "${r.new}" уже существует, объединяем...`);
      mergeDirectories(oldPath, newPath);
      fs.rmdirSync(oldPath, { recursive: true });
    } else {
      fs.renameSync(oldPath, newPath);
    }
    renamedCount++;
    console.log(`   ✅ Переименовано: ${r.old} → ${r.new}`);
  }

  // Шаг 2: Обновляем photoPath в таблице Employee
  console.log('\n📝 Обновление photoPath сотрудников...');
  const employees = await prisma.employee.findMany({
    where: { photoPath: { not: null } },
    select: { id: true, photoPath: true },
  });

  let updatedPhotos = 0;
  for (const emp of employees) {
    if (!emp.photoPath) continue;
    const newPath = transliteratePath(emp.photoPath);
    if (newPath !== emp.photoPath) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: { photoPath: newPath },
      });
      updatedPhotos++;
    }
  }
  console.log(`   Обновлено photoPath: ${updatedPhotos} из ${employees.length}`);

  // Шаг 3: Обновляем filePath в таблице EmployeeDocument
  console.log('\n📝 Обновление путей документов...');
  const documents = await prisma.employeeDocument.findMany({
    select: { id: true, filePath: true },
  });

  let updatedDocs = 0;
  for (const doc of documents) {
    const newPath = transliteratePath(doc.filePath);
    if (newPath !== doc.filePath) {
      await prisma.employeeDocument.update({
        where: { id: doc.id },
        data: { filePath: newPath },
      });
      updatedDocs++;
    }
  }
  console.log(`   Обновлено путей документов: ${updatedDocs} из ${documents.length}`);

  // Итог
  console.log('\n══════════════════════════════════════════════════════');
  console.log('✅ МИГРАЦИЯ ЗАВЕРШЕНА');
  console.log('══════════════════════════════════════════════════════');
  console.log(`   Переименовано папок:     ${renamedCount}`);
  console.log(`   Обновлено photoPath:     ${updatedPhotos}`);
  console.log(`   Обновлено путей доков:   ${updatedDocs}`);

  // Показываем финальную структуру
  console.log('\n📁 Итоговая структура storage/companies/:');
  const finalFolders = fs.readdirSync(companiesDir);
  for (const f of finalFolders) {
    const empDir = path.join(companiesDir, f, 'employees');
    if (fs.existsSync(empDir)) {
      const count = fs.readdirSync(empDir).length;
      console.log(`   📂 ${f}/ (${count} сотрудников)`);
    }
  }
}

/**
 * Заменяет кириллические сегменты пути на латиницу.
 * Только сегмент имени компании (третий после storage/companies/).
 */
function transliteratePath(filePath) {
  if (!filePath) return filePath;
  // Нормализуем слэши
  const normalized = filePath.replace(/\\/g, '/');
  // Ищем паттерн storage/companies/{companyFolder}/
  const match = normalized.match(/^(.*storage\/companies\/)([^/]+)(\/.*)?$/);
  if (!match) return filePath;
  const prefix = match[1];
  const companyFolder = match[2];
  const suffix = match[3] || '';
  const newCompanyFolder = toFolderName(companyFolder);
  return prefix + newCompanyFolder + suffix;
}

/**
 * Рекурсивно перемещает файлы из src в dst (для объединения папок).
 */
function mergeDirectories(src, dst) {
  if (!fs.existsSync(dst)) {
    fs.mkdirSync(dst, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      mergeDirectories(srcPath, dstPath);
    } else {
      if (!fs.existsSync(dstPath)) {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }
}

main()
  .catch(e => { console.error('\n❌ Ошибка:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
