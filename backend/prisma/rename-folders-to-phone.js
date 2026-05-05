'use strict';
/**
 * Migrates employee storage folders from numeric ID to phone number.
 * Also updates photoPath in Employee and filePath in EmployeeDocument.
 * Run: docker exec hrms_backend node prisma/rename-folders-to-phone.js
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

function toPhoneDir(phone) {
  return phone.replace(/\D/g, ''); // "+992xxxxxxxxx" → "992xxxxxxxxx"
}

async function main() {
  const employees = await prisma.employee.findMany({
    select: { id: true, phone: true, photoPath: true },
  });

  let renamed = 0, skipped = 0, errors = 0;

  for (const emp of employees) {
    if (!emp.phone || !emp.photoPath) { skipped++; continue; }

    const phoneDir = toPhoneDir(emp.phone);
    if (!phoneDir) { skipped++; continue; }

    // Determine old folder from photoPath
    // e.g. "storage/companies/Favz/employees/1/photo.jpg"
    const oldPhotoPath = emp.photoPath;
    const oldFolder = path.dirname(oldPhotoPath); // "storage/companies/Favz/employees/1"
    const parentFolder = path.dirname(oldFolder);  // "storage/companies/Favz/employees"
    const oldIdStr = path.basename(oldFolder);     // "1"

    if (oldIdStr === phoneDir) { skipped++; continue; } // already renamed

    const newFolder = path.join(parentFolder, phoneDir);
    const absOld = path.resolve(oldFolder);
    const absNew = path.resolve(newFolder);

    // Skip if old folder doesn't exist
    if (!fs.existsSync(absOld)) { skipped++; continue; }

    // Skip if new folder already exists (avoid clobbering)
    if (fs.existsSync(absNew)) {
      console.log(`SKIP id=${emp.id}: target ${newFolder} already exists`);
      skipped++;
      continue;
    }

    try {
      // Rename the folder
      fs.renameSync(absOld, absNew);

      // Build new photoPath
      const photoFilename = path.basename(oldPhotoPath);
      const newPhotoPath = path.join(newFolder, photoFilename);

      // Update employee.photoPath
      await prisma.employee.update({
        where: { id: emp.id },
        data: { photoPath: newPhotoPath },
      });

      // Update all EmployeeDocument.filePath for this employee
      const docs = await prisma.employeeDocument.findMany({
        where: { employeeId: emp.id },
        select: { id: true, filePath: true },
      });
      for (const doc of docs) {
        if (doc.filePath && doc.filePath.includes(`/${oldIdStr}/`)) {
          const newFilePath = doc.filePath.replace(`/${oldIdStr}/`, `/${phoneDir}/`);
          await prisma.employeeDocument.update({
            where: { id: doc.id },
            data: { filePath: newFilePath },
          });
        }
      }

      console.log(`OK  id=${emp.id} → ${phoneDir}  (${newFolder})`);
      renamed++;
    } catch (e) {
      console.log(`ERR id=${emp.id}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Renamed: ${renamed}, Skipped: ${skipped}, Errors: ${errors}`);
}

main()
  .catch(e => { console.error('Fatal:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
