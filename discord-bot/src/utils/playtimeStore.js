// src/utils/playtimeStore.js — ⏱️ REXAL ROL İLERLEME MOTORU
//
// Mantık (tasarım dokümanı):
//   • Süre, butona basıldığı anda değil, sistem GERÇEKTEN çalışmaya başladığında sayılır.
//   • Kullanıcının en az bir uygun sistemi aktifken tek bir sayaç ilerler; aynı zaman
//     aralığı ikinci kez sayılmaz → "birleşim (union) süresi".
//        09:00-15:00 + 12:00-17:00 = 8 saat  (11 değil, 6 de değil)
//   • Bot kapalıyken geçen süre SAYILMAZ: her açılışta önceki oturum
//     `lastSeen` (canlılık damgası) anında kesilir.
//   • Roller "ek süre" mantığıyla sıralıdır; eşik dolunca ilerleme sıfırlanır,
//     biriken toplam ve toplam aktif süre kalıcı olarak korunur.
//   • Tüm hesap saniye hassasiyetinde tutulur → saat yuvarlama kaybı yok.
//
// Kalıcılık: data/playtime.json (cloudStore.SYNC_FILES içinde → Firestore'a gider).
// Aynı süreçte çalışan tüm modüller tek path yazdığından dosya erişimi serileştirilir.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// process.cwd() değil, dosya konumuna göre: bot hangi dizinden başlatılırsa başlatılsın
// aynı data/ klasörüne yazar (cloudStore ile aynı kök).
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'playtime.json');

/** Bir oturumun bu kadar süre dokunulmadan kalması = kopmuş kabul edilir */
export const STALE_MS = 90_000;

/**
 * Rol aşamaları — her satır O rol için gereken EK süreyi saat cinsinden tutar.
 * toplam alanı yalnızca belge/panel gösterimi içindir.
 */
export const ROLE_TIERS = [
  { tier: 1, requiredHours: 5, totalHours: 5, name: 'Başlangıç' },
  { tier: 2, requiredHours: 8, totalHours: 13, name: 'Aktif' },
  { tier: 3, requiredHours: 12, totalHours: 25, name: 'Düzenli' },
  { tier: 4, requiredHours: 14, totalHours: 39, name: 'Sadık' },
  { tier: 5, requiredHours: 16, totalHours: 55, name: 'Deneyimli' },
  { tier: 6, requiredHours: 20, totalHours: 75, name: 'Veteran' },
  { tier: 7, requiredHours: 24, totalHours: 99, name: 'Elit' },
  { tier: 8, requiredHours: 30, totalHours: 129, name: 'Usta' },
  { tier: 9, requiredHours: 32, totalHours: 161, name: 'Efsane' },
  { tier: 10, requiredHours: 35, totalHours: 196, name: 'REXAL' },
];

// ── Disk erişimi ───────────────────────────────────────────────────────────
function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, '{}', 'utf8');
}

function readStore() {
  ensureFile();
  try {
    let raw = fs.readFileSync(STORE_PATH, 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // BOM koruması
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('[Playtime] playtime.json okunamadı:', err.message);
    try { fs.copyFileSync(STORE_PATH, STORE_PATH + '.corrupt-' + Date.now()); } catch { }
    return {};
  }
}

function writeStore(store) {
  ensureFile();
  const tmp = STORE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_PATH); // atomik — yarım dosya corruption'ı önlenir
}

// ── Yardımcılar ────────────────────────────────────────────────────────────
function toSec(ms) {
  return Math.max(0, Math.floor(ms / 1000));
}

/**
 * Kayıtlı oturumları normalize eder.
 *  • normalizeSessions(..., {keepZero:true}) → süresi 0 olan yeni oturumlar da döner
 *  • Kayıt formatı: { key, startedAt, lastSeen, status }
 *  • Durum (active/closed) dosyada SAKLANIR; sadece yeni kayıtlar için STALE hesaplanır.
 */
function normalizeSessions(list, now, opts = {}) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    if (!s || typeof s !== 'object' || !s.key) continue;
    const startedAt = Number(s.startedAt) || 0;
    if (!startedAt) continue;
    // Ölmüş botun son damgası 'now'dan ileride olamaz (saat kayması koruması)
    const lastSeen = Math.min(Number(s.lastSeen) || startedAt, now);
    if (lastSeen < startedAt) continue;
    if (lastSeen === startedAt && !opts.keepZero) continue;

    // Bayatlık kararı SAKLANAN duruma göre verilir.
    // Aksi hâlde "şimdi açıldı" oturumu sıfır uzunlukta olduğu için yanlışlıkla kapanmış sayılırdı.
    //   • 'closed'  → kapalı kalır
    //   • 'active'  → lastSeen tazeyse canlı; bayatsa (bot ölmüş) kapalı
    //   • durum yok → eski kayıt: bayatlığa bakılır
    let status;
    if (s.status === 'closed') {
      status = 'closed';
    } else if (s.status === 'active') {
      status = lastSeen >= now - STALE_MS ? 'active' : 'closed';
    } else {
      status = lastSeen >= now - STALE_MS ? 'active' : 'closed';
    }

    out.push({
      key: String(s.key),
      startedAt,
      lastSeen,
      status,
      // Birleşim hesabı için görünüm alanları
      start: startedAt,
      end: lastSeen,
    });
  }
  return out.sort((a, b) => a.start - b.start);
}

function ensureUserRecord(store, userId) {
  if (!store[userId]) {
    store[userId] = {
      userId,
      createdAt: new Date().toISOString(),
      firstPlayedAt: null,
      lastPlayedAt: null,
      tierIndex: 0,
      cumulativeSec: 0,
      totalSec: 0,
      sessions: [],
      current: {},
      closedSessions: 0,
      lastAward: null,
      pendingAwards: [],
      awardErrors: [],
    };
  }
  const rec = store[userId];
  // Eski/eksik kayıtları tamamla (migration)
  rec.tierIndex = Number(rec.tierIndex) || 0;
  rec.cumulativeSec = Number(rec.cumulativeSec) || 0;
  rec.totalSec = Number(rec.totalSec) || 0;
  rec.closedSessions = Number(rec.closedSessions) || 0;
  rec.sessions = Array.isArray(rec.sessions) ? rec.sessions : [];
  rec.current = rec.current && typeof rec.current === 'object' ? rec.current : {};
  rec.pendingAwards = Array.isArray(rec.pendingAwards) ? rec.pendingAwards : [];
  return rec;
}

/** Birleşim: en az bir oturumun açık olduğu toplam gerçek süre (saniye) */
function unionSeconds(sessions) {
  let total = 0;
  let curStart = null;
  let curEnd = null;
  for (const s of sessions) {
    if (curStart === null) {
      curStart = s.start;
      curEnd = s.end;
      continue;
    }
    if (s.start <= curEnd) {
      curEnd = Math.max(curEnd, s.end); // örtüşme veya değme → birleştir
    } else {
      total += curEnd - curStart;
      curStart = s.start;
      curEnd = s.end;
    }
  }
  if (curStart !== null) total += curEnd - curStart;
  return toSec(total);
}

// ── Oturum açma / kapatma ──────────────────────────────────────────────────
/**
 * Sistem gerçekten çalışmaya başladığında çağır.
 * @param {string} userId  Discord kullanıcı id (sürenin sayıldığı kişi)
 * @param {string} key     benzersiz oturum anahtarı, ör. "online:0"
 * @returns {{ started: boolean, already?: boolean }}
 */
export function startSession(userId, key) {
  if (!userId || !key) return { started: false };
  const now = Date.now();
  const store = readStore();
  const rec = ensureUserRecord(store, userId);
  rec.sessions = normalizeSessions(rec.sessions, now, { keepZero: true });

  const live = rec.sessions.find(s => s.key === key && s.status === 'active');
  if (live) {
    // Aynı sistem tekrar "başlatıldı" → çift saymayı engelle, sadece canlılık damgasını yenile
    live.lastSeen = now;
    rec.current[key] = new Date(live.startedAt).toISOString();
    writeStore(store);
    return { started: true, already: true };
  }

  // Yeni oturum açıkça 'active' işaretlenir; önceki kapalı kayıtlar geçmişte kalır.
  rec.sessions.push({ key, startedAt: now, lastSeen: now, status: 'active' });
  rec.current[key] = new Date(now).toISOString();
  if (!rec.firstPlayedAt) rec.firstPlayedAt = new Date(now).toISOString();
  rec.lastPlayedAt = new Date(now).toISOString();
  writeStore(store);
  console.log(`[Playtime] ▶ ${userId} için oturum başladı: ${key}`);
  return { started: true };
}

/**
 * Sistem gerçekten durduğunda çağır. Etkili süre biriktiriliyor mu? Sonuçla döner.
 * @returns {{ stopped: boolean, accrual: object|null }}
 */
export function stopSession(userId, key, reason = 'stopped') {
  if (!userId || !key) return { stopped: false, accrual: null };
  const now = Date.now();
  const store = readStore();
  const rec = ensureUserRecord(store, userId);
  rec.sessions = normalizeSessions(rec.sessions, now, { keepZero: true });

  let changed = false;
  for (const s of rec.sessions) {
    if (s.status === 'closed') continue; // zaten kapanmış oturum iki kez işlenmez
    if (s.key === key) {
      if (s.status === 'active') {
        s.lastSeen = now;
        changed = true;
      }
      s.status = 'closed';
    }
  }
  if (rec.current[key] !== undefined) {
    delete rec.current[key];
    changed = true;
  }
  if (!changed) return { stopped: false, accrual: null };

  rec.lastPlayedAt = new Date(now).toISOString();

  // Bu oturum son canlı oturumsa (birleşim bitti) → birikimi işle
  const stillLive = rec.sessions.some(s => s.status === 'active');
  let accrual = null;
  if (!stillLive) {
    const seconds = unionSeconds(rec.sessions);
    accrual = applyAccrual(rec, seconds);
    rec.sessions = [];
  }
  writeStore(store);
  console.log(`[Playtime] ⏹ ${userId} oturumu kapandı: ${key} (${reason})`);
  return { stopped: true, accrual };
}

// ── Birikim & rol eşikleri ─────────────────────────────────────────────────
function applyAccrual(rec, seconds) {
  if (!(seconds > 0)) return null;

  rec.totalSec += seconds;
  rec.cumulativeSec += seconds;

  const awarded = [];
  let guard = 0;
  // Sıradaki rolün eşiği kadar süre varsa: rol alınır, bakiye sıfırdan devam eder.
  // (Büyük bir birikim birden fazla role yetebilir → while.)
  while (rec.tierIndex < ROLE_TIERS.length && guard++ < ROLE_TIERS.length + 1) {
    const step = ROLE_TIERS[rec.tierIndex];
    const need = step.requiredHours * 3600;
    if (rec.cumulativeSec < need) break;

    rec.cumulativeSec -= need;
    rec.tierIndex += 1;
    const meta = ROLE_TIERS[rec.tierIndex - 1];
    const nextMeta = ROLE_TIERS[rec.tierIndex] || null;
    awarded.push({
      tier: meta.tier,
      name: meta.name,
      at: new Date().toISOString(),
      requiredHours: meta.requiredHours,
      nextRequiredHours: nextMeta ? nextMeta.requiredHours : null,
      // Rol henüz verilmedi → "bekliyor". awardQueue başarıyla verince temizlenir.
      pending: true,
    });
  }

  if (awarded.length > 0) {
    rec.lastAward = awarded[awarded.length - 1];
    rec.pendingAwards = [...(rec.pendingAwards || []), ...awarded];
    console.log(`[Playtime] 🏆 ${rec.userId} rol eşiği doldu: tier ${rec.tierIndex}`);
  }
  return { seconds, awarded };
}

// ── Canlılık damgası (bot kapalıyken süre yazılmasın) ──────────────────────
/** Çalışan tüm oturumların lastSeen'ini "şimdi" yapar. index.js içinde 30 sn'de bir. */
export function heartbeat() {
  const now = Date.now();
  const store = readStore();
  let touched = false;
  for (const rec of Object.values(store)) {
    if (!rec || !Array.isArray(rec.sessions)) continue;
    for (const s of rec.sessions) {
      if (s.status !== 'closed' && s.startedAt) {
        s.lastSeen = now;
        touched = true;
      }
    }
  }
  if (touched) writeStore(store);
  return touched;
}

/**
 * Boot recovery: bot yeniden açıldığında önceki oturumları lastSeen anında keser.
 * Böylece bot kapalıyken geçen süre kesinlikle sayılmaz.
 */
export function reconcileOnBoot() {
  const now = Date.now();
  const store = readStore();
  let closedCount = 0;
  const reports = [];

  for (const rec of Object.values(store)) {
    if (!rec || !Array.isArray(rec.sessions) || rec.sessions.length === 0) continue;
    rec.sessions = normalizeSessions(rec.sessions, now, { keepZero: true });
    if (rec.sessions.length === 0) continue;

    const live = rec.sessions.filter(s => s.status === 'active');
    const wasMissing = live.length === 0;
    // Bot yeniden açıldı → önceki süreçteki HİÇBİR oturum canlı kalamaz.
    // Kesin sınır: son canlılık damgası (lastSeen). Kapalıyken geçen süre sayılmaz.
    if (!wasMissing) {
      for (const s of rec.sessions) s.status = 'closed';
      closedCount++;
    }
  }
  if (closedCount > 0) writeStore(store);

  // Kullanıcı bazında ilerlemeyi tazele
  const snap = readStore();
  for (const rec of Object.values(snap)) {
    if (!rec || !Array.isArray(rec.sessions) || rec.sessions.length === 0) continue;
    // Kayıtlar ham JSON'dan geldiği için durum bilgisi normalize edilir
    rec.sessions = normalizeSessions(rec.sessions, now, { keepZero: true });
    if (rec.sessions.length === 0) { delete rec.current; continue; }
    const stillLive = rec.sessions.some(s => s.status === 'active');
    if (!stillLive) {
      const seconds = unionSeconds(rec.sessions);
      const accrual = applyAccrual(rec, seconds);
      rec.sessions = [];
      delete rec.current;
      if (accrual) reports.push({ userId: rec.userId, ...accrual });
    }
  }
  writeStore(snap);
  return { closedCount, reports };
}

/**
 * Bot kapandığında (graceful shutdown) canlı oturumları şu ana kadar kapat.
 * Tekrar açılışta kaldığı yerden devam edebilmesi için kayıt korunur.
 */
export function closeAllOnShutdown() {
  const now = Date.now();
  const store = readStore();
  for (const rec of Object.values(store)) {
    if (!rec || !Array.isArray(rec.sessions)) continue;
    for (const s of rec.sessions) {
      if (s.status !== 'closed') {
        if (now > s.startedAt) s.lastSeen = now;
        s.status = 'closed';
      }
    }
  }
  writeStore(store);
}

// ── Okuma API'si ───────────────────────────────────────────────────────────
/** Kullanıcının canlı oturum anahtarları */
export function getActiveKeys(userId) {
  const store = readStore();
  const rec = store[userId];
  if (!rec || !Array.isArray(rec.sessions)) return [];
  const now = Date.now();
  return normalizeSessions(rec.sessions, now, { keepZero: true })
    .filter(s => s.status === 'active')
    .map(s => s.key);
}

export function isPlaying(userId) {
  return getActiveKeys(userId).length > 0;
}

/** Henüz Discord rolü verilmemiş kazanımlar */
export function getPendingAwards(userId) {
  const store = readStore();
  const rec = store[userId];
  return rec && Array.isArray(rec.pendingAwards) ? [...rec.pendingAwards] : [];
}

/**
 * Kazanımı "işlendi" olarak işaretle (başarı → sil, hata → hata kaydı tut).
 * @param {string} userId
 * @param {number} tier
 * @param {{success:boolean, error?:string}} result
 */
export function resolveAward(userId, tier, result) {
  const store = readStore();
  const rec = store[userId];
  if (!rec || !Array.isArray(rec.pendingAwards)) return false;

  const idx = rec.pendingAwards.findIndex(p => p.tier === tier);
  if (idx === -1) return false;

  if (result && result.success) {
    rec.pendingAwards.splice(idx, 1);
    rec.lastAward = { ...rec.lastAward, tier, pending: false };
  } else {
    rec.pendingAwards[idx].pending = true;
    rec.pendingAwards[idx].lastError = result?.error || 'bilinmeyen hata';
    rec.pendingAwards[idx].lastAttempt = new Date().toISOString();
  }
  writeStore(store);
  return true;
}

/** Tüm kullanıcıların bekleyen kazanımları (boot sonrası tekrar denemesi için) */
export function getAllPendingAwards() {
  const store = readStore();
  const out = [];
  for (const [userId, rec] of Object.entries(store)) {
    if (rec && Array.isArray(rec.pendingAwards) && rec.pendingAwards.length > 0) {
      out.push({ userId, awards: [...rec.pendingAwards] });
    }
  }
  return out;
}

/** playtime.json'da kaydı olan tüm kullanıcılar (boot sonrası senkron için) */
export function getPlaytimeUsers() {
  const store = readStore();
  return Object.keys(store).filter(id => store[id] && typeof store[id] === 'object');
}

/**
 * Kullanıcının ilerleme özeti (panel için).
 * Canlı oturum varsa "şu an sayılan süre" de hesaba katılır (kaydetmeden okur).
 */
export function getUserProgress(userId) {
  const store = readStore();
  const rec = store[userId];
  if (!rec) {
    return buildProgress(userId, [], 0, 0, 0);
  }
  const now = Date.now();
  const sessions = normalizeSessions(rec.sessions, now, { keepZero: true });
  const live = sessions.filter(s => s.status === 'active');

  // Canlı oturum varsa, henüz diske yazılmamış (devam eden) birleşim süresini de ekle
  const liveSec = live.length > 0 ? unionSeconds(sessions) : 0;

  const totalSec = (Number(rec.totalSec) || 0);
  const cumulative = (Number(rec.cumulativeSec) || 0) + liveSec;
  return buildProgress(userId, live, totalSec + liveSec, cumulative, rec.tierIndex, rec);
}

function buildProgress(userId, liveSessions, totalSec, cumulativeSec, tierIndex = 0, rec = null) {
  const ti = Math.max(0, Math.min(Number(tierIndex) || 0, ROLE_TIERS.length));
  const next = ti < ROLE_TIERS.length ? ROLE_TIERS[ti] : null;
  const requiredSec = next ? next.requiredHours * 3600 : 0;
  const remainingSec = next ? Math.max(0, requiredSec - cumulativeSec) : 0;
  const progressPct = next ? Math.min(100, Math.round((cumulativeSec / requiredSec) * 100)) : 100;

  return {
    userId,
    liveSessions,
    live: liveSessions.length > 0,
    activeKeys: liveSessions.map(s => s.key),
    liveSessionSec: liveSessions.reduce((a, s) => a + toSec(s.end - s.start), 0),
    cumulativeSec,
    requiredSec,
    remainingSec,
    progressPct,
    tierIndex: ti,
    tierCount: ROLE_TIERS.length,
    currentTier: ti > 0 ? ROLE_TIERS[ti - 1] : null,
    nextTier: next,
    totalSec,
    totalHourText: fmtHours(totalSec),
    cumulativeText: fmtHours(cumulativeSec),
    requiredText: next ? `${next.requiredHours} sa` : '—',
    remainingText: next ? fmtHours(remainingSec) : 'Tamamlandı',
    lastPlayedAt: rec?.lastPlayedAt || null,
    firstPlayedAt: rec?.firstPlayedAt || null,
    lastAward: rec?.lastAward || null,
    pendingAwards: rec?.pendingAwards || [],
  };
}

// ── Biçimlendirme ─────────────────────────────────────────────────────────
export function fmtHours(sec) {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
  if (m > 0) return s > 0 ? `${m} dk ${s} sn` : `${m} dk`;
  return `${s} sn`;
}

export function fmtTimer(sec) {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

export { STORE_PATH };
