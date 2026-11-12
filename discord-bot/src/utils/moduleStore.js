// src/utils/moduleStore.js — ✨ Genel amaçlı kalıcı JSON store ✨
// Her modül kendi data dosyasını bu yardımcı ile yönetir (atomik yazım + bozuk JSON koruması).
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readModuleJson(filename, fallback = {}) {
  const p = path.join(DATA_DIR, filename);
  ensureDir(DATA_DIR);
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error(`[ModuleStore] ${filename} okunamadı:`, err.message);
    try { fs.copyFileSync(p, p + '.corrupt-' + Date.now()); } catch { }
    return fallback;
  }
}

export function writeModuleJson(filename, data) {
  const p = path.join(DATA_DIR, filename);
  ensureDir(DATA_DIR);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p); // atomik yazım — yarım dosya corruption'ı önlenir
}
