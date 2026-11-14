// src/utils/voiceAfkRunner.js — 🌙 Ses AFK Motoru v2 (Stabil)
//
// v1'deki sorun: her başlatmada YENİ bir Discord client açılıyordu. Aynı hesap
// 2 kez bağlanınca Discord eski bağlantıyı atıyor → kanaldan düşme, ses
// bağlantısının ölmesi, "ben AFK bırakınca diğeri çıkıyor" hatası.
//
// v2 çözümü:
//   • accountPool → hesap başına TEK client (Online/AutoTyper ile paylaşılır)
//   • VoiceConnectionStatus ile gerçek bağlantı durumu izlenir
//   • Yeniden bağlanma backoff'lu (3s → 5s → 10s → 20s → 30s)
//   • Kanal dolu/erişim yoksa opsiyonel yedek kanala geçer
//   • Sunucu/kanal silinirse ısrar etmez, temiz kapatır
//   • Deafen/Mute durumu korunur, "moved" olayında yeni kanala kendini taşır

import { joinVoiceChannel, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import { acquire, release, peek, refsOf } from './accountPool.js';
import { saveSession, deleteSession, getAllSessions } from './sessionStore.js';
import { sleep } from './selfbotHelpers.js';

const MODULE = 'voiceafk';
const runningSessions = new Map(); // `${userId}:${tokenIndex}` -> state

// ── Ayarlanabilir sabitler ───────────────────────────────────────────────
const HEALTH_CHECK_MS = 20_000;      // sağlık kontrolü aralığı
const MAX_JOIN_ATTEMPTS = 8;         // ilk bağlanma deneme limiti
const MAX_RECONNECT_FAILS = 6;       // art arda yeniden bağlanma başarısızlığı
const BACKOFF = [3000, 5000, 10_000, 20_000, 30_000];

const keyOf = (userId, tokenIndex) => `${userId}:${tokenIndex}`;

// ── Yardımcılar ──────────────────────────────────────────────────────────
function isChannelFull(ch, client) {
  const limit = ch?.userLimit ?? 0;
  if (!limit) return false;
  // Kanal sayısı: botun kendisi zaten içerideyse saymadan çık
  const members = ch.members?.filter(m => m.id !== client.user.id).size ?? 0;
  return members >= limit;
}

async function resolveChannel(client, guildId, channelId) {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { error: 'Sunucu bulunamadı (hesap bu sunucuda değil mi?)' };

  let ch = guild.channels.cache.get(channelId);
  if (!ch) {
    await guild.channels.fetch().catch(() => { });
    ch = guild.channels.cache.get(channelId);
  }
  if (!ch) return { error: 'Ses kanalı bulunamadı (silinmiş veya ID yanlış)' };
  if (!ch.isVoice?.()) return { error: 'Belirtilen kanal bir ses kanalı değil' };
  return { guild, channel: ch };
}

/** Adapter creator — selfbot-v13 uyumlu */
function adapterFor(guild) {
  return guild.voiceAdapterCreator
    || guild.voice?.adapterCreator
    || (guild.client?.voice?.adapters?.get?.(guild.id));
}

// ── Başlat ───────────────────────────────────────────────────────────────
export async function startVoiceAfk(userId, tokenIndex, guildId, channelId, opts = {}) {
  const key = keyOf(userId, tokenIndex);

  // Aynı hesap zaten AFK'ta → tekrar bağlanma, sadece ayarı güncelle
  const current = runningSessions.get(key);
  if (current) {
    if (current.guildId === guildId && current.channelId === channelId) {
      return { success: true, username: current.username, alreadyRunning: true };
    }
    stopVoiceAfk(userId, tokenIndex, { silent: true });
  }

  // 🎯 Havuzdan ortak client al — YENİ BAĞLANTI AÇMAZ
  const session = await acquire(userId, tokenIndex, MODULE);
  if (!session.success) return { success: false, error: session.error };

  const client = session.client;

  try {
    const state = {
      userId, tokenIndex, client,
      username: session.username,
      guildId, channelId,
      fallbackChannelId: opts.fallbackChannelId || null,
      selfDeaf: opts.selfDeaf !== false,
      selfMute: opts.selfMute !== false,
      running: true,
      connection: null,
      currentChannelId: channelId,
      reconnections: 0,
      connectFails: 0,
      startTime: Date.now(),
      timer: null,
      connecting: false,
      lastError: null,
    };
    runningSessions.set(key, state);

    // ── Bağlantı kur ────────────────────────────────────────────────────
    const connect = async () => {
      if (state.connecting || !state.running) return false;
      state.connecting = true;
      try {
        const resolved = await resolveChannel(client, state.guildId, state.channelId);
        if (resolved.error) {
          state.lastError = resolved.error;
          return false;
        }
        const { guild, channel } = resolved;

        // Kanal doluysa yedek kanalı dene
        let target = channel;
        if (isChannelFull(channel, client) && state.fallbackChannelId) {
          const fb = guild.channels.cache.get(state.fallbackChannelId);
          if (fb?.isVoice?.()) {
            console.log(`🔀 [VoiceAFK] ${state.username}: kanal dolu → yedek kanala geçiliyor`);
            target = fb;
          }
        }

        const adapter = adapterFor(guild);
        if (!adapter) {
          state.lastError = 'Ses adaptörü bulunamadı';
          return false;
        }

        // Eski bağlantıyı temizle (aynı client'ta iki connection olmasın)
        try { state.connection?.destroy(); } catch { }

        const conn = joinVoiceChannel({
          channelId: target.id,
          guildId: state.guildId,
          adapterCreator: adapter,
          selfDeaf: state.selfDeaf,
          selfMute: state.selfMute,
          group: client.user.id, // aynı user için tek connection grubu
        });
        state.connection = conn;
        state.currentChannelId = target.id;

        // Hazır olana kadar bekle (20 sn)
        await entersState(conn, VoiceConnectionStatus.Ready, 20_000);

        conn.on(VoiceConnectionStatus.Disconnected, () => {
          if (!state.running) return;
          console.warn(`🔌 [VoiceAFK] ${state.username} bağlantı koptu → yeniden bağlanacak`);
          // Bağlantı durum makinesi kendi başına toparlayamazsa sağlık kontrolü halledecek
        });

        conn.on('error', (err) => {
          console.warn(`⚠️ [VoiceAFK] ${state.username} bağlantı hatası: ${err?.message || err}`);
        });

        console.log(`🎙️ [VoiceAFK] ${state.username} → kanal ${target.name || target.id}`);
        return true;
      } catch (err) {
        state.lastError = err.message;
        console.error(`🎙️ [VoiceAFK] bağlanma hatası (${state.username}):`, err.message);
        try { state.connection?.destroy(); } catch { }
        state.connection = null;
        return false;
      } finally {
        state.connecting = false;
      }
    };

    // İlk bağlanma — deneme limiti ile
    let joined = false;
    for (let i = 1; i <= MAX_JOIN_ATTEMPTS && state.running; i++) {
      joined = await connect();
      if (joined) break;
      console.log(`🔁 [VoiceAFK] Bağlanma denemesi ${i}/${MAX_JOIN_ATTEMPTS} başarısız: ${state.lastError}`);
      await sleep(BACKOFF[Math.min(i - 1, BACKOFF.length - 1)]);
    }

    if (!joined) {
      stopVoiceAfk(userId, tokenIndex, { silent: true });
      return { success: false, error: state.lastError || `Ses kanalına bağlanılamadı (${MAX_JOIN_ATTEMPTS} deneme)` };
    }

    state.connectFails = 0;
    saveSession(MODULE, userId, tokenIndex, {
      guildId, channelId, username: state.username, fallbackChannelId: state.fallbackChannelId,
    });

    // ── Sağlık kontrolü: sadece gerçekten koptuysa müdahale et ─────────
    state.timer = setInterval(async () => {
      if (!state.running) return;
      try {
        // Client tamamen öldüyse (disconnect) hiçbir şey yapamayız → kapat
        if (!client.isReady?.()) {
          console.warn(`💀 [VoiceAFK] ${state.username} client bağlantısı yok — oturum kapatılıyor`);
          stopVoiceAfk(userId, tokenIndex, { silent: true, reason: 'client-dead' });
          return;
        }

        const guild = client.guilds.cache.get(state.guildId);
        if (!guild) {
          // Sunucudan atılmış olabilir
          state.connectFails++;
          if (state.connectFails >= MAX_RECONNECT_FAILS) {
            stopVoiceAfk(userId, tokenIndex, { silent: true, reason: 'guild-missing' });
          }
          return;
        }

        const me = guild.members.cache.get(client.user.id);
        const inVoice = me?.voice?.channelId;

        // Beklenen kanalda değil? (kick/move/çıkma/dolu kanal)
        if (inVoice !== state.currentChannelId) {
          // Başka bir kanala taşınmışsa (moderator move) orada kalması istenebilir;
          // ama bu motor "belirlenen kanalda AFK" garantisi verir → geri taşınır.
          // Eski (ölü) bağlantıyı temizle — yenisi kurulacak
          if (state.connection?.state?.status !== VoiceConnectionStatus.Ready) {
            try { state.connection?.destroy(); } catch { }
            state.connection = null;
          }

          console.log(`🔁 [VoiceAFK] ${state.username}: kanalda değil (${inVoice || 'yok'}) → yeniden bağlanıyor`);

          const ok = await connect();
          if (ok) {
            state.connectFails = 0;
            state.reconnections++;
          } else {
            state.connectFails++;
            console.warn(`⚠️ [VoiceAFK] yeniden bağlanma ${state.connectFails}/${MAX_RECONNECT_FAILS} başarısız`);
            if (state.connectFails >= MAX_RECONNECT_FAILS) {
              console.error(`🛑 [VoiceAFK] ${state.username} ${MAX_RECONNECT_FAILS} kez başarısız → oturum kapatıldı`);
              stopVoiceAfk(userId, tokenIndex, { silent: true, reason: 'reconnect-failed' });
            } else {
              await sleep(BACKOFF[Math.min(state.connectFails - 1, BACKOFF.length - 1)]);
            }
          }
        } else if (state.connection?.state?.status === VoiceConnectionStatus.Disconnected) {
          // Kanal doğru görünüyor ama bağlantı koptu (websocket ölü)
          console.log(`🧩 [VoiceAFK] ${state.username}: bağlantı durumu Disconnected → tamir ediliyor`);
          try {
            await Promise.race([
              entersState(state.connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(state.connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
          } catch {
            await connect();
          }
        }
      } catch (err) {
        console.error(`[VoiceAFK] sağlık kontrolü hatası (${key}):`, err.message);
      }
    }, HEALTH_CHECK_MS);

    return { success: true, username: state.username, shared: session.shared };
  } catch (err) {
    release(userId, tokenIndex, MODULE);
    return { success: false, error: err.message };
  }
}

// ── Durdur ───────────────────────────────────────────────────────────────
export function stopVoiceAfk(userId, tokenIndex, opts = {}) {
  const key = keyOf(userId, tokenIndex);
  const state = runningSessions.get(key);
  if (!state) {
    if (opts.silent) return false;
    return { success: false, error: 'Bu hesap için Ses AFK çalışmıyor.' };
  }

  state.running = false;
  clearInterval(state.timer);

  // 1) Ses bağlantısını kapat (kanaldan çık)
  try { state.connection?.destroy(); } catch { }
  state.connection = null;

  // 2) Havuzdan bırak — başka modül (Online vb.) kullanıyorsa client AÇIK kalır
  release(userId, tokenIndex, MODULE);

  runningSessions.delete(key);
  deleteSession(MODULE, userId, tokenIndex);
  console.log(`🎙️ [VoiceAFK] Durduruldu: ${state.username || key} (${opts.reason || 'manual'})`);
  return { success: true };
}

// ── Sorgular ─────────────────────────────────────────────────────────────
export function isVoiceAfkRunning(userId, tokenIndex) {
  return runningSessions.has(keyOf(userId, tokenIndex));
}

export function getVoiceAfkStats(userId, tokenIndex) {
  const state = runningSessions.get(keyOf(userId, tokenIndex));
  if (!state) return null;
  return {
    guildId: state.guildId,
    channelId: state.currentChannelId,
    originalChannelId: state.channelId,
    username: state.username,
    reconnections: state.reconnections,
    connectFails: state.connectFails,
    connected: state.connection?.state?.status === VoiceConnectionStatus.Ready,
    status: state.connection?.state?.status || 'none',
    lastError: state.lastError,
    durationMin: Math.floor((Date.now() - state.startTime) / 60000),
    sharedWith: refsOf(userId, tokenIndex).filter(m => m !== MODULE),
  };
}

/** Kullanıcının tüm ses AFK oturumları */
export function getUserVoiceAfkSessions(userId) {
  return [...runningSessions.entries()]
    .filter(([k]) => k.startsWith(`${userId}:`))
    .map(([, s]) => ({
      tokenIndex: s.tokenIndex,
      username: s.username,
      guildId: s.guildId,
      channelId: s.currentChannelId,
      connected: s.connection?.state?.status === VoiceConnectionStatus.Ready,
      reconnections: s.reconnections,
      durationMin: Math.floor((Date.now() - s.startTime) / 60000),
    }));
}

export function getAllVoiceAfkSessions() {
  return getAllSessions(MODULE);
}

/** Tümünü durdur */
export function stopAllVoiceAfk(userId) {
  let stopped = 0;
  for (const [k, s] of [...runningSessions.entries()]) {
    if (s.userId !== userId) continue;
    if (stopVoiceAfk(s.userId, s.tokenIndex)) stopped++;
  }
  return stopped;
}

/** Reboot Recovery */
export async function recoverVoiceAfk() {
  const sessions = getAllSessions(MODULE);
  let recovered = 0;
  for (const s of sessions) {
    const res = await startVoiceAfk(s.userId, s.tokenIndex, s.guildId, s.channelId, {
      fallbackChannelId: s.fallbackChannelId || null,
    }).catch(() => ({ success: false }));
    if (res.success) recovered++;
  }
  console.log(`🎙️ [VoiceAFK] Reboot Recovery: ${recovered}/${sessions.length} oturum geri yüklendi.`);
  return recovered;
}

export { VoiceConnectionStatus };
