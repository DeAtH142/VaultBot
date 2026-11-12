// src/utils/messageCleaner.js — 🧹 REXAL Mesaj & DM Temizlik Motoru
// Kasadaki bir hesabın:
//  1) Bir kullanıcıyla olan DM konuşmasındaki KENDİ mesajlarını geriye dönük siler
//  2) Belirtilen sunucudaki kanallarında KENDİ yazılı mesajlarını geriye dönük siler
// Hız limiti korumalı: silme arası ~800ms-1500ms, burst sonrası bekleme.
import { loginVaultAccount, destroyClient, sleep } from './selfbotHelpers.js';

export const DM_DELETE_DELAY_MS = 900;      // DM silme arası
export const GUILD_DELETE_DELAY_MS = 1200;  // sunucu mesaj silme arası
export const CHANNEL_GAP_MS = 3000;         // kanal geçişi arası

/**
 * Belirli kullanıcıyla olan DM'lerdeki kendi mesajlarını siler.
 * @returns {Promise<{ok:boolean, deleted:number, scanned:number, error?:string}>}
 */
export async function cleanDmWithUser(ownerId, tokenIndex, targetUserId, { maxAgeDays = 0, progressCb } = {}) {
  const login = await loginVaultAccount(ownerId, tokenIndex);
  if (!login.success) return { ok: false, deleted: 0, scanned: 0, error: login.error };

  const client = login.client;
  let deleted = 0, scanned = 0;

  try {
    const user = await client.users.fetch(targetUserId).catch(() => null);
    if (!user) return { ok: false, deleted, scanned, error: `Kullanıcı bulunamadı (${targetUserId})` };

    const dm = await user.createDM();
    // selfbot-v13: Channel#messagesPage(limit) geçmişi sayfalı çeker
    let messages = [];
    try {
      messages = await dm.messagesPage({ limit: 200 }).catch(() => []);
    } catch {
      messages = [];
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      // fallback: rest ile çek
      const raw = await client.rest.get(`/channels/${dm.id}/messages?limit=100`).catch(() => []);
      messages = raw ?? [];
    }

    const cutoff = maxAgeDays > 0 ? Date.now() - maxAgeDays * 86400000 : 0;
    const mine = messages.filter(m => m.author?.id === client.user.id && (m.deletable ?? true))
      .filter(m => cutoff === 0 || new Date(m.createdTimestamp || (m.timestamp ? Date.parse(m.timestamp) : 0)).getTime() >= cutoff);

    scanned = mine.length;
    for (const m of mine) {
      try {
        await client.rest.delete(`/channels/${dm.id}/messages/${m.id}`);
        deleted++;
      } catch (err) {
        if (/rate|limit/i.test(err?.message || '')) await sleep(4000);
      }
      if (progressCb) progressCb(deleted, scanned);
      await sleep(DM_DELETE_DELAY_MS);
    }

    return { ok: true, deleted, scanned, username: login.username };
  } catch (err) {
    return { ok: false, deleted, scanned, error: err.message };
  } finally {
    destroyClient(client);
  }
}

/**
 * Belirtilen sunucuda, hesabın yazdığı mesajları kanalları tarayarak siler.
 * @param {{channelLimit?:number, maxPerChannel?:number}} opts
 */
export async function cleanGuildMessages(ownerId, tokenIndex, guildId, { channelLimit = 40, maxPerChannel = 200, progressCb } = {}) {
  const login = await loginVaultAccount(ownerId, tokenIndex);
  if (!login.success) return { ok: false, deleted: 0, channels: 0, error: login.error };

  const client = login.client;
  let deleted = 0, channelsDone = 0;

  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return { ok: false, deleted, channels: 0, error: 'Sunucu bulunamadı (hesap o sunucuda değil olabilir)' };

    const channels = [...guild.channels.cache.values()]
      .filter(c => c.isTextBased?.() && c.viewable !== false)
      .slice(0, channelLimit);

    for (const ch of channels) {
      try {
        let msgs = [];
        try {
          msgs = await ch.messagesPage({ limit: 100 }).catch(() => []);
        } catch { msgs = []; }
        if (!Array.isArray(msgs) || msgs.length === 0) {
          const raw = await client.rest.get(`/channels/${ch.id}/messages?limit=100`).catch(() => []);
          msgs = raw ?? [];
        }
        const mine = msgs.filter(m => m.author?.id === client.user.id).slice(0, maxPerChannel);
        for (const m of mine) {
          try {
            await client.rest.delete(`/channels/${ch.id}/messages/${m.id}`);
            deleted++;
          } catch (err) {
            if (/rate|limit/i.test(err?.message || '')) await sleep(4000);
          }
          if (progressCb) progressCb(deleted, channelsDone);
          await sleep(GUILD_DELETE_DELAY_MS);
        }
      } catch { /* kanal erişilemiyor — geç */ }
      channelsDone++;
      await sleep(CHANNEL_GAP_MS);
    }

    return { ok: true, deleted, channels: channelsDone, username: login.username };
  } catch (err) {
    return { ok: false, deleted, channels: channelsDone, error: err.message };
  } finally {
    destroyClient(client);
  }
}
