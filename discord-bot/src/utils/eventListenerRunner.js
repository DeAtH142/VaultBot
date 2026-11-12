// src/utils/eventListenerRunner.js — 🎁🪙 Sürekli Dinleme Motoru
// Kasadaki hesapları uzun süreli açık oturum halinde tutar (Giveaway Farmer & Nitro Sniper için ortak).
// RAM dostu: her hesap için tek client, paylaşılabilir event handler'lar.
import { Client } from 'discord.js-selfbot-v13';
import { decrypt } from './crypto.js';
import { getToken } from './tokenStore.js';
import { readModuleJson, writeModuleJson } from './moduleStore.js';

const FILE = 'event_listeners.json';
const listeners = new Map(); // `${userId}:${tokenIndex}` -> { client, roles: {giveaway, nitro}, stats }

const NITRO_LINK_RE = /(discord\.gift\/|discord\.com\/gifts\/)([a-zA-Z0-9]{16,24})/g;

function buildLogin(tokenObj) {
  const rawToken = decrypt(tokenObj);
  return new Promise((resolve, reject) => {
    const client = new Client({ checkUpdate: false });
    const timeout = setTimeout(() => reject(new Error('Giriş zaman aşımı (15s)')), 15000);
    client.once('ready', () => { clearTimeout(timeout); resolve(client); });
    client.once('error', (e) => { clearTimeout(timeout); reject(e); });
    client.login(rawToken).catch((e) => { clearTimeout(timeout); reject(e); });
  });
}

/** Hesabı listener modunda başlat (zaten açıksa rolünü ekler) */
export async function ensureListener(userId, tokenIndex, roles = {}) {
  const key = `${userId}:${tokenIndex}`;
  let entry = listeners.get(key);
  if (entry) {
    Object.assign(entry.roles, roles);
    persist(userId, tokenIndex);
    return { alreadyRunning: true };
  }

  const tokenObj = getToken(userId, tokenIndex);
  if (!tokenObj) throw new Error('Hesap kasada bulunamadı!');
  const client = await buildLogin(tokenObj);

  entry = { client, roles: { ...roles }, stats: { giveawaysJoined: 0, nitroTried: 0 }, joinedAt: new Date().toISOString() };
  listeners.set(key, entry);

  // ── Giveaway Farmer ────────────────────────────────────────────────
  if (roles.giveaway) {
    client.on('messageCreate', async (message) => {
      try {
        if (!message.guild) return;
        const hasGa = message.content?.toLowerCase().includes('giveaway')
          && (message.reactions?.cache?.has('🎉') || message.content?.includes('🎉'));
        if (!hasGa) return;
        // zaten basılmış mı?
        const meReacted = message.reactions?.cache
          ?.get('🎉')?.users?.cache?.has(client.user.id);
        if (meReacted) return;
        await message.react('🎉');
        entry.stats.giveawaysJoined++;
        persistQuiet(userId, tokenIndex);
      } catch (err) {
        // reaction yetkisi yok / rate limit — sessiz geç
      }
    });
  }

  // ── Nitro Sniper ───────────────────────────────────────────────────
  if (roles.nitro) {
    client.on('messageCreate', async (message) => {
      try {
        const content = message.content || '';
        NITRO_LINK_RE.lastIndex = 0;
        const match = NITRO_LINK_RE.exec(content);
        if (!match) return;
        const code = match[2];
        entry.stats.nitroTried++;
        persistQuiet(userId, tokenIndex);
        try {
          await redeemNitroCompat(client, code);
          entry.stats.nitroClaimed = (entry.stats.nitroClaimed || 0) + 1;
          persistQuiet(userId, tokenIndex);
        } catch { /* kod geçersiz /Claimed — sessiz geç */ }
      } catch { }
    });
  }

  persist(userId, tokenIndex);
  return { alreadyRunning: false };
}

/** selfbot v13 client üzerinde nitro kodu redeem dener (kütüphane metoduna güvenli erişim) */
async function redeemNitroCompat(client, code) {
  if (typeof client.redeemNitro === 'function') {
    return client.redeemNitro(code);
  }
  // Fallback: doğrudan API çağrısı
  return client.api.post('/entitlements/gift-codes/' + code + '/redeem').catch((e) => { throw e; });
}

function persistQuiet(userId, tokenIndex) {
  try { persist(userId, tokenIndex); } catch { }
}

function persist(userId, tokenIndex) {
  const key = `${userId}:${tokenIndex}`;
  const entry = listeners.get(key);
  const store = readModuleJson(FILE);
  if (!entry) { delete store[key]; writeModuleJson(FILE, store); return; }
  store[key] = {
    roles: entry.roles,
    stats: entry.stats,
    joinedAt: entry.joinedAt,
  };
  writeModuleJson(FILE, store);
}

export function stopListener(userId, tokenIndex) {
  const key = `${userId}:${tokenIndex}`;
  const entry = listeners.get(key);
  if (!entry) { persist(userId, tokenIndex); return false; }
  try { entry.client.destroy(); } catch { }
  listeners.delete(key);
  persist(userId, tokenIndex);
  return true;
}

export function getListenerInfo(userId, tokenIndex) {
  const entry = listeners.get(`${userId}:${tokenIndex}`);
  if (!entry) return null;
  return { roles: entry.roles, stats: entry.stats, joinedAt: entry.joinedAt };
}

export function getListenersByRole(userId, role) {
  const out = [];
  for (const [key, entry] of listeners.entries()) {
    if (!key.startsWith(userId + ':')) continue;
    if (entry.roles[role]) out.push({ tokenIndex: Number(key.split(':')[1]), ...entry.roles, stats: entry.stats });
  }
  return out;
}

export function isListening(userId, tokenIndex, role) {
  const entry = listeners.get(`${userId}:${tokenIndex}`);
  return !!entry && !!entry.roles[role];
}

/** Reboot Recovery */
export async function recoverEventListeners() {
  const store = readModuleJson(FILE);
  for (const [key, cfg] of Object.entries(store)) {
    const [userId, idxStr] = key.split(':');
    console.log(`[EventListener] Reboot Recovery: ${key} geri yükleniyor...`);
    ensureListener(userId, Number(idxStr), cfg.roles || {}).catch(err =>
      console.error(`[EventListener] Recovery hatası (${key}):`, err.message));
  }
}
