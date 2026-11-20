// scripts/session-watchdog.mjs — 🩺 Bot yaşıyor mu?
//
// Firestore'daki son oturumun lastHeartbeat'ine bakar.
// Son 10 dakikada heartbeat yoksa "DEAD" yazar → workflow yeniden başlatır.
// Bot çalışıyorsa "ALIVE", Firestore yapılandırılmamışsa "NO_FIREBASE" yazar.
//
// Kullanım: node scripts/session-watchdog.mjs

import fs from 'node:fs';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.log('NO_FIREBASE');
  process.exit(0);
}

let sa;
try {
  sa = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
} catch (e) {
  console.log('NO_FIREBASE');
  process.exit(0);
}

const STALE_MS = 10 * 60 * 1000;

const { default: admin } = await import('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db.collection('botSessions')
  .where('status', 'in', ['ready', 'starting', 'draining'])
  .orderBy('startedAt', 'desc')
  .limit(5)
  .get();

if (snap.empty) {
  console.log('DEAD');
  process.exit(0);
}

const now = Date.now();
let alive = false;
for (const doc of snap.docs) {
  const d = doc.data();
  const hb = Date.parse(d.lastHeartbeat || '') || 0;
  if (now - hb < STALE_MS) { alive = true; break; }
}

console.log(alive ? 'ALIVE' : 'DEAD');
process.exit(0);
