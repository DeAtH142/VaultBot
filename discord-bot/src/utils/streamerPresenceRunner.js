// src/utils/streamerPresenceRunner.js — 📺 REXAL Streamer Rich Presence Motoru
// Hesabı 7/24 "canlı yayında" görünür: STREAMING status + Twitch/YouTube link,
// profilinde mor canlı yayın rozeti, özel yayın başlığı ve (varsa) özel logo görseli.
//
// API: client.presence.set({ activities:[{ type:1 STREAMING, url, name, ... }], status })
// Görsel: activity.assets.large_image — botun CDN görseli veya mp:external proxy.
import { loginVaultAccount, destroyClient, sleep } from './selfbotHelpers.js';
import { saveSession, getAllSessions, deleteSession } from './sessionStore.js';

const MODULE = 'streamer';
const KEEPALIVE_MS = 4 * 60 * 1000; // 4 dk'da bir presence tazele

const activeStreams = new Map(); // `${userId}:${tokenIndex}` -> state

function applyPresence(state) {
  const a = state.config;
  try {
    const activity = {
      name: a.platform === 'youtube' ? 'YouTube' : 'Twitch',
      type: 1, // STREAMING
      url: a.streamUrl, // twitch.tv/... veya youtube.com/... zorunlu
      details: (a.title || 'Canlı Yayında!').slice(0, 128),
      state: (a.game || 'Just Chatting').slice(0, 128),
    };
    // Görsel: kullanıcı bir logo URL girdiyse external proxy ile ekle
    if (a.imageUrl && state.largeImageAsset) {
      activity.assets = { large_image: state.largeImageAsset, large_text: (a.title || 'Canlı Yayın').slice(0, 128) };
    }
    state.client.presence.set({
      activities: [activity],
      status: a.statusChoice || 'dnd',
      afk: false,
      since: 0,
    });
  } catch (err) {
    console.warn('[Streamer] presence hatası:', err.message);
  }
}

/** Kullanıcının verdiği görsel URL'ini Discord external asset proxy'sine çevirir */
async function resolveImageAsset(client, imageUrl) {
  if (!imageUrl) return null;
  try {
    const { RichPresence } = await import('discord.js-selfbot-v13');
    // Streamer görseli için kendi user-agent app id'si kullanılır
    const appId = '1336326530712000543';
    const ext = await RichPresence.getExternal(client, appId, imageUrl).catch(() => null);
    const hash = ext?.[0]?.external_asset_path;
    return hash ? `mp:${hash}` : null;
  } catch {
    return null;
  }
}

export async function startStreamerPresence(userId, tokenIndex, encryptedTokenObj, config) {
  const key = `${userId}:${tokenIndex}`;
  stopStreamerPresence(userId, tokenIndex, { silent: true });

  // Yayın linki doğrulaması
  const url = (config.streamUrl || '').trim();
  const okUrl = /^https?:\/\/(www\.)?(twitch\.tv\/[\w-]+|youtube\.com\/(watch\?v=[\w-]+|c\/[\w-]+|@[\w-]+))/i.test(url);
  if (!okUrl) {
    return { ok: false, error: 'Yayın linki geçersiz. Twitch kanal linki (twitch.tv/kullanici) veya YouTube video/kanal linki olmalı.' };
  }

  const statusMap = { online: 'online', idle: 'idle', dnd: 'dnd', invisible: 'invisible', gorunmez: 'invisible', bosta: 'idle', rahatsiz: 'dnd' };
  const status = statusMap[(config.statusChoice || '').toLowerCase()] || 'dnd';

  const login = await loginVaultAccount(userId, tokenIndex);
  if (!login.ok && !login.success) return { ok: false, error: login.error };

  const client = login.client;
  const state = {
    userId, tokenIndex, client,
    config: { ...config, streamUrl: url, statusChoice: status },
    keepAliveTimer: null,
    startedAt: Date.now(),
  };

  // Görsel varsa proxy'ye düşür (başarısızsa kapaksız devam)
  if (config.imageUrl) {
    state.largeImageAsset = await resolveImageAsset(client, config.imageUrl);
  }

  activeStreams.set(key, state);
  applyPresence(state);

  saveSession(MODULE, userId, tokenIndex, {
    streamUrl: url,
    title: config.title || '',
    game: config.game || '',
    imageUrl: config.imageUrl || '',
    statusChoice: status,
    platform: url.includes('youtube') ? 'youtube' : 'twitch',
  });

  startKeepAlive(state);
  return { ok: true, username: client.user?.tag };
}

function startKeepAlive(state) {
  clearInterval(state.keepAliveTimer);
  state.keepAliveTimer = setInterval(() => {
    if (state.client?.isReady?.()) applyPresence(state);
  }, KEEPALIVE_MS);
  state.keepAliveTimer.unref?.();
}

export function stopStreamerPresence(userId, tokenIndex, { silent = false } = {}) {
  const key = `${userId}:${tokenIndex}`;
  const state = activeStreams.get(key);
  if (!state) {
    deleteSession(MODULE, userId, tokenIndex);
    return { ok: !silent, error: silent ? null : 'Bu hesapta aktif yayın yok' };
  }
  clearInterval(state.keepAliveTimer);
  try {
    state.client.presence.set({ activities: [], status: 'online', afk: false, since: 0 });
  } catch { }
  destroyClient(state.client);
  activeStreams.delete(key);
  deleteSession(MODULE, userId, tokenIndex);
  return { ok: true };
}

export function stopAllStreams(userId) {
  let n = 0;
  for (const [key] of activeStreams) {
    if (key.startsWith(`${userId}:`)) {
      if (stopStreamerPresence(userId, Number(key.split(':')[1]), { silent: true }).ok) n++;
    }
  }
  return n;
}

export function isStreaming(userId, tokenIndex) {
  const s = activeStreams.get(`${userId}:${tokenIndex}`);
  return !!(s?.client?.isReady());
}

export function listStreams(userId) {
  return [...activeStreams.entries()]
    .filter(([k]) => k.startsWith(`${userId}:`))
    .map(([k, s]) => ({
      tokenIndex: Number(k.split(':')[1]),
      username: s.client?.user?.username ?? '',
      title: s.config.title || 'Canlı Yayında!',
      game: s.config.game || '',
      platform: s.config.streamUrl.includes('youtube') ? 'YouTube' : 'Twitch',
      streamUrl: s.config.streamUrl,
      minutes: Math.floor((Date.now() - s.startedAt) / 60000),
    }));
}

/** Reboot Recovery */
export async function recoverStreamerPresences() {
  const sessions = getAllSessions(MODULE);
  let revived = 0;
  for (const s of sessions) {
    const { decrypt } = await import('./crypto.js');
    const { getTokens } = await import('./tokenStore.js');
    const t = getTokens(s.userId)[s.tokenIndex];
    if (!t) { deleteSession(MODULE, s.userId, s.tokenIndex); continue; }
    const res = await startStreamerPresence(s.userId, s.tokenIndex, t, {
      streamUrl: s.streamUrl, title: s.title, game: s.game, imageUrl: s.imageUrl, statusChoice: s.statusChoice,
    });
    if (res.ok) revived++;
    await sleep(1200);
  }
  if (revived) console.log(`📺 [Streamer] Reboot Recovery: ${revived} yayını geri başlattı.`);
  return revived;
}
