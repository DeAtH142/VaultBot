// src/utils/sessionHandover.js — 🔄 Blue-Green Oturum Geçişi
//
// GitHub Actions'ta 5 saatlik oturumlar arasında KESİNTİSİZ geçiş için
// Firestore tabanlı el sıkışma (handshake) katmanı.
//
// Akış:
//   1. Yeni oturum boot'ta `registerSession()` ile Firestore'a kaydolur
//      (sessionId, startedAt, status='starting').
//   2. Bot 'ready' olunca `markSessionReady()` status='ready' yazar.
//   3. ready olduktan sonra aktif (ready/starting) ÖNCEKİ oturum arar;
//      bulursa Firestore'a o eski oturuma 'draining' komutu yazar.
//   4. Eski oturum heartbeat döngüsünde draining komutunu görür →
//      graceful shutdown (push → exit 0). Yeni oturum zaten ayakta,
//      kesinti ~0 saniye.
//   5. Her oturum 30 sn'de bir lastHeartbeat günceller. Watchdog
//      (Actions tarafı) son heartbeat 20 dk'dan eskiyse botu yeniden başlatır.
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT  -> zaten var (cloudStore ile aynı)
//   SESSION_RUNTIME_MS        -> beklenen çalışma süresi (varsayılan 4.5 saat)
//   HEARTBEAT_INTERVAL_MS     -> varsayılan 30000

const SESSION_COLLECTION = 'botSessions';
const MAX_ACTIVE_AGE_MS = parseInt(process.env.SESSION_RUNTIME_MS || String(4.5 * 60 * 60 * 1000), 10);
const HEARTBEAT_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10);
const STALE_MS = 10 * 60 * 1000; // 10 dk heartbeat yoksa oturum ölü sayılır

let db = null;
let current = null;      // { sessionId, startedAt }
let beatTimer = null;
let draining = false;
let onDrainCallback = null;

function enabled() {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

async function getDb() {
  if (db) return db;
  const admin = (await import('firebase-admin')).default;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  db = admin.firestore();
  return db;
}

function makeId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── 1. Oturumu kaydet ────────────────────────────────────────────────────────
export async function registerSession() {
  if (!enabled()) return null;
  try {
    const d = await getDb();
    const sessionId = makeId();
    const startedAt = new Date().toISOString();
    current = { sessionId, startedAt };
    await d.collection(SESSION_COLLECTION).doc(sessionId).set({
      sessionId,
      startedAt,
      status: 'starting',
      lastHeartbeat: startedAt,
      runner: 'github-actions',
    });
    console.log(`[Handover] 🆔 Oturum kaydedildi: ${sessionId}`);
    return sessionId;
  } catch (err) {
    console.error('[Handover] Oturum kaydı başarısız (lokal devam):', err.message);
    return null;
  }
}

// ── 2. Hazır işareti + 3. eski oturuma draining komutu ──────────────────────
export async function markSessionReady() {
  if (!enabled() || !current) return;
  try {
    const d = await getDb();
    await d.collection(SESSION_COLLECTION).doc(current.sessionId).update({
      status: 'ready',
      lastHeartbeat: new Date().toISOString(),
    });

    // Önceki canlı oturumları bul → 'draining' komutu yaz
    const snap = await d.collection(SESSION_COLLECTION)
      .where('status', 'in', ['ready', 'starting'])
      .get();
    const now = Date.now();
    for (const doc of snap.docs) {
      if (doc.id === current.sessionId) continue;
      const data = doc.data() || {};
      const hb = Date.parse(data.lastHeartbeat || '') || 0;
      if (now - hb > STALE_MS) {
        // Ölü oturum — dokümanı temizle
        await doc.ref.update({ status: 'stale-cleanup', lastHeartbeat: new Date().toISOString() }).catch(() => { });
        continue;
      }
      console.log(`[Handover] 🔁 Önceki oturum ${doc.id} bulundu — draining komutu gönderiliyor.`);
      await doc.ref.update({ status: 'draining', drainRequestedBy: current.sessionId, drainRequestedAt: new Date().toISOString() });
    }
  } catch (err) {
    console.error('[Handover] ready işareti hatası:', err.message);
  }
}

// ── 4. Heartbeat döngüsü + draining yakalama ─────────────────────────────────
export function startHeartbeat(onDrain) {
  if (!enabled()) return;
  onDrainCallback = onDrain || null;
  if (beatTimer) clearInterval(beatTimer);
  beatTimer = setInterval(async () => {
    if (!current || draining) return;
    try {
      const d = await getDb();
      const ref = d.collection(SESSION_COLLECTION).doc(current.sessionId);
      await ref.update({ lastHeartbeat: new Date().toISOString() });

      const doc = await ref.get();
      const status = doc.data()?.status;
      if (status === 'draining' && !draining) {
        draining = true;
        console.log('[Handover] 🛑 Yeni oturum hazır — bu oturum kapatılıyor (draining)...');
        clearInterval(beatTimer);
        if (onDrainCallback) await onDrainCallback();
        else process.exit(0);
      }

      // Güvenlik: beklenen süreyi aşıyorsak kendini kapat (Actions timeout yedeği)
      const age = Date.now() - Date.parse(current.startedAt);
      if (age > MAX_ACTIVE_AGE_MS + 10 * 60 * 1000) {
        console.log('[Handover] ⏰ Maksimum oturum süresi aşıldı — kontrollü kapanış.');
        clearInterval(beatTimer);
        draining = true;
        if (onDrainCallback) await onDrainCallback();
        else process.exit(0);
      }
    } catch (err) {
      console.error('[Handover] heartbeat hatası:', err.message);
    }
  }, HEARTBEAT_MS);
  console.log(`[Handover] 💓 Heartbeat açık (${HEARTBEAT_MS} ms).`);
}

// ── 7. Kapanışta aktif oturum bilgisini güncelle ─────────────────────────────
export async function markSessionStopped(reason = 'shutdown') {
  if (!enabled() || !current) return;
  try {
    clearInterval(beatTimer);
    const d = await getDb();
    await d.collection(SESSION_COLLECTION).doc(current.sessionId).set({
      sessionId: current.sessionId,
      startedAt: current.startedAt,
      status: 'stopped',
      stoppedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      reason,
    }, { merge: true });
    console.log(`[Handover] 🏁 Oturum kapatıldı (${reason}).`);
  } catch (err) {
    console.error('[Handover] kapanış işareti hatası:', err.message);
  }
}
