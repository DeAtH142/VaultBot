// src/utils/accountManager.js
import { Client } from 'discord.js-selfbot-v13';
import { decrypt } from './crypto.js';
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

    if (session && session.client && session.client.isReady()) {
      applyPresence(session.client);
      session.status = discordStatus;
      session.customStatus = customStatus;
      return { success: true, username: session.client.user.tag };
    }

    // Tokeni çöz
    const rawToken = decrypt(encryptedTokenObj);

    // Yeni self client başlat
    const client = new Client({ checkUpdate: false });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Hesaba giriş zaman aşımına uğradı (15s).'));
      }, 15000);

      client.once('ready', () => {
        clearTimeout(timeout);
        try {
          applyPresence(client);
          activeSessions.set(sessionKey, { client, status: discordStatus, customStatus });
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      client.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      client.login(rawToken).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

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

  if (session && session.client) {
    try {
      session.client.destroy();
    } catch (e) {}
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
