// src/utils/accountPool.js — 🔗 HESAP BAŞINA TEK CLIENT HAVUZU
//
// ⚠️ SORUN: Her modül (Online, Ses AFK, AutoTyper, Spotify...) kendi Discord
// client'ını açıyordu. Aynı token ile ikinci bağlantı kurulunca Discord en
// son bağlantıyı tutup öncekini atar → ses kanalından düşme, presence kaybı.
// Belirti: "Bir hesap AFK bırakınca diğerinin ses bağlantısı gidiyor."
//
// ÇÖZÜM: `${userId}:${tokenIndex}` anahtarı için TEK client tutulur.
// Modüller client'ı buradan "kiralar" (retain) ve işi bitince bırakır (release).
// Son kullanıcı da bırakınca client kapatılır.
//
// Böylece aynı hesap kaç modülde çalışırsa çalışsın Discord'a SADECE
// BİR kez bağlanır → ses bağlantısı ve presence stabil kalır.

import { Client } from 'discord.js-selfbot-v13';
import { decrypt } from './crypto.js';
import { getToken } from './tokenStore.js';

const pool = new Map(); // key -> { client, ready, refs:Set<string>, username, connections:Map }

const keyOf = (userId, tokenIndex) => `${userId}:${tokenIndex}`;

// ── Kimlik kaydı: hangi hesap hangi Discord user'ı ────────────────────────
// İki hesaplık token aynı hesaba aitse (kazara çift eklenmiş token) bunu
// yakalamak için kullanılır; aynı Discord user'ı için ikinci client AÇILMAZ.
const identityIndex = new Map(); // discordUserId -> `${userId}:${tokenIndex}`

function attachKeepAlive(client) {
  // Discord ~ websocket kopmalarında client kendi reconnect yapar; burada
  // bilinçli bir müdahale yok, sadece hata loglaması yapıyoruz.
  client.on('error', (err) => {
    const tag = client.user?.tag || '?';
    console.warn(`[AccountPool] ⚠️ ${tag} hata: ${err?.message || err}`);
  });
  client.on('disconnect', () => {
    const tag = client.user?.tag || '?';
    console.warn(`[AccountPool] 🔌 ${tag} bağlantısı koptu — otomatik yeniden bağlanmayı bekliyor`);
  });
  client.on('shardError', (err) => {
    console.warn(`[AccountPool] 💥 shard hatası: ${err?.message || err}`);
  });
}

/**
 * Hesabın ortak client'ını al (yoksa bağlan).
 * @param {string} userId
 * @param {number} tokenIndex
 * @param {string} moduleName  kiralayan modül adı ("voiceafk" gibi)
 * @returns {Promise<{success:boolean, client?:Client, username?:string, shared?:boolean, error?:string}>}
 */
export async function acquire(userId, tokenIndex, moduleName) {
  const key = keyOf(userId, tokenIndex);
  const existing = pool.get(key);

  // Zaten bağlı → aynı client'ı paylaş (YENİ BAĞLANTI AÇMA!)
  if (existing && existing.client?.isReady?.()) {
    existing.refs.add(moduleName);
    return { success: true, client: existing.client, username: existing.username, shared: true };
  }

  // Aynı anda iki modül isterse: hazır olmasını bekle (çift bağlantı olmasın)
  if (existing && existing.ready) {
    const client = await existing.ready;
    if (client) {
      existing.refs.add(moduleName);
      return { success: true, client, username: existing.username, shared: true };
    }
    return { success: false, error: existing.error || 'Hesaba bağlanılamadı' };
  }

  // Yeni bağlantı
  const tokenObj = getToken(userId, tokenIndex);
  if (!tokenObj) return { success: false, error: 'Hesap kasada bulunamadı!' };

  let rawToken;
  try {
    rawToken = decrypt(tokenObj);
  } catch (err) {
    return { success: false, error: 'Token deşifre edilemedi: ' + err.message };
  }

  const client = new Client({ checkUpdate: false });
  const entry = { client, ready: null, refs: new Set([moduleName]), username: null, error: null, tokenIndex, userId };
  pool.set(key, entry);

  entry.ready = new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      entry.error = 'Discord bağlantı zaman aşımı (15s)';
      console.error(`[AccountPool] ⏱️ ${key} zaman aşımı`);
      try { client.destroy(); } catch { }
      if (pool.get(key) === entry) pool.delete(key);
      resolve(null);
    }, 15000);

    client.once('ready', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      entry.username = client.user.tag;

      // 🔍 Aynı Discord hesabı için başka kayıt var mı? (çift token koruması)
      const other = identityIndex.get(client.user.id);
      if (other && other !== key) {
        console.error(
          `[AccountPool] ❌ Aynı Discord hesabı iki kez kayıtlı: ${other} & ${key} (${entry.username}). ` +
          `İkinci bağlantı açmayı reddettim — kasada çift token var, birini silin.`,
        );
        entry.error = 'Bu Discord hesabı başka bir slotta zaten çalışıyor (çift token).';
        try { client.destroy(); } catch { }
        if (pool.get(key) === entry) pool.delete(key);
        resolve(null);
        return;
      }
      identityIndex.set(client.user.id, key);

      client.userId = client.user.id;
      attachKeepAlive(client);
      console.log(`[AccountPool] 🔗 Bağlandı: ${entry.username} (${key})`);
      resolve(client);
    });

    client.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      entry.error = err.message;
      if (pool.get(key) === entry) pool.delete(key);
      resolve(null);
    });

    client.login(rawToken).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      entry.error = err.message;
      if (pool.get(key) === entry) pool.delete(key);
      resolve(null);
    });
  });

  const readyClient = await entry.ready;
  if (!readyClient) return { success: false, error: entry.error || 'Giriş başarısız' };

  return { success: true, client: readyClient, username: entry.username, shared: false };
}

/**
 * Hesabı bırak. Son modül de bırakınca client kapanır.
 * @param {string} userId
 * @param {number} tokenIndex
 * @param {string} moduleName
 * @param {{ force?: boolean }} [opts]  force=true → refs'e bakmadan kapat
 */
export function release(userId, tokenIndex, moduleName, opts = {}) {
  const key = keyOf(userId, tokenIndex);
  const entry = pool.get(key);
  if (!entry) return false;

  entry.refs.delete(moduleName);

  if (opts.force || entry.refs.size === 0) {
    try { entry.client?.destroy(); } catch { }
    if (entry.client?.user?.id && identityIndex.get(entry.client.user.id) === key) {
      identityIndex.delete(entry.client.user.id);
    }
    pool.delete(key);
    console.log(`[AccountPool] 🔌 Kapatıldı: ${entry.username || key}`);
    return true;
  }

  console.log(`[AccountPool] ♻️ ${entry.username || key} korunuyor — kullanıcılar: ${[...entry.refs].join(', ')}`);
  return false;
}

/** Hesabın client'ı zaten bağlı mı? */
export function isConnected(userId, tokenIndex) {
  const entry = pool.get(keyOf(userId, tokenIndex));
  return !!(entry && entry.client?.isReady?.());
}

/** Bağlı client'ı (yeni bağlantı açmadan) al */
export function peek(userId, tokenIndex) {
  const entry = pool.get(keyOf(userId, tokenIndex));
  return entry && entry.client?.isReady?.() ? entry.client : null;
}

/** Hangi modüller bu hesabı kullanıyor */
export function refsOf(userId, tokenIndex) {
  const entry = pool.get(keyOf(userId, tokenIndex));
  return entry ? [...entry.refs] : [];
}

/** Havuzdaki tüm oturumlar (panel/diagnostik) */
export function poolSnapshot() {
  return [...pool.entries()].map(([key, e]) => ({
    key,
    username: e.username,
    ready: !!e.client?.isReady?.(),
    refs: [...e.refs],
  }));
}

/** Tüm bağlantıları kapat (bot kapanırken) */
export function destroyAll() {
  for (const [key, entry] of pool.entries()) {
    try { entry.client?.destroy(); } catch { }
    pool.delete(key);
  }
  identityIndex.clear();
}
