// src/utils/dmCollector.js
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const archiver = require('archiver');

// Kullanıcı bazlı geçici resim depolama
const userImages = new Map();

// Kullanıcı bazlı aktif toplama oturumları (userId -> boolean)
export const activeSessions = new Set();

export async function downloadAttachment(userId, attachment) {
  const dir = path.join(process.cwd(), 'data', 'dm_images', userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const safeName = `${Date.now()}_${attachment.name.replace(/[^a-z0-9.]/gi, '_')}`;
  const filePath = path.join(dir, safeName);

  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error(`İndirilemedi: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  if (!userImages.has(userId)) userImages.set(userId, []);
  userImages.get(userId).push(filePath);

  return filePath;
}

export async function createZipFromUserImages(userId) {
  const files = userImages.get(userId) || [];
  if (files.length === 0) return null;

  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    for (const filePath of files) {
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: path.basename(filePath) });
      }
    }

    archive.finalize();
  });
}

export function clearUserImages(userId) {
  const files = userImages.get(userId) || [];
  for (const filePath of files) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
  }
  userImages.delete(userId);

  const dir = path.join(process.cwd(), 'data', 'dm_images', userId);
  try { if (fs.existsSync(dir)) fs.rmdirSync(dir, { recursive: true }); } catch (e) {}
}

export function getUserImageCount(userId) {
  return (userImages.get(userId) || []).length;
}
