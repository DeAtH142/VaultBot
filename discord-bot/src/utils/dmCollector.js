// src/utils/dmCollector.js
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const archiver = require('archiver'); // Archiver'ı ESM uyumlu hale getiriyoruz

// Kullanıcı bazlı geçici resim depolama (userId -> [resim yolları])
const userImages = new Map();

/**
 * DM'den gelen bir resim ekinini indirir ve kullanıcının listesine ekler.
 * @param {string} userId - Kullanıcı ID'si
 * @param {MessageAttachment} attachment - Discord eki
 * @returns {Promise<string>} İndirilen dosyanın yolu
 */
export async function downloadAttachment(userId, attachment) {
  const dir = path.join(process.cwd(), 'data', 'dm_images', userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Dosya adını güvenli hale getir
  const safeName = `${Date.now()}_${attachment.name.replace(/[^a-z0-9.]/gi, '_')}`;
  const filePath = path.join(dir, safeName);

  // Discord ekinin URL'sinden resmi indir
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error(`Resim indirilemedi: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  // Kullanıcının listesine ekle
  if (!userImages.has(userId)) userImages.set(userId, []);
  userImages.get(userId).push(filePath);

  return filePath;
}

/**
 * Kullanıcının topladığı tüm resimleri ZIP dosyasına dönüştürür.
 * @param {string} userId - Kullanıcı ID'si
 * @returns {Promise<Buffer>} ZIP dosyasının buffer hali
 */
export async function createZipFromUserImages(userId) {
  const files = userImages.get(userId) || [];
  if (files.length === 0) return null;

  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];

    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    // Her resmi ZIP'e ekle
    for (const filePath of files) {
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: path.basename(filePath) });
      }
    }

    archive.finalize();
  });
}

/**
 * Kullanıcının resim listesini ve geçici dosyalarını temizler.
 * @param {string} userId - Kullanıcı ID'si
 */
export function clearUserImages(userId) {
  const files = userImages.get(userId) || [];
  for (const filePath of files) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
  }
  userImages.delete(userId);

  // Boş klasörü de sil
  const dir = path.join(process.cwd(), 'data', 'dm_images', userId);
  try { if (fs.existsSync(dir)) fs.rmdirSync(dir, { recursive: true }); } catch (e) {}
}

/**
 * Kullanıcının topladığı resim sayısını döndürür.
 */
export function getUserImageCount(userId) {
  return (userImages.get(userId) || []).length;
}
