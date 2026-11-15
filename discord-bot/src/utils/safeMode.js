// src/utils/safeMode.js
// 🛡️ Anti-Ban Güvenli Mod — Zoktay ☄️ ve Esin 💛 paketleri için
// tüm selfbot aksiyonlarına insansı gecikme çarpanı uygular.
import fs from 'fs';
import path from 'path';
import { hasAntiBan } from './tierPerms.js';

const FILE = path.join(process.cwd(), 'data', 'safe_mode.json');

function load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { return {}; }
}

function save(d) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
}

/** Güvenli mod açık mı? (tier uygun + kullanıcı kapatmamış) */
export function isSafeMode(userId) {
  if (!hasAntiBan(userId)) return false;
  const d = load();
  // default: tier uygunsa AÇIK
  return d[userId] !== false;
}

export function setSafeMode(userId, enabled) {
  if (!hasAntiBan(userId)) return false;
  const d = load();
  d[userId] = !!enabled;
  save(d);
  return true;
}

/**
 * ⏱️ Bir aksiyonun temel gecikmesine güvenli mod çarpanı + jitter uygular.
 * @returns {number} ms cinsinden beklenmesi gereken süre
 */
export function safeDelay(userId, baseMs) {
  if (isSafeMode(userId)) {
    const jitter = baseMs * (0.15 + Math.random() * 0.2); // +%15-35 rastgele
    return Math.round(baseMs * 1.75 + jitter);            // ~1.75-2.1x daha yavaş
  }
  return Math.round(baseMs);
}

/** Panel metni için durum */
export function safeModeText(userId) {
  return isSafeMode(userId) ? '🛡️ `AÇIK` — insansı hız' : '⚡ `KAPALI` — standart hız';
}
