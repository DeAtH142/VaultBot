// src/utils/oyunPresenceRunner.js — 🎮 REXAL Oyun Fake Presence Motoru
import { loginVaultAccount, destroyClient, sleep } from './selfbotHelpers.js';
import { readSessions, writeSessions } from './sessionStore.js';
import { RichPresence } from 'discord.js-selfbot-v13';

const runningSessions = new Map();
const WATCHDOG_MS = 60_000;
let watchdogTimer = null;

const APP_ID = '1525831686011490334'; // kendi bot uygulaması — external asset yüklemeleri bunun altında
const SPOTIFY_APP_ID = '1336326530712000543';
const coverProxyCache = new Map();

async function resolveCoverAsset(client, imageUrl) {
  // ⚠️ Discord external asset API: URL en fazla 256 karakter olabilir.
  // NEXARDA'nın bazı CDN linkleri bunu aşıyor → uzun URL'leri atla, düz isimle devam et.
  if (!imageUrl || typeof imageUrl !== 'string') return undefined;
  if (imageUrl.length > 256) {
    console.warn(`🎮 [OyunPresence] Kapak URL'si çok uzun (${imageUrl.length} karakter) — resim olmadan devam ediliyor.`);
    return undefined;
  }
  if (!/^https?:\/\//i.test(imageUrl)) return undefined;
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

// ── Oyun Arama (NEXARDA + Steam Fallback) ──
// NEXARDA: Ücretsiz, API anahtarı gerektirmez, çok geniş oyun veritabanı.
// Steam: Yedek olarak kalır, anahtarsız çalışır.
export async function searchGame(query) {
  // 1. NEXARDA API'yi dene
  try {
    const nexardaUrl = `https://www.nexarda.com/api/v3/search?type=games&q=${encodeURIComponent(query)}`;
    const nexardaRes = await fetch(nexardaUrl);
    
    if (nexardaRes.ok) {
      const nexardaData = await nexardaRes.json();
      if (nexardaData.success && nexardaData.results?.items?.length > 0) {
        return nexardaData.results.items.slice(0, 8).map(item => {
          const gameInfo = item.game_info || {};
          return {
            id: gameInfo.id || item.slug,
            name: gameInfo.name || item.title,
            coverUrl: item.image || null
          };
        });
      }
    }
  } catch (err) {
    console.warn('🎮 [OyunPresence] NEXARDA arama hatası, Steam deneniyor:', err.message);
  }

  // 2. Steam API'yi dene (NEXARDA sonuç vermezse)
  try {
    const steamRes = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(query)}&l=turkish&cc=tr`);
    if (!steamRes.ok) return [];
    
    const steamData = await steamRes.json();
    if (!steamData.items || steamData.items.length === 0) return [];

    return steamData.items.slice(0, 8).map(item => ({
      id: item.id,
      name: item.name,
      coverUrl: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`
    }));
  } catch (err) {
    console.error('🎮 [OyunPresence] Steam arama hatası:', err);
    return [];
  }
}

// ── Presence Payload Üretici ──
async function buildPresenceState(state) {
  const { gameData } = state;
  
  // 🖼 Kapak resmi: Discord'un FREE external asset API'si ile proxy'lenir
  // (NEXARDA/Steam'den gelen gerçek oyun logosu — attığın GTA VI görseli gibi)
  let coverAsset;
  if (gameData.imageUrl) {
    coverAsset = await resolveCoverAsset(state.client, gameData.imageUrl);
  }

  const payload = {
    name: gameData.gameName.slice(0, 128),
    type: 0, // 0 = OYNUYOR
    details: gameData.details ? gameData.details.slice(0, 128) : undefined,
    state: gameData.playerState ? gameData.playerState.slice(0, 128) : undefined,
    timestamps: {
      start: state.startedAt
    },
  };

  if (coverAsset) {
    // Kapak bulundu → görselli zengin presence
    payload.application_id = APP_ID;
    payload.assets = {
      large_image: coverAsset,
      large_text: gameData.gameName.slice(0, 128),
    };
  } else if (gameData.assetKey) {
    // Yedek: elle yüklenmiş asset key
    payload.application_id = APP_ID;
    payload.assets = {
      large_image: gameData.assetKey,
      large_text: gameData.gameName.slice(0, 128),
    };
  }
  // hiçbiri yoksa düz isimle gönderilir (Discord zaten "Oynuyor" gösterir)

  return payload;
}

async function applyPresence(state) {
  try {
    const presence = await buildPresenceState(state);
    // ✅ selfbot-v13 doğru API: activities payload'unu doğrudan gönder
    await state.client.user.setPresence({
      activities: [presence],
      status: state.statusChoice || 'online',
      afk: false,
      since: 0,
    });
  } catch (err) {
    console.error('🎮 [OyunPresence] Presence gönderme hatası:', err.message);
    await sleep(2000);
    try {
      const presence = await buildPresenceState(state);
      await state.client.user.setPresence({
        activities: [presence],
        status: state.statusChoice || 'online',
        afk: false,
        since: 0,
      });
    } catch (err2) {
      console.error('🎮 [OyunPresence] Presence retry hatası:', err2.message);
    }
  }
}

function startGameLoop(state) {
  if (state.loopTimer) clearInterval(state.loopTimer);
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
      assetKey: gameData.assetKey || null,
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
