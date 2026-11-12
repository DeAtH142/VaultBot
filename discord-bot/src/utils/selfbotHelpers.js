// src/utils/selfbotHelpers.js — ✨ Ortak Selfbot Yardımcıları ✨
// Tüm yeni modüller (AutoTyper, VoiceAFK, OtoReact, AutoLeave, Joiner,
// ProfileChanger, FriendCleaner) tek yerden login/rate-limit/sleep kullanır.
import { Client } from 'discord.js-selfbot-v13';
import { decrypt } from './crypto.js';
import { getToken } from './tokenStore.js';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Vault'tan tokeni al, deşifre et ve selfbot client ile giriş yap.
 * @returns {Promise<{success:boolean, client?:Client, username?:string, error?:string}>}
 */
export async function loginVaultAccount(userId, tokenIndex, { timeoutMs = 15000 } = {}) {
  const tokenObj = getToken(userId, tokenIndex);
  if (!tokenObj) return { success: false, error: 'Hesap kasada bulunamadı!' };

  let rawToken;
  try {
    rawToken = decrypt(tokenObj);
  } catch (err) {
    return { success: false, error: 'Token deşifre edilemedi: ' + err.message };
  }

  const client = new Client({ checkUpdate: false });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Discord bağlantı zaman aşımı!')), timeoutMs);

      client.once('ready', () => { clearTimeout(timeout); resolve(); });
      client.once('error', (err) => { clearTimeout(timeout); reject(err); });
      client.login(rawToken).catch((err) => { clearTimeout(timeout); reject(err); });
    });

    return { success: true, client, username: client.user.tag };
  } catch (err) {
    try { client.destroy(); } catch { }
    return { success: false, error: err.message };
  }
}

/**
 * Bir selfbot client'ı güvenli şekilde kapatır (RAM temizliği / "sıfır iz").
 */
export function destroyClient(client) {
  try { client?.destroy(); } catch { }
}

/**
 * Bir dizi işlemi hesaplar arası rate-limit ile sırayla çalıştırır.
 * @param {Array<{userId:string, tokenIndex:number, label?:string}>} accounts
 * @param {(account:Object, result:{client, username})=>Promise<any>} job - her hesap için çalışacak iş
 * @param {number} interAccountDelayMs - hesaplar arası bekleme
 * @returns {Promise<Array>} hesap başı sonuç raporları
 */
export async function runSequentialWithDelay(accounts, job, interAccountDelayMs = 2000) {
  const reports = [];
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    if (i > 0) await sleep(interAccountDelayMs);
    const login = await loginVaultAccount(acc.userId, acc.tokenIndex);
    if (!login.success) {
      reports.push({ ...acc, ok: false, error: login.error });
      continue;
    }
    try {
      const res = await job(acc, login);
      reports.push({ ...acc, ok: true, username: login.username, ...res });
    } catch (err) {
      reports.push({ ...acc, ok: true, username: login.username, error: err.message });
    } finally {
      destroyClient(login.client);
    }
  }
  return reports;
}

/** Unicode emoji havuzu (oto-react için) */
export const UNICODE_EMOJIS = [
  '❤️', '🔥', '😂', '😍', '👍', '💯', '🎉', '✨', '😎', '🥳',
  '💜', '💙', '💚', '💛', '🧡', '🖤', '🤍', '👏', '🙌', '👀',
  '😭', '😱', '🤯', '🫡', '☠️', '🌟', '💫', '⚔️', '🛡️', '🏆',
];

/**
 * Sunucudaki kullanılabilir (kilitlenmemiş) custom emojileri döndürür.
 */
export function getGuildCustomEmojis(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return [];
  return guild.emojis.cache
    .filter(e => !e.deleted)
    .map(e => e.identifier) // "name:id" formatı — react ile uyumlu
    .slice(0, 60);
}

/** Hesap başı rapor embed'i üretir (DM raporlarında kullanılır) */
export function buildReportLines(reports) {
  return reports.map(r => {
    const name = r.username || r.label || `Hesap #${r.tokenIndex + 1}`;
    if (!r.ok) return `> 💔 **${name}** — Giriş başarısız: \`${r.error}\``;
    if (r.error) return `> ⚠️ **${name}** — ${r.summary || ''} hata: \`${r.error}\``;
    return `> ✅ **${name}** — ${r.summary || 'Tamamlandı'}`;
  }).join('\n') || '> ℹ️ Sonuç yok.';
}
