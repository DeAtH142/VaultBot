// src/utils/spotifyPresenceRunner.js — 🎧 Spotify Fake Presence Motoru
import { SpotifyRPC } from 'discord.js-selfbot-v13';
import { loginVaultAccount, destroyClient, sleep } from './selfbotHelpers.js';
import { readSessions, writeSessions } from './sessionStore.js';
import { SPOTIFY_PRESENCE_TRACKS } from './spotifyTracks.js';

const runningSessions = new Map(); // `${userId}:${tokenIndex}` -> state

// ── Watchdog: bağlantı düşen oturumları otomatik yeniden başlat ──────────
const WATCHDOG_MS = 60_000;
let watchdogTimer = null;

function startWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(async () => {
    for (const [key, state] of [...runningSessions.entries()]) {
      try {
        const dead = !state.client || state.client.ws?.status !== 0 && state.client.ws?.status !== undefined;
        const disconnected = state.client?.ws && typeof state.client.ws.status === 'number' && state.client.ws.status !== 0;
        if (dead || disconnected) {
          console.log(`🎧 [SpotifyPresence] ⚠️ Bağlantı koptu (${key}) — otomatik yeniden bağlanılıyor...`);
          try { destroyClient(state.client); } catch { }
          runningSessions.delete(key);
          const sess = readSpotifyStore()[key];
          if (sess?.active && sess.track) {
            const res = await startSpotifyPresence(state.userId, state.tokenIndex, sess.track, {
              statusChoice: sess.statusChoice, shuffleLoop: sess.shuffleLoop,
            });
            if (res.success) console.log(`🎧 [SpotifyPresence] ✅ ${key} yeniden bağlandı.`);
            else console.log(`🎧 [SpotifyPresence] ❌ ${key} yeniden bağlanamadı: ${res.error}`);
          }
        }
      } catch (err) {
        console.error('🎧 [SpotifyPresence] watchdog hatası:', err.message);
      }
    }
  }, WATCHDOG_MS);
  console.log(`🎧 [SpotifyPresence] 👁 Watchdog açık (${WATCHDOG_MS / 1000} sn aralıkla bağlantı kontrolü).`);
}

// ── Veri katmanı (sessions.json içine 'spotify' modülü olarak yaz) ─────────
function readSpotifyStore() {
  const store = readSessions();
  return store.spotify || {};
}
function writeSpotifyEntry(userId, tokenIndex, data) {
  const store = readSessions();
  if (!store.spotify) store.spotify = {};
  store.spotify[`${userId}:${tokenIndex}`] = { userId, tokenIndex, ...data, updatedAt: new Date().toISOString() };
  writeSessions(store);
}
function deleteSpotifyEntry(userId, tokenIndex) {
  const store = readSessions();
  if (store.spotify) {
    delete store.spotify[`${userId}:${tokenIndex}`];
    writeSessions(store);
  }
}

// ── Arama: iTunes Search API ───────────────────
export async function searchTrack(query, limit = 8) {
  const base = 'https://itunes.apple.com/search?media=music&entity=song';
  const q = `&limit=${limit}&term=${encodeURIComponent(query)}`;
  let json = null;
  for (const country of ['TR', 'US']) {
    try {
      const res = await fetch(base + `&country=${country}` + q, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const j = await res.json();
      if ((j.results || []).length > 0) { json = j; break; }
    } catch { }
  }
  if (!json) return [];
  return (json.results || []).map(r => ({
      id: `${r.trackId}`,
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName,
      durationMs: r.trackTimeMillis || 0,
      coverUrl: r.artworkUrl100?.replace('100x100', '600x600') || '',
      previewUrl: r.previewUrl || '',
      pageUrl: r.trackViewUrl || '',
    }));
}

// ── Presence payload üretici ────────────────────────────────────────────────
const SPOTIFY_APP_ID = '1336326530712000543';
const coverProxyCache = new Map();

async function resolveCoverAsset(client, coverUrl) {
  if (!coverUrl) return undefined;
  if (coverProxyCache.has(coverUrl)) return coverProxyCache.get(coverUrl);
  try {
    const { RichPresence } = await import('discord.js-selfbot-v13');
    const ext = await RichPresence.getExternal(client, SPOTIFY_APP_ID, coverUrl);
    const hash = ext?.[0]?.external_asset_path;
    if (!hash) return undefined;
    const asset = `mp:${hash}`;
    coverProxyCache.set(coverUrl, asset);
    return asset;
  } catch (err) {
    return undefined;
  }
}

function buildPresenceState(state, coverAsset) {
  const t = state.track;
  const duration = Number(t.durationMs) > 0 ? Number(t.durationMs) : 180000; 

  return {
    name: 'Spotify',
    type: 2, 
    id: 'spotify:1', 
    flags: 48, 
    details: t.title.slice(0, 128),
    state: t.artist.slice(0, 128),
    assets: {
      ...(coverAsset ? { large_image: coverAsset } : {}),
      large_text: (t.album || t.title).slice(0, 128),
    },
    timestamps: { 
      start: state.startedAt,
      end: state.startedAt + duration 
    },
  };
}

// ── Presence uygulayıcı ───────────────────
async function applyPresence(state) {
  const coverAsset = await resolveCoverAsset(state.client, state.track.coverUrl);
  const presence = buildPresenceState(state, coverAsset);
  try {
    state.client.presence.set({
      activities: [presence],
      status: state.statusChoice || 'online',
      afk: false,
      since: 0,
    });
  } catch (err) {
    await sleep(2000);
    try {
      state.client.presence.set({
        activities: [presence],
        status: state.statusChoice || 'online',
        afk: false,
        since: 0,
      });
    } catch (err2) {}
  }
}

// ── Oturum kontrolü ─────────────────────────────────────────────────────────
export function isSpotifyRunning(userId, tokenIndex) {
  return runningSessions.has(`${userId}:${tokenIndex}`);
}

export function getSpotifyStats(userId, tokenIndex) {
  const state = runningSessions.get(`${userId}:${tokenIndex}`);
  if (!state) return null;
  return {
    running: true,
    trackTitle: state.track.title,
    artist: state.track.artist,
    album: state.track.album,
    coverUrl: state.track.coverUrl,
    startedAt: state.startedAt,
    durationMin: Math.floor((Date.now() - state.startedAt) / 60000),
    username: state.client?.user?.username ?? state.usernameFallback ?? '',
  };
}

export function listRunningSpotify(userId) {
  return [...runningSessions.entries()]
    .filter(([k]) => k.startsWith(`${userId}:`))
    .map(([k, s]) => ({ tokenIndex: Number(k.split(':')[1]), ...s }));
}

// ── 🚨 YENİ: ŞARKI BİTİNCE BAŞA SARAN ZAMANLAYICI ──
function startTrackLoop(state) {
  if (state.loopTimer) clearInterval(state.loopTimer);

  const duration = Number(state.track.durationMs) > 0 ? Number(state.track.durationMs) : 180000;

  state.loopTimer = setInterval(async () => {
    if (!runningSessions.has(`${state.userId}:${state.tokenIndex}`)) {
      clearInterval(state.loopTimer);
      return;
    }
    
    // Süre bitti, başlangıç zamanını şu ana çek ve tekrar gönder
    state.startedAt = Date.now();
    console.log(`🎧 [SpotifyPresence] 🔄 Şarkı bitti, tekrar başlatılıyor: ${state.track.title}`);
    
    await applyPresence(state);
  }, duration);
}

export async function startSpotifyPresence(userId, tokenIndex, track, opts = {}) {
  const key = `${userId}:${tokenIndex}`;
  if (!track || typeof track.title !== 'string' || typeof track.artist !== 'string') {
    return { success: false, error: 'Geçersiz şarkı verisi' };
  }
  stopSpotifyPresence(userId, tokenIndex, { silent: true });

  const login = await loginVaultAccount(userId, tokenIndex);
  if (!login.success) return { success: false, error: login.error };

  const client = login.client;
  const state = {
    userId, tokenIndex, client, track,
    statusChoice: opts.statusChoice || 'online',
    shuffleLoop: !!opts.shuffleLoop,
    startedAt: Date.now(),
    running: true,
    usernameFallback: client.user?.username,
    loopTimer: null // Timer'ı state'e ekledik
  };
  runningSessions.set(key, state);

  writeSpotifyEntry(userId, tokenIndex, {
    track, statusChoice: state.statusChoice, shuffleLoop: state.shuffleLoop, active: true,
  });

  await sleep(1000);
  await applyPresence(state);
  
  // Şarkı döngüsünü başlat
  startTrackLoop(state);

  return { success: true, username: client.user?.username };
}

export function stopSpotifyPresence(userId, tokenIndex, { silent = false } = {}) {
  const key = `${userId}:${tokenIndex}`;
  const state = runningSessions.get(key);
  if (!state) {
    if (silent) return { success: false };
    return { success: false, error: 'Bu hesapta aktif Spotify presence yok' };
  }
  state.running = false;
  
  // 🚨 Döngüyü durdur
  if (state.loopTimer) {
    clearInterval(state.loopTimer);
    state.loopTimer = null;
  }

  try {
    state.client.presence.set({ activities: [], status: 'online', afk: false, since: 0 });
  } catch { }
  destroyClient(state.client);
  runningSessions.delete(key);
  deleteSpotifyEntry(userId, tokenIndex);
  return { success: true };
}

export function stopAllSpotify(userId) {
  let stopped = 0;
  for (const [key] of runningSessions) {
    if (key.startsWith(`${userId}:`)) {
      if (stopSpotifyPresence(userId, Number(key.split(':')[1]), { silent: true }).success) stopped++;
    }
  }
  return stopped;
}

export async function recoverSpotifyPresences() {
  const store = readSpotifyStore();
  let revived = 0;
  for (const [key, sess] of Object.entries(store)) {
    if (!sess.active || !sess.track) continue;
    const [userId, idxStr] = key.split(':');
    const res = await startSpotifyPresence(userId, Number(idxStr), sess.track, {
      statusChoice: sess.statusChoice, shuffleLoop: sess.shuffleLoop,
    });
    if (res.success) revived++;
    await sleep(1200);
  }
  if (revived) console.log(`🎧 [SpotifyPresence] ${revived} oturum kaldığı yerden devam ediyor.`);
  startWatchdog();
}

export function getReadyPlaylist() {
  return SPOTIFY_PRESENCE_TRACKS;
}
