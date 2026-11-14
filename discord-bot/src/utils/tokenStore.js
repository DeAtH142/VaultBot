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
  if (!store[userId]) store[userId] = { tokens: [], subscription: { type: 'Ücretsiz', expiresAt: null, capacity: 2, roleId: null, guildId: null } };
  
  // Kapasite kontrolü
  const userCapacity = getUserCapacity(userId);
  if (store[userId].tokens.length >= userCapacity) {
    throw new Error(`Kapasite dolu! Maksimum ${userCapacity} token ekleyebilirsiniz.`);
  }
  
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

/** Kullanıcının abonelik bilgisini getir */
export function getUserSubscription(userId) {
  const store = readStore();
  if (!store[userId]) {
    return { type: 'Ücretsiz', expiresAt: null, capacity: 2, roleId: null, guildId: null };
  }
  return store[userId].subscription || { type: 'Ücretsiz', expiresAt: null, capacity: 2, roleId: null, guildId: null };
}

/** Kullanıcının kapasite limitini getir */
export function getUserCapacity(userId) {
  const sub = getUserSubscription(userId);
  // Süre kontrolü
  if (sub.expiresAt && sub.expiresAt !== 'infinite') {
    const now = Date.now();
    const expires = new Date(sub.expiresAt).getTime();
    if (now > expires) {
      // Süresi dolmuş, ücretsiz'e düş ve geçersiz tokenleri temizle
      setUserSubscription(userId, { type: 'Ücretsiz', expiresAt: null, capacity: 2, roleId: null, guildId: null });
      return 2;
    }
  }
  return sub.capacity || 2;
}

/** Kullanıcının token sayısının kapasiteyi aşıp aşmadığını kontrol et */
export function checkCapacityOverflow(userId) {
  const tokens = getTokens(userId);
  const capacity = getUserCapacity(userId);
  return tokens.length > capacity;
}

/** Kullanıcının abonelik bilgisini güncelle */
export function setUserSubscription(userId, subscription) {
  const store = readStore();
  if (!store[userId]) store[userId] = { tokens: [], subscription: { type: 'Ücretsiz', expiresAt: null, capacity: 2, roleId: null, guildId: null } };
  store[userId].subscription = { ...store[userId].subscription, ...subscription };
  writeStore(store);
  return store[userId].subscription;
}

/** Tüm kullanıcıların listesini getir (admin için) */
export function getAllUsers() {
  const store = readStore();
  return Object.keys(store).map(userId => ({
    userId,
    tokenCount: store[userId].tokens?.length || 0,
    subscription: store[userId].subscription || { type: 'Ücretsiz', expiresAt: null, capacity: 2 },
    tokens: store[userId].tokens || [],
  }));
}

/** Geçersiz tokenleri otomatik scan et ve sil, limiti düşür */
export async function scanAndCleanInvalidTokens(userId, selfbotTest) {
  const store = readStore();
  if (!store[userId]?.tokens) return { cleaned: 0, valid: 0 };
  
  let cleaned = 0;
  let valid = 0;
  const tokens = [...store[userId].tokens];
  
  for (let i = tokens.length - 1; i >= 0; i--) {
    const isValid = await selfbotTest(tokens[i]);
    if (!isValid) {
      tokens.splice(i, 1);
      cleaned++;
    } else {
      valid++;
    }
  }
  
  store[userId].tokens = tokens;
  
  // Eğer geçersiz token bulunduysa ve limiti aştıysa ücretsiz'e düşür
  if (cleaned > 0 && tokens.length < getUserCapacity(userId)) {
    store[userId].subscription = { type: 'Ücretsiz', expiresAt: null, capacity: 2, roleId: null, guildId: null };
  }
  
  writeStore(store);
  return { cleaned, valid };
}
