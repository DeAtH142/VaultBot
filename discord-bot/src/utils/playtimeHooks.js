// src/utils/playtimeHooks.js — ⏱️ Uygun sistem tespiti → süre sayacı köprüsü
//
// Tasarımdaki iki altın kural burada uygulanır:
//   • "Süre, sistem GERÇEKTEN başarıyla başladığında açılır."  → markStart()
//   • "Durdurma başarılı olunca oturum kapanır."               → markStop()
// Ayrıca syncUser() periyodik çalışır: kayıt açık görünürken modül gerçekten
// çalışmıyorsa (çökmüş/kapanmış) oturum kapatılır → sahipsiz sayaç kalmaz.
//
// Uygun sistem listesinin TEK kaynağı: utils/eligibility.js
// Not: Bu modül, okuyan tarafın referans döngüsünü kırmak için playtimeStore'u
// dinamik import eder (embeds.js → playtimeHooks.js → playtimeStore.js zinciri).

import { collectEligibleKeys, listEligibleModules } from './eligibility.js';

let S = null; // playtimeStore modülü (lazy)
async function store() {
  if (!S) S = await import('./playtimeStore.js');
  return S;
}
// Senkron erişilebilen sabit: STALE_MS
export const STALE_MS = 90_000;

/** `${userId}::${fullKey}` → { userId, fullKey, lastSeen } */
const liveKeys = new Map();
const mapKey = (userId, fullKey) => `${userId}::${fullKey}`;

/** Modül başarıyla BAŞLADIĞINDA çağır. (fire-and-forget kullanılabilir) */
export function markStart(userId, source, key) {
  if (!userId || key === undefined || key === null) return Promise.resolve();
  const fullKey = `${source}:${key}`;
  const now = Date.now();
  const existing = liveKeys.get(mapKey(userId, fullKey));
  if (existing) existing.lastSeen = now;
  else liveKeys.set(mapKey(userId, fullKey), { userId, fullKey, lastSeen: now });

  return store()
    .then(m => m.startSession(userId, fullKey)) // idempotent — çift saymaz
    .catch(err => console.error('[Playtime] markStart hatası:', err.message));
}

/** Modül başarıyla DURDUĞUNDA çağır. */
export function markStop(userId, source, key, reason = 'stopped') {
  if (!userId || key === undefined || key === null) return Promise.resolve();
  const fullKey = `${source}:${key}`;
  liveKeys.delete(mapKey(userId, fullKey));

  return store()
    .then(m => {
      const res = m.stopSession(userId, fullKey, reason);
      // 🎖️ Eşik dolduysa rolü vericiyi uyandır (asenkron — sayacı bloklamaz)
      if (res.accrual?.awarded?.length) triggerAwards(userId, res.accrual.awarded);
      // Kalan kayıt açık ama gerçekte hiçbir modül çalışmıyorsa VE bu kullanıcı için
      // başka bir canlı modül damgası yoksa onları da kapat. (Aksi hâlde ikinci sistem
      // kapalı görünse bile birleşim devam etmeliydi.)
      const stillTracked = [...liveKeys.values()].some(e => e.userId === userId);
      if (stillTracked) return res;
      if (m.getActiveKeys(userId).length > 0 && collectEligibleKeys(userId, {}).length === 0) {
        for (const k of m.getActiveKeys(userId)) m.stopSession(userId, k, 'no-live-module');
      }
      return res;
    })
    .catch(err => console.error('[Playtime] markStop hatası:', err.message));
}

/** Periyodik senkron: ölü modüllerin oturumlarını kapatır, canlı olanları açar. */
export async function syncUser(userId) {
  const m = await store();
  const now = Date.now();
  const eligible = collectEligibleKeys(userId, {});

  for (const k of eligible) {
    const entry = liveKeys.get(mapKey(userId, k));
    if (entry) entry.lastSeen = now;
  }

  const stored = m.getActiveKeys(userId);
  const stopped = stored.filter(k => !eligible.includes(k));
  for (const k of stopped) {
    // Bugün "başladı" damgası yeni olan kayıt, probe geçici olarak false dönse bile
    // kill edilmesin (modül login aşamasında olabilir). Yalnızca STALE sonrası kapanır.
    const entry = liveKeys.get(mapKey(userId, k));
    if (entry && now - entry.lastSeen < STALE_MS) continue;
    m.stopSession(userId, k, 'not-eligible');
    liveKeys.delete(mapKey(userId, k));
  }

  const started = eligible.filter(k => !stored.includes(k));
  for (const k of started) {
    m.startSession(userId, k);
    liveKeys.set(mapKey(userId, k), { userId, fullKey: k, lastSeen: now });
  }

  return { active: eligible, started, stopped };
}

/** Canlı modülü olan (izlenen) kullanıcılar */
/** Kazanımları kuyruğa ver (fire-and-forget), sonucu kalıcı kayda işle */
function triggerAwards(userId, awarded) {
  store()
    .then(async (m) => {
      const { processAwards } = await import('./awardQueue.js');
      const results = await processAwards(userId, awarded, (uid, tier, result) => {
        try { m.resolveAward(uid, tier, result); } catch (err) {
          console.error('[Playtime] Kazanım kaydı yazılamadı:', err.message);
        }
      });
      if (results.some(r => r.awarded)) {
        console.log(`[Playtime] 🎖️ ${userId} rol(lar) verildi: ${results.filter(r => r.awarded).map(r => r.tier).join(', ')}`);
      }
    })
    .catch(err => console.error('[Playtime] Kazanım işleme hatası:', err.message));
}

/** Boot sonrası bekleyen kazanımları tekrar dene (bot o an kapalıydıysa) */
export async function processPendingAwards() {
  const m = await store();
  const pending = m.getAllPendingAwards();
  if (pending.length === 0) return 0;

  const { processAwards } = await import('./awardQueue.js');
  let given = 0;
  for (const { userId, awards } of pending) {
    const results = await processAwards(userId, awards, (uid, tier, result) => {
      try { m.resolveAward(uid, tier, result); } catch { }
    });
    given += results.filter(r => r.awarded).length;
  }
  if (given > 0) console.log(`[Playtime] 🎖️ Boot sonrası ${given} bekleyen rol verildi.`);
  return given;
}

/** Canlı modülü olan (izlenen) kullanıcılar */
export function listTrackedUsers() {
  const users = new Set();
  for (const entry of liveKeys.values()) users.add(entry.userId);
  return [...users];
}

/** Kullanıcının süreye sayılan canlı modülleri */
export function getLiveKeys(userId) {
  return collectEligibleKeys(userId, {});
}

/** Panelde etiket göstermek için kaynak → { key, label, emoji } */
export function sourceMeta(source) {
  return listEligibleModules().find(m => m.key === source) || { key: source, label: source, emoji: '🔹' };
}

/** Bot yeniden başladığında in-memory canlı kayıtları sıfırla */
export function resetLiveKeys() {
  liveKeys.clear();
}


