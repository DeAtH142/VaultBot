// src/utils/oyunPresenceRunner.js — 🎮 REXAL Oyun Fake Presence Motoru
// Bu motor, selfbot üzerinden istediğin oyunu, otomatik arama ve kapak resmiyle 7/24 oynuyor gibi gösterir.
import { loginVaultAccount, destroyClient, sleep } from './selfbotHelpers.js';
import { readSessions, writeSessions } from './sessionStore.js';
import { RichPresence } from 'discord.js-selfbot-v13';

const runningSessions = new Map(); // `${userId}:${tokenIndex}` -> state
const WATCHDOG_MS = 60_000;
let watchdogTimer = null;

// Discord dış görsel (kapak) proxy sistemi
const SPOTIFY_APP_ID = '1336326530712000543'; // Discord bize uygulama bazlı resim çekme izni verdiği için bunu kullanıyoruz.
const coverProxyCache = new Map(); 

async function resolveCoverAsset(client, imageUrl) {
  if (!imageUrl) return undefined;
  if (coverProxyCache.has(imageUrl)) return coverProxyCache.get(imageUrl);
  try {
    const ext = await RichPresence.getExternal(client, SPOTIFY_APP_ID, imageUrl);
    const hash = ext?.[0]?.external_asset_path;
    if (!hash) return undefined;
    const asset = `mp:${hash}`;
    coverProxyCache.set(imageUrl, asset);
    return asset;
  } catch (err) {
    console.error('🎮 [OyunPresence] Kapak resmi proxy hatası:', err.message);
    return undefined;
  }
}

// ── Watchdog: Kopan bağlantıları otomatik kurtarır ──
function startWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(async () => {
    for (const [key, state] of [...runningSessions.entries()]) {
      try {
        const dead = !state.client || state.client.ws?.status !== 0 && state.client.ws?.status !== undefined;
        const disconnected = state.client?.ws && typeof state.client.ws.status === 'number' && state.client.ws.status !== 0;
        if (dead || disconnected) {
          console.log(`🎮 [OyunPresence] ⚠️ Bağlantı koptu (${key}) — Otomatik kurtarma başlatılıyor...`);
          try { destroyClient(state.client); } catch { }
          runningSessions.delete(key);
          const sess = readOyunStore()[key];
          if (sess?.active && sess.gameData) {
            const res = await startOyunPresence(state.userId, state.tokenIndex, sess.gameData, {
              statusChoice: sess.statusChoice,
            });
            if (res.success) console.log(`🎮 [OyunPresence] ✅ ${key} yeniden bağlandı.`);
          }
        }
      } catch (err) {
        console.error('🎮 [OyunPresence] Watchdog hatası:', err.message);
      }
    }
  }, WATCHDOG_MS);
  console.log(`🎮 [OyunPresence] 👁 Watchdog açık (${WATCHDOG_MS / 1000} sn).`);
}

// ── Veri Katmanı (Firebase ve Yerel JSON için) ──
function readOyunStore() {
  const store = readSessions();
  return store.oyun || {};
}
function writeOyunEntry(userId, tokenIndex, data) {
  const store = readSessions();
  if (!store.oyun) store.oyun = {};
  store.oyun[`${userId}:${tokenIndex}`] = { userId, tokenIndex, ...data, updatedAt: new Date().toISOString() };
  writeSessions(store);
}
function deleteOyunEntry(userId, tokenIndex) {
  const store = readSessions();
  if (store.oyun) {
    delete store.oyun[`${userId}:${tokenIndex}`];
    writeSessions(store);
  }
}

// ── Oyun Arama (Steam API ile) ──
// ── Oyun Arama (IGDB API ile) ──
export async function searchGame(query) {
  const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
  const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    console.error('🎮 [OyunPresence] IGDB API anahtarları eksik!');
    return [];
  }

  try {
    // 1. Twitch'ten Access Token Al
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST' }
    );
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error('🎮 [OyunPresence] IGDB token alınamadı.');
      return [];
    }

    // 2. IGDB'de Oyun Ara
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'text/plain'
      },
      body: `search "${query}"; fields name,cover.url; limit 8;`
    });

    if (!res.ok) {
      console.error(`🎮 [OyunPresence] IGDB isteği başarısız: ${res.status}`);
      return [];
    }

    const games = await res.json();

    // 3. Sonuçları Formatla
    return games.map(game => {
      let coverUrl = null;
      if (game.cover && game.cover.url) {
        // Kapak resmini büyük boyuta çeviriyoruz
        coverUrl = `https:${game.cover.url.replace('t_thumb', 't_cover_big')}`;
      }

      return {
        id: game.id,
        name: game.name,
        coverUrl: coverUrl
      };
    });

  } catch (err) {
    console.error('🎮 [OyunPresence] IGDB arama hatası:', err);
    return [];
  }
}
// ── Sonsuz Döngü (Sürenin takılı kalmasını engeller) ──
function startGameLoop(state) {
  if (state.loopTimer) clearInterval(state.loopTimer);
  // Her 2 saatte bir süreyi sıfırlar (Oyunlar için ideal)
  state.loopTimer = setInterval(async () => {
    if (!runningSessions.has(`${state.userId}:${state.tokenIndex}`)) {
      clearInterval(state.loopTimer);
      return;
    }
    state.startedAt = Date.now();
    console.log(`🎮 [OyunPresence] 🔄 Süre sıfırlandı: ${state.gameData.gameName}`);
    await applyPresence(state);
  }, 2 * 60 * 60 * 1000); 
}

// ── Dışa Aktarılan Fonksiyonlar ──
export function isOyunRunning(userId, tokenIndex) {
  return runningSessions.has(`${userId}:${tokenIndex}`);
}

export function getOyunStats(userId, tokenIndex) {
  const state = runningSessions.get(`${userId}:${tokenIndex}`);
  if (!state) return null;
  return {
    running: true,
    gameName: state.gameData.gameName,
    details: state.gameData.details,
    playerState: state.gameData.playerState,
    imageUrl: state.gameData.imageUrl,
    startedAt: state.startedAt,
    durationMin: Math.floor((Date.now() - state.startedAt) / 60000),
    username: state.client?.user?.username ?? state.usernameFallback ?? '',
  };
}

export function listRunningOyun(userId) {
  return [...runningSessions.entries()]
    .filter(([k]) => k.startsWith(`${userId}:`))
    .map(([k, s]) => ({ tokenIndex: Number(k.split(':')[1]), ...s }));
}

export async function startOyunPresence(userId, tokenIndex, gameData, opts = {}) {
  const key = `${userId}:${tokenIndex}`;
  if (!gameData || typeof gameData.gameName !== 'string') {
    return { success: false, error: 'Geçersiz oyun verisi' };
  }
  stopOyunPresence(userId, tokenIndex, { silent: true });

  const login = await loginVaultAccount(userId, tokenIndex);
  if (!login.success) return { success: false, error: login.error };

  const client = login.client;
  const state = {
    userId, tokenIndex, client, 
    gameData: {
      gameName: gameData.gameName,
      details: gameData.details || null,
      playerState: gameData.playerState || null,
      imageUrl: gameData.imageUrl || null,
    },
    statusChoice: opts.statusChoice || 'online',
    startedAt: Date.now(),
    running: true,
    usernameFallback: client.user?.username,
    loopTimer: null 
  };
  runningSessions.set(key, state);

  writeOyunEntry(userId, tokenIndex, {
    gameData: state.gameData, statusChoice: state.statusChoice, active: true,
  });

  await sleep(1500);
  await applyPresence(state);
  startGameLoop(state);

  return { success: true, username: client.user?.username };
}

export function stopOyunPresence(userId, tokenIndex, { silent = false } = {}) {
  const key = `${userId}:${tokenIndex}`;
  const state = runningSessions.get(key);
  if (!state) {
    if (silent) return { success: false };
    return { success: false, error: 'Bu hesapta aktif oyun presence yok' };
  }
  
  if (state.loopTimer) {
    clearInterval(state.loopTimer);
    state.loopTimer = null;
  }

  try {
    state.client.presence.set({ activities: [], status: 'online', afk: false, since: 0 });
  } catch { }
  
  destroyClient(state.client);
  runningSessions.delete(key);
  deleteOyunEntry(userId, tokenIndex);
  return { success: true };
}

export function stopAllOyun(userId) {
  let stopped = 0;
  for (const [key] of runningSessions) {
    if (key.startsWith(`${userId}:`)) {
      if (stopOyunPresence(userId, Number(key.split(':')[1]), { silent: true }).success) stopped++;
    }
  }
  return stopped;
}

export async function recoverOyunPresences() {
  const store = readOyunStore();
  let revived = 0;
  for (const [key, sess] of Object.entries(store)) {
    if (!sess.active || !sess.gameData) continue;
    const [userId, idxStr] = key.split(':');
    const res = await startOyunPresence(userId, Number(idxStr), sess.gameData, {
      statusChoice: sess.statusChoice,
    });
    if (res.success) revived++;
    await sleep(1500);
  }
  if (revived) console.log(`🎮 [OyunPresence] ${revived} oturum kaldığı yerden devam ediyor.`);
  startWatchdog();
}
