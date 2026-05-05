'use strict';
/**
 * Regenerates all photo_norm.jpg and photo_thumb.jpg with correct EXIF rotation.
 * Run: docker exec hrms_backend node prisma/regen-photos.js
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const STORAGE = '/app/storage';

async function processDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await processDir(full);
    } else if (e.name === 'photo.jpg') {
      await processPhoto(full);
    }
  }
}

async function processPhoto(photoPath) {
  const normPath = photoPath.replace(/photo\.jpg$/, 'photo_norm.jpg');
  const thumbPath = photoPath.replace(/photo\.jpg$/, 'photo_thumb.jpg');

  try {
    const normBuf = await sharp(photoPath)
      .rotate()
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    fs.writeFileSync(normPath, normBuf);

    const thumbBuf = await sharp(photoPath)
      .rotate()
      .resize(80, 80, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toBuffer();
    fs.writeFileSync(thumbPath, thumbBuf);

    console.log(`OK  ${photoPath}  norm=${Math.round(normBuf.length/1024)}KB`);
  } catch (e) {
    console.log(`ERR ${photoPath}: ${e.message}`);
  }
}

processDir(STORAGE)
  .then(() => console.log('\nDone.'))
  .catch(e => console.error('Fatal:', e.message));
