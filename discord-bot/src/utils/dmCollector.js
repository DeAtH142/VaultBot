// src/utils/dmCollector.js
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const archiver = require('archiver');

// Aktif oturum sahibi (Senin ID'n)
export let activeOwnerId = null;

// Dosyalar (ownerId -> [dosya yolları])
const userImages = new Map();

export async function downloadAttachment(ownerId, attachment) {
  const dir = path.join(process.cwd(), 'data', 'dm_images', ownerId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Dosya uzantısını koru (jpg, png vs)
  let ext = '.jpg';
  if (attachment.name) {
    const parts = attachment.name.split('.');
    if (parts.length > 1) ext = '.' + parts.pop();
  } else if (attachment.url) {
    const urlParts = attachment.url.split('?')[0].split('.');
    if (urlParts.length > 1) ext = '.' + urlParts.pop();
  }

  const safeName = `${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`;
  const filePath = path.join(dir, safeName);

  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error(`İndirilemedi: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  if (!userImages.has(ownerId)) userImages.set(ownerId, []);
  userImages.get(ownerId).push(filePath);

  return filePath;
}

export async function createZipFromUserImages(ownerId) {
  const files = userImages.get(ownerId) || [];
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

export function clearUserImages(ownerId) {
  const files = userImages.get(ownerId) || [];
  for (const filePath of files) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
  }
  userImages.delete(ownerId);

  const dir = path.join(process.cwd(), 'data', 'dm_images', ownerId);
  try { if (fs.existsSync(dir)) fs.rmdirSync(dir, { recursive: true }); } catch (e) {}
}

export function getUserImageCount(ownerId) {
  return (userImages.get(ownerId) || []).length;
}

export function startSession(ownerId) {
  activeOwnerId = ownerId;
  clearUserImages(ownerId);
}

export function stopSession() {
  activeOwnerId = null;
}
