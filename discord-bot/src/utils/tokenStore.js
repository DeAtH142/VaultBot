// src/utils/tokenStore.js
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR  = path.join(process.cwd(), 'data');
const DATA_PATH = path.join(DATA_DIR, 'tokens.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_PATH)) fs.writeFileSync(DATA_PATH, '{}', 'utf8');
}

function readStore() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (err) {
    // Bozuk / okunamayan JSON'da botun çökmesini engelle
    console.error('[TokenStore] tokens.json okunamadı, sıfırlanıyor:', err.message);
    const backup = DATA_PATH + '.corrupt-' + Date.now();
    try { fs.copyFileSync(DATA_PATH, backup); } catch {}
    fs.writeFileSync(DATA_PATH, '{}', 'utf8');
    return {};
  }
}

function writeStore(store) {
  ensureFile();
  fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2), 'utf8');
}

/** Kullanıcı için şifrelenmiş token kaydet */
export function saveToken(userId, encryptedObj) {
  const store = readStore();
  if (!store[userId]) store[userId] = { tokens: [] };
  store[userId].tokens.push({
    ...encryptedObj,
    username: encryptedObj.username || encryptedObj.label || `Hesap ${store[userId].tokens.length + 1}`,
    accountUserId: encryptedObj.accountUserId || '',
    addedAt: new Date().toISOString(),
    label: encryptedObj.label || `Hesap ${store[userId].tokens.length + 1}`,
    status: encryptedObj.status || 'pasif',
  });
  writeStore(store);
  return store[userId].tokens.length;
}

/** Geçersiz durumundaki tokenleri sil */
export function deleteInvalidTokens(userId) {
  const store = readStore();
  if (store[userId]?.tokens) {
    const beforeCount = store[userId].tokens.length;
    store[userId].tokens = store[userId].tokens.filter(t => t.status !== 'gecersiz');
    writeStore(store);
    return beforeCount - store[userId].tokens.length;
  }
  return 0;
}

/** Kullanıcının tüm tokenlerini getir */
export function getTokens(userId) {
  const store = readStore();
  return store[userId]?.tokens ?? [];
}

/** Kullanıcının belirli bir tokenini getir (index) */
export function getToken(userId, index) {
  const tokens = getTokens(userId);
  return tokens[index] ?? null;
}

/** Token durumunu güncelle */
export function updateTokenStatus(userId, index, status) {
  const store = readStore();
  if (store[userId]?.tokens?.[index]) {
    store[userId].tokens[index].status = status;
    writeStore(store);
    return true;
  }
  return false;
}

/** Token sil */
export function deleteToken(userId, index) {
  const store = readStore();
  if (store[userId]?.tokens?.[index]) {
    store[userId].tokens.splice(index, 1);
    writeStore(store);
    return true;
  }
  return false;
}

/** Kullanıcının tüm tokenlerini sil */
export function deleteAllTokens(userId) {
  const store = readStore();
  if (store[userId]) {
    delete store[userId];
    writeStore(store);
    return true;
  }
  return false;
}

/** Toplam token sayısı */
export function getTokenCount(userId) {
  return getTokens(userId).length;
}
