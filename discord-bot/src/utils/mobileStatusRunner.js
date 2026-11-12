// src/utils/mobileStatusRunner.js ✨ Mobil Status Motoru
// Hesapları Discord'un gateway'ine ANDROID istemcisi olarak identify eder —
// böylece profilinde yeşil mobil tik (📱 mobilde çevrimiçi) görünür.
//
// ÖNEMLİ: discord.js-selfbot-v13'te `client.user.setPresence()` YOKTUR!
// Doğru API: `client.presence.set({...})` — ClientPresence#set STATUS_UPDATE
// (OP 3) komutu gateway'e gönderir.
//
// Ekstra dayanıklılık:
//  - Keep-alive ping: her 5 dakikada presence yeniden uygulanır (Discord bazı
//    durumlarda presence'i "unutur", özellikle uzun idle oturumlarında).
//  - Otomatik yeniden bağlanma: bağlantı koparsa (close/disconnect) backoff ile
//    en fazla 5 deneme kadar tekrar bağlanır; başarısız olursa state temiz kalır.
//  - Rate-limit friendly: yeniden bağlanma bekleme 5s → 10s → 20s → 40s → 80s.

import { Client } from 'discord.js-selfbot-v13';
import { decrypt } from './crypto.js';
import { getTokens } from './tokenStore.js';
import {
  saveSession, getSession, getUserSessions, getAllSessions, deleteSession,
} from './sessionStore.js';

const MODULE = 'mobilstatus';

// Aktif runtime oturumları: `${userId}:${tokenIndex}` -> session objesi
const activeSessions = new Map();

const KEEPALIVE_MS = 5 * 60 * 1000;   // 5 dk — presence'i Discord'a yeniden hatırlat
const MAX_RECONNECT = 5;              // kopma sonrası max yeniden bağlanma denemesi

/**
 * Mobil istemci kimliği (identify properties) — Discord'un Android uygulaması gibi görünür.
 */
const MOBILE_WS_PROPS = {
  os: 'Android',
  browser: 'Discord Android',
  release_channel: 'stable',
  client_version: '1.0.9210',
  os_version: '34',
  os_arch: 'arm64-v8a',
  app_arch: 'arm64-v8a',
  system_locale: 'tr-TR',
  has_client_mods: false,
  browser_user_agent:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.6998.205 Mobile Discord-Android/265.0 - irc',
  browser_version: 'Chrome/134.0.6998.205',
  os_sdk_version: '34',
  client_build_number: 455964,
  native_build_number: 69976,
  client_event_source: null,
  client_app_state: 'focused',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Durum girdisini Discord status'üne çevir (TR alias desteği) */
function mapStatus(targetStatus) {
  const m = {
    online: 'online', gorunmez: 'invisible', invisible: 'invisible',
    dnd: 'dnd', rahatsiz: 'dnd', bosta: 'idle', idle: 'idle', aktif: 'online',
  };
  return m[String(targetStatus || '').toLowerCase()] || 'online';
}

/**
 * Tek hesabı mobil istemci olarak bağlar.
 * @param {string} userId
 * @param {number} tokenIndex
 * @param {object} encryptedTokenObj
 * @param {string} targetStatus - 'online' | 'bosta' | 'rahatsiz' | 'gorunmez' (alias destekli)
 * @param {string} customStatus - opsiyonel durum yazısı
 */
export async function startMobileStatus(userId, tokenIndex, encryptedTokenObj, targetStatus = 'online', customStatus = '') {
  const sessionKey = `${userId}:${tokenIndex}`;
  const discordStatus = mapStatus(targetStatus);

  // Zaten çalışıyorsa sadece presence'i güncelle (çift bağlantı açma!)
  if (activeSessions.has(sessionKey)) {
    const existing = activeSessions.get(sessionKey);
    if (existing?.client?.isReady()) {
      applyPresence(existing, discordStatus, customStatus);
      persist(userId, tokenIndex, targetStatus, customStatus);
      existing.targetStatus = targetStatus;
      existing.customStatus = customStatus || '';
      return { success: true, username: existing.client.user?.tag, alreadyRunning: true };
    }
    // Ölü oturum — temizle
    cleanupSession(sessionKey);
  }

  try {
    // Token çöz
    const rawToken = decrypt(encryptedTokenObj);

    const client = await connectMobile(rawToken);
    const session = {
      client,
      targetStatus,
      customStatus: customStatus || '',
      reconnectTries: 0,
      keepAliveTimer: null,
      userId,
      tokenIndex,
    };
    activeSessions.set(sessionKey, session);

    applyPresence(session, discordStatus, customStatus);
    persist(userId, tokenIndex, targetStatus, customStatus);
    wireReconnect(sessionKey, session, rawToken);
    startKeepAlive(sessionKey, session);

    return { success: true, username: client.user?.tag };
  } catch (err) {
    console.error(`[MobilStatus] Giriş hatası (${sessionKey}):`, err.message);
    return { success: false, error: err.message };
  }
}

/** Mobil istemci olarak giriş yapan client döndürür */
async function connectMobile(rawToken, timeoutMs = 30000) {
  const client = new Client({
    checkUpdate: false,
    ws: { properties: MOBILE_WS_PROPS },
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mobil giriş zaman aşımı (30s).')), timeoutMs);
    client.once('ready', () => { clearTimeout(timeout); resolve(); });
    client.once('error', (err) => { clearTimeout(timeout); reject(err); });
    client.login(rawToken).catch((err) => { clearTimeout(timeout); reject(err); });
  });
  return client;
}

/**
 * Presence'i DOĞRU API ile uygular: client.presence.set(...)
 * (selfbot-v13'te client.user.setPresence yoktur!)
 */
function applyPresence(session, statusInput, customStatus) {
  const status = mapStatus(statusInput);
  try {
    const payload = {
      status,
      afk: status === 'idle',
      since: status === 'idle' ? Date.now() : 0,
      activities: customStatus?.trim()
        ? [{ name: customStatus.trim(), type: 4, state: customStatus.trim() }]
        : [],
    };
    session.client.presence.set(payload);
  } catch (err) {
    console.warn('[MobilStatus] Presence ayarlanamadı:', err.message);
  }
}

/** Her KEEPALIVE_MS'te bir presence'i yeniden uygular (Discord "unutmasını" önler) */
function startKeepAlive(sessionKey, session) {
  clearInterval(session.keepAliveTimer);
  session.keepAliveTimer = setInterval(() => {
    if (!session.client?.isReady?.()) return; // kopmuş — reconnect devrede
    applyPresence(session, session.targetStatus, session.customStatus);
  }, KEEPALIVE_MS);
  session.keepAliveTimer.unref?.();
}

/** Bağlantı koparsa otomatik yeniden bağlanır (backoff: 5→10→20→40→80 sn) */
function wireReconnect(sessionKey, session, rawToken) {
  session.client.on('close', async () => {
    if (session.reconnecting) return;
    session.reconnecting = true;
    console.warn(`[MobilStatus] Bağlantı koptu (${sessionKey}) — yeniden bağlanılıyor...`);

    for (let attempt = 1; attempt <= MAX_RECONNECT; attempt++) {
      const delay = Math.min(80000, 5000 * 2 ** (attempt - 1));
      await sleep(delay);
      try {
        const newClient = await connectMobile(rawToken);
        try { session.client.destroy(); } catch { }
        session.client = newClient;
        session.reconnectTries = 0;
        session.reconnecting = false;
        applyPresence(session, session.targetStatus, session.customStatus);
        wireReconnect(sessionKey, session, rawToken);
        console.log(`✅ [MobilStatus] Yeniden bağlandı: ${sessionKey} (deneme ${attempt})`);
        return;
      } catch (err) {
        console.warn(`[MobilStatus] Yeniden bağlanma ${attempt}/${MAX_RECONNECT} başarısız (${sessionKey}): ${err.message}`);
      }
    }
    session.reconnecting = false;
    console.error(`[MobilStatus] ${sessionKey} — yeniden bağlanılamadı, oturum bırakıldı. (Reboot Recovery tekrar deneyecek)`);
    cleanupSession(sessionKey);
  });
}

function cleanupSession(sessionKey) {
  const s = activeSessions.get(sessionKey);
  if (s) {
    clearInterval(s.keepAliveTimer);
    try { s.client.destroy(); } catch { }
    activeSessions.delete(sessionKey);
  }
}

function persist(userId, tokenIndex, targetStatus, customStatus) {
  saveSession(MODULE, userId, tokenIndex, {
    targetStatus, customStatus: customStatus || '',
  });
}

/**
 * Oturumu kapat.
 */
export function stopMobileStatus(userId, tokenIndex) {
  cleanupSession(`${userId}:${tokenIndex}`);
  deleteSession(MODULE, userId, tokenIndex);
  return true;
}

export function isMobileStatusRunning(userId, tokenIndex) {
  const s = activeSessions.get(`${userId}:${tokenIndex}`);
  return !!(s?.client?.isReady());
}

export function getMobileStatusStats(userId, tokenIndex) {
  const session = getSession(MODULE, userId, tokenIndex);
  return {
    running: isMobileStatusRunning(userId, tokenIndex),
    targetStatus: session?.targetStatus || null,
    customStatus: session?.customStatus || '',
  };
}

export function getUserMobileStatusSessions(userId) {
  return getUserSessions(MODULE, userId);
}

export function getAllMobileStatusSessions() {
  return getAllSessions(MODULE);
}

/**
 * Reboot Recovery — eski oturumları tekrar bağla.
 */
export async function recoverMobileStatus() {
  const sessions = getAllSessions(MODULE);
  let recovered = 0;

  for (const s of sessions) {
    const tokens = getTokens(s.userId);
    const t = tokens[s.tokenIndex];
    if (!t) {
      console.warn(`[MobilStatus] Token bulunamadı: ${s.userId}:${s.tokenIndex} — oturum siliniyor.`);
      deleteSession(MODULE, s.userId, s.tokenIndex);
      continue;
    }

    const res = await startMobileStatus(s.userId, s.tokenIndex, t, s.targetStatus, s.customStatus);
    if (res.success) recovered++;
    await sleep(1200); // giriş gecikmesi — rate limit için
  }

  console.log(`📱 [MobilStatus] Reboot Recovery: ${recovered}/${sessions.length} oturum geri yüklendi.`);
  return recovered;
}
