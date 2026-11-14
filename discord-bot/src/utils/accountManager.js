// src/utils/accountManager.js
import { acquire, release } from './accountPool.js';
import { getTokens } from './tokenStore.js';

// Aktif client oturumları: `${userId}:${tokenIndex}` -> { client, status, customStatus }
const activeSessions = new Map();

const STATUS_MAP = {
  aktif: 'online',
  online: 'online',
  gorunmez: 'invisible',
  invisible: 'invisible',
  rahatsiz: 'dnd',
  dnd: 'dnd',
  bosta: 'idle',
  idle: 'idle',
};

/**
 * Hesaba bağlan ve durumunu Discord üzerinden canlı değiştir
 * @param {string} userId
 * @param {number} tokenIndex
 * @param {object} encryptedTokenObj
 * @param {string} targetStatus - 'online' | 'idle' | 'dnd' | 'invisible'
 * @param {string} customStatus - Opsiyonel durum yazısı (örn: /REXAL goated)
 */
export async function setAccountPresence(userId, tokenIndex, encryptedTokenObj, targetStatus, customStatus = '') {
  const sessionKey = `${userId}:${tokenIndex}`;
  const discordStatus = STATUS_MAP[targetStatus.toLowerCase()] || 'online';

  try {
    let session = activeSessions.get(sessionKey);

    const applyPresence = (client) => {
      try {
        const presenceData = { status: discordStatus };
        if (customStatus && customStatus.trim()) {
          presenceData.activities = [{ name: customStatus.trim(), type: 'CUSTOM' }];
        } else {
          presenceData.activities = [];
        }
        client.user.setPresence(presenceData);
      } catch (err) {
        client.user.setStatus(discordStatus);
      }
    };

    // Aynı hesap için ortak client (Ses AFK / AutoTyper ile paylaşılır).
    // Böylece presence değiştirmek ses bağlantısını DÜŞÜRMEZ.
    const acc = await acquire(userId, tokenIndex, 'online');
    if (!acc.success) {
      console.error(`[AccountManager] Giriş hatası (${sessionKey}):`, acc.error);
      return { success: false, error: acc.error };
    }

    const client = acc.client;
    applyPresence(client);
    activeSessions.set(sessionKey, { client, status: discordStatus, customStatus });
    return { success: true, username: client.user.tag };
  } catch (err) {
    console.error(`[AccountManager] Giriş hatası (${sessionKey}):`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Hesabın oturumunu kapat
 */
export function stopAccountSession(userId, tokenIndex) {
  const sessionKey = `${userId}:${tokenIndex}`;
  const session = activeSessions.get(sessionKey);

  if (session) {
    // Sadece online modülünün kirasını bırak — Ses AFK hâlâ kullanıyorsa client açık kalır
    release(userId, tokenIndex, 'online');
    activeSessions.delete(sessionKey);
    return true;
  }
  return false;
}

/**
 * Oturum aktif mi?
 */
export function isAccountSessionActive(userId, tokenIndex) {
  return activeSessions.has(`${userId}:${tokenIndex}`);
}

/**
 * Reboot Recovery: Bot başladığında durumu pasif olmayan hesapları otomatik geri yükle
 */
export async function recoverOnlineSessions() {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const DATA_PATH = path.join(process.cwd(), 'data', 'tokens.json');

  if (!fs.existsSync(DATA_PATH)) return;

  try {
    const store = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    for (const [userId, userData] of Object.entries(store)) {
      if (!userData.tokens) continue;
      userData.tokens.forEach((t, i) => {
        if (t.status && t.status !== 'pasif' && t.status !== 'gecersiz') {
          console.log(`[AccountManager] Reboot Recovery: ${t.username || t.label} (${t.status}) geri yükleniyor...`);
          setAccountPresence(userId, i, t, t.status, t.customStatus || '').catch(console.error);
        }
      });
    }
  } catch (err) {
    console.error('[AccountManager] Reboot recovery hatası:', err.message);
  }
}
