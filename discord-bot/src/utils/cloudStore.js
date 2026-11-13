// src/utils/cloudStore.js — ☁️ Firebase Firestore <-> data/ klasörü senkron katmanı
//
// GitHub Actions gibi geçici (ephemeral) ortamlarda bot her başladığında
// disk sıfırdan gelir. Bu katman:
//   1. Bot açılışta Firestore'daki "state" dokümanını data/ klasörüne yazar (indir),
//   2. data/ klasöründeki dosyalar değiştiğinde Firestore'a geri yükler (yükle).
// Böylece bot kapanıp açıldığında kaldığı yerden devam eder.
//
// Gerekli env değişkenleri:
//   FIREBASE_SERVICE_ACCOUNT -> Service Account JSON'unun TAMAMI (tek satır string)
//   FIRESTORE_COLLECTION     -> (opsiyonel, varsayılan: botState)
//   FIRESTORE_DOC            -> (opsiyonel, varsayılan: main)
//
// SYNC_FILES listesi dışındaki dosyalar (bot.lock, emoji_tmp, .corrupt-* vb.)
// senkronize edilmez.

import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');

// Senkron edilecek dosyalar (data/ altında)
export const SYNC_FILES = [
  'tokens.json',
  'sessions.json',
  'owo_configs.json',
  'owo_stats.json',
  'mc_afk.json',
  'event_listeners.json',
  'ai_keys.json',
  'playtime.json', // ⏱️ rol ilerlemesi — bot kapansa da kaybolmamalı
];

let firestoreDb = null;
let credBundle = null;
let watchTimer = null;
const WATCH_INTERVAL_MS = parseInt(process.env.CLOUD_SYNC_INTERVAL_MS || '15000', 10);
let lastHashes = {}; // son bilinen dosya hash'leri

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // Hem düz JSON hem base64 destekle
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch (err) {
    console.error('[CloudStore] FIREBASE_SERVICE_ACCOUNT çözümlenemedi:', err.message);
    return null;
  }
}

export function isCloudEnabled() {
  return !!getServiceAccount();
}

async function initFirestore() {
  if (firestoreDb) return firestoreDb;
  const sa = getServiceAccount();
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT ayarlanmamış');
  const admin = (await import('firebase-admin')).default;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  credBundle = admin;
  firestoreDb = admin.firestore();
  return firestoreDb;
}

function docRef() {
  const col = process.env.FIRESTORE_COLLECTION || 'botState';
  const doc = process.env.FIRESTORE_DOC || 'main';
  return firestoreDb.collection(col).doc(doc);
}

// ── İndir (Firestore -> data/) ──────────────────────────────────────────────
export async function pullFromCloud() {
  if (!isCloudEnabled()) {
    console.log('[CloudStore] Firebase yapılandırılmamış, bulut senkronu devre dışı.');
    return false;
  }
  await initFirestore();
  const snap = await docRef().get();
  if (!snap.exists) {
    console.log('[CloudStore] Firestore dokümanı boş — mevcut data/ ilk kez yüklenecek.');
    await pushToCloud();
    return true;
  }
  const state = snap.data() || {};
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let restored = 0;
  for (const file of SYNC_FILES) {
    if (typeof state[file] === 'string') {
      fs.writeFileSync(path.join(DATA_DIR, file), state[file], 'utf8');
      lastHashes[file] = simpleHash(state[file]);
      restored++;
    }
  }
  console.log(`[CloudStore] ☁️ Firestore'dan ${restored} dosya geri yüklendi.`);
  return true;
}

// ── Yükle (data/ -> Firestore) ──────────────────────────────────────────────
export async function pushToCloud() {
  if (!isCloudEnabled()) return false;
  if (!firestoreDb) await initFirestore();
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const payload = {};
  for (const file of SYNC_FILES) {
    const p = path.join(DATA_DIR, file);
    payload[file] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }
  payload._updatedAt = new Date().toISOString();
  // Firestore alan adları '.' içeremez; dosya isimleri güvende.
  await docRef().set(payload);
  for (const file of SYNC_FILES) {
    lastHashes[file] = simpleHash(payload[file]);
  }
  console.log('[CloudStore] ☁️ data/ klasörü Firestore\'a yedeklendi.');
  return true;
}

// ── Düzenli senkron (dosya değişince Firestore'a yaz) ──────────────────────
function simpleHash(str) {
  // hızlı FNV-1a benzeri hash — içeriğin değişip değişmediğini anlamak için
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function startPeriodicPush() {
  if (!isCloudEnabled()) return;
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = setInterval(async () => {
    try {
      const changed = [];
      for (const file of SYNC_FILES) {
        const p = path.join(DATA_DIR, file);
        const content = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
        const h = simpleHash(content);
        if (lastHashes[file] !== h) {
          changed.push(file);
        }
      }
      if (changed.length > 0) {
        console.log(`[CloudStore] Değişen dosyalar: ${changed.join(', ')}`);
        await pushToCloud();
      }
    } catch (err) {
      console.error('[CloudStore] Periyodik yükleme hatası:', err.message);
    }
  }, WATCH_INTERVAL_MS);
  console.log(`[CloudStore] 👁 Periyodik bulut yükleme açık (${WATCH_INTERVAL_MS} ms).`);
}

export function stopPeriodicPush() {
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = null;
}
