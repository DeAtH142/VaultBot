// src/utils/kasaAnalytics.js
// 📊 Detaylı Kasa İstatistikleri — token başına bağlantı/kopma, sistem kullanım süreleri,
// toplam bot süresi ve kazanım sayılarını takip eder. (Lidya ve üstü paketler)
import fs from 'fs';
import path from 'path';
import { getTokens } from './tokenStore.js';

const FILE = path.join(process.cwd(), 'data', 'kasa_analytics.json');

function load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { return {}; }
}

function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function userRec(userId) {
  const data = load();
  if (!data[userId]) {
    data[userId] = {
      totalMs: 0,                    // toplam bot süresi (sistemler açıkken)
      systemMs: {},                  // { owo: 123456, spotify: 45678, ... }
      accounts: {},                  // { label: { reconnects, lastSeen, successOps } }
      awards: 0,                     // kazanılan rol/etkinlik sayısı
      lastUpdate: null,
    };
    save(data);
  }
  return load()[userId];
}

function withRec(userId, fn) {
  const data = load();
  if (!data[userId]) data[userId] = { totalMs: 0, systemMs: {}, accounts: {}, awards: 0, lastUpdate: null };
  fn(data[userId]);
  data[userId].lastUpdate = new Date().toISOString();
  save(data);
}

/** Süre ekle: bir sistem N ms çalıştı */
export function addSystemTime(userId, systemKey, ms) {
  withRec(userId, rec => {
    rec.totalMs += ms;
    rec.systemMs[systemKey] = (rec.systemMs[systemKey] || 0) + ms;
  });
}

/** Token bağlantı olayı kaydet (kopma/bağlanma) */
export function recordReconnect(userId, accountLabel, success = true) {
  withRec(userId, rec => {
    if (!rec.accounts[accountLabel]) rec.accounts[accountLabel] = { reconnects: 0, successOps: 0, lastSeen: null };
    rec.accounts[accountLabel].reconnects += 1;
    if (success) rec.accounts[accountLabel].successOps += 1;
    rec.accounts[accountLabel].lastSeen = new Date().toISOString();
  });
}

/** Başarılı işlem sayacı (hunt, bump, dm vb.) */
export function recordSuccess(userId, accountLabel) {
  withRec(userId, rec => {
    if (!rec.accounts[accountLabel]) rec.accounts[accountLabel] = { reconnects: 0, successOps: 0, lastSeen: null };
    rec.accounts[accountLabel].successOps += 1;
    rec.accounts[accountLabel].lastSeen = new Date().toISOString();
  });
}

/** Rol/etkinlik kazanınca çağır */
export function recordAward(userId) {
  withRec(userId, rec => { rec.awards += 1; });
}

/** fmt: ms → "12 sa 34 dk" */
function fmtMs(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} sa ${m} dk`;
  return `${m} dk`;
}

/** bar(pct, len) → '▰▰▱▱▱' */
function bar(pct, len = 14) {
  const filled = Math.round(Math.max(0, Math.min(100, pct)) / 100 * len);
  return '▰'.repeat(filled) + '▱'.repeat(len - filled);
}

/**
 * 📊 Tam analiz raporu — embed'e doğrudan beslenecek alanlar
 */
export function buildAnalytics(userId) {
  const rec = userRec(userId);
  const tokens = getTokens(userId);

  // En çok kullanılan sistemler (sıralı)
  const sysEntries = Object.entries(rec.systemMs || {}).sort((a, b) => b[1] - a[1]);
  const topSystem = sysEntries[0] || null;
  const maxSysMs = sysEntries[0]?.[1] || 1;

  const systemLines = sysEntries.slice(0, 6).map(([key, ms]) => {
    const pct = Math.round((ms / maxSysMs) * 100);
    return `> ▸ \`${key.padEnd(12)}\` ${bar(pct, 12)} \`${fmtMs(ms)}\``;
  });

  // Token stabilite tablosu
  const accLines = tokens.slice(0, 10).map((t, i) => {
    const label = t.username || t.label || `Hesap ${i + 1}`;
    const a = rec.accounts?.[label] || { reconnects: 0, successOps: 0 };
    const stability = a.reconnects === 0 ? '🟢 Mükemmel' : a.reconnects <= 2 ? '🟡 İyi' : '🔴 Riskli';
    return `> ${stability} **${label}** — 🔁 \`${a.reconnects}\` kopma · ✅ \`${a.successOps}\` işlem`;
  });

  return {
    totalMs: rec.totalMs || 0,
    totalText: fmtMs(rec.totalMs || 0),
    topSystem: topSystem ? { key: topSystem[0], text: fmtMs(topSystem[1]) } : null,
    systemLines,
    accLines,
    awards: rec.awards || 0,
    tokenCount: tokens.length,
  };
}
