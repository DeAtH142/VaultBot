// src/utils/voiceAfkRunner.js — 🌙 Ses AFK Motoru v3 (Çok Kanallı)
//
// v1: her başlatmada yeni Discord client → aynı hesap 2 kez bağlanınca kopma.
// v2: hesap başına TEK client (accountPool) + gerçek bağlantı durumu takibi.
// v3: AYNI HESAP ARTIK BİRDEN FAZLA SUNUCUDA AFK KALABİLİR.
//     • A sunucusu + B sunucusu aynı anda → izinli
//     • Aynı sunucuda iki farklı kanal               → engelli
//     • Aynı kanala iki kez                          → zaten bağlı, atlanır
//     Her oturum ayrı state taşır (kendi connection, kendi sağlık kontrolü).
//
// Diğer özellikler:
//   • VoiceConnectionStatus ile gerçek bağlantı durumu izlenir
//   • Yeniden bağlanma backoff'lu (3s → 5s → 10s → 20s → 30s)
//   • Kanal dolu/erişim yoksa opsiyonel yedek kanala geçer
//   • Sunucu/kanal silinirse ısrar etmez, temiz kapatır
//   • Deafen/Mute durumu korunur

import { joinVoiceChannel, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import { acquire, release, peek, refsOf } from './accountPool.js';
import { saveSession, deleteSession, getAllSessions } from './sessionStore.js';
import { sleep } from './selfbotHelpers.js';

const MODULE = 'voiceafk';
const DM_GUILD = '@me'; // DM sesleri için sentinel guild ID

// `${userId}:${tokenIndex}:${guildId}` → state  (hesap başına SUNUCU BAŞINA bir oturum)
const runningSessions = new Map();
// `${userId}:${tokenIndex}` → true  (hesabın havuzdaki client'ını kiralayan modül sayacı)
const heldTokens = new Set();

// ── Ayarlanabilir sabitler ───────────────────────────────────────────────
const HEALTH_CHECK_MS = 20_000;      // sağlık kontrolü aralığı
const MAX_JOIN_ATTEMPTS = 8;         // ilk bağlanma deneme limiti
const MAX_RECONNECT_FAILS = 6;       // art arda yeniden bağlanma başarısızlığı
const BACKOFF = [3000, 5000, 10_000, 20_000, 30_000];

const keyOf = (userId, tokenIndex) => `${userId}:${tokenIndex}`;
const sessionKeyOf = (userId, tokenIndex, guildId) => `${userId}:${tokenIndex}:${guildId}`;

/** Hesabın çalışan oturumları */
function sessionsOf(userId, tokenIndex) {
  const prefix = `${keyOf(userId, tokenIndex)}:`;
  return [...runningSessions.entries()].filter(([k]) => k.startsWith(prefix));
}

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

// ── Çok kanal kuralı ────────────────────────────────────────────────────
// ✅ Aynı hesap, FARKLI sunucular → serbest (her sunucuda 1 kanal)
// ⛔ Aynı hesap, aynı sunucuda farklı kanal → engelli
// ⛔ Aynı Discord hesabı farklı slotta, aynı sunucuda → engelli
function describeTarget(guildId, channelId) {
  return guildId === DM_GUILD ? `DM \`${channelId}\`` : `\`${guildId}\` / \`${channelId}\``;
}

/**
 * Hesap bu sunucuda başka bir kanalda mı?
 * @returns {{busy:boolean, already?:boolean, reason?:string, where?:string}}
 */
export function checkAccountVoiceConflict(userId, tokenIndex, guildId, channelId) {
  // 1) Aynı slot + aynı sunucu
  for (const [, state] of sessionsOf(userId, tokenIndex)) {
    if (state.guildId !== guildId) continue; // farklı sunucu → serbest
    if (state.currentChannelId === channelId || state.channelId === channelId) {
      return { busy: false, already: true };
    }
    return {
      busy: true,
      reason: 'Bu hesap aynı sunucuda zaten başka bir ses kanalında.',
      where: describeTarget(state.guildId, state.currentChannelId),
    };
  }

  // 2) Aynı Discord hesabı başka slota kayıtlı ve o slotta bu sunucuda seste mi?
  const client = peek(userId, tokenIndex);
  const discordId = client?.user?.id;
  if (discordId) {
    for (const [k, state] of runningSessions.entries()) {
      if (state.userId === userId && state.tokenIndex === tokenIndex) continue;
      if (state.client?.user?.id !== discordId) continue;   // başka hesap → serbest
      if (state.guildId !== guildId) continue;              // farklı sunucu → serbest
      return {
        busy: true,
        reason: 'Bu Discord hesabı kasanızda başka bir slota da ekli ve o slot bu sunucuda seste.',
        where: describeTarget(state.guildId, state.currentChannelId),
      };
    }
  }

  return { busy: false };
}

// ── Başlat ───────────────────────────────────────────────────────────────
export async function startVoiceAfk(userId, tokenIndex, guildId, channelId, opts = {}) {
  const sKey = sessionKeyOf(userId, tokenIndex, guildId);

  // Aynı hesap bu sunucuda zaten bağlı mı? → yeni bağlantı açma
  const current = runningSessions.get(sKey);
  if (current) {
    // Aynı kanal → \"zaten çalışıyor\"; sadece mute/deaf değiştiyse yeniden bağlan
    const sameChannel = current.channelId === channelId && current.currentChannelId === channelId;
    const muteChanged = (opts.selfMute !== undefined && (opts.selfMute !== false) !== current.selfMute)
      || (opts.selfDeaf !== undefined && (opts.selfDeaf !== false) !== current.selfDeaf);
    if (sameChannel && !muteChanged) {
      return { success: true, username: current.username, alreadyRunning: true };
    }
    if (sameChannel) {
      // Aynı kanalda yalnızca mute/deaf değişti → yeniden bağlan (kanal aynı kalır)
      stopVoiceAfk(userId, tokenIndex, { silent: true, guildId });
    } else {
      // ⛔ Aynı sunucuda BAŞKA kanal → tek hesap aynı sunucuda iki kanala giremez
      return {
        success: false,
        conflict: true,
        where: describeTarget(current.guildId, current.currentChannelId),
        error: 'Bu hesap aynı sunucuda zaten başka bir ses kanalında.',
      };
    }
  }

  // ⛔ Aynı sunucuda başka kanal / çift slot koruması (farklı sunucular serbest)
  const conflict = checkAccountVoiceConflict(userId, tokenIndex, guildId, channelId);
  if (conflict.busy) {
    return { success: false, error: conflict.reason, conflict: true, where: conflict.where };
  }

  // 🎯 Havuzdan ortak client al — hesap kaç sunucuda olursa olsun TEK bağlantı
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
    runningSessions.set(sKey, state);
    heldTokens.add(keyOf(userId, tokenIndex));

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
          // Sunucu başına ayrı grup → farklı sunuculardaki bağlantılar birbirini ezmez
          group: `${client.user.id}:${state.guildId}`,
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
      stopVoiceAfk(userId, tokenIndex, { silent: true, guildId });
      return { success: false, error: state.lastError || `Ses kanalına bağlanılamadı (${MAX_JOIN_ATTEMPTS} deneme)` };
    }

    state.connectFails = 0;
    // guildId 4. parametre → kayıt `${userId}:${tokenIndex}:${guildId}` anahtarıyla ayrı tutulur
    // (aynı hesabın başka sunucudaki kayıtları birbirini silmez)
    saveSession(MODULE, userId, tokenIndex, {
      guildId, channelId, username: state.username, fallbackChannelId: state.fallbackChannelId,
    }, guildId);

    // ── Sağlık kontrolü: sadece gerçekten koptuysa müdahale et ─────────
    state.timer = setInterval(async () => {
      if (!state.running) return;
      try {
        // Client tamamen öldüyse (disconnect) hiçbir şey yapamayız → kapat
        if (!client.isReady?.()) {
          console.warn(`💀 [VoiceAFK] ${state.username} client bağlantısı yok — oturum kapatılıyor`);
          stopVoiceAfk(userId, tokenIndex, { silent: true, reason: 'client-dead', guildId });
          return;
        }

        const guild = client.guilds.cache.get(state.guildId);
        if (!guild) {
          // Sunucudan atılmış olabilir
          state.connectFails++;
          if (state.connectFails >= MAX_RECONNECT_FAILS) {
            stopVoiceAfk(userId, tokenIndex, { silent: true, reason: 'guild-missing', guildId });
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
              stopVoiceAfk(userId, tokenIndex, { silent: true, reason: 'reconnect-failed', guildId });
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
        console.error(`[VoiceAFK] sağlık kontrolü hatası (${sKey}):`, err.message);
      }
    }, HEALTH_CHECK_MS);

    return { success: true, username: state.username, shared: session.shared };
  } catch (err) {
    release(userId, tokenIndex, MODULE);
    return { success: false, error: err.message };
  }
}

// ── Durdur ───────────────────────────────────────────────────────────────
/**
 * Sesi durdur.
 * @param {object} opts { silent, reason, guildId? , all? }
 *   guildId → sadece o sunucudaki oturum
 *   all     → hesabın tüm sunuculardaki oturumları
 */
export function stopVoiceAfk(userId, tokenIndex, opts = {}) {
  const targets = opts.all || !opts.guildId
    ? sessionsOf(userId, tokenIndex)
    : [[sessionKeyOf(userId, tokenIndex, opts.guildId), runningSessions.get(sessionKeyOf(userId, tokenIndex, opts.guildId))]];

  if (targets.length === 0 || targets.every(([, s]) => !s)) {
    if (opts.silent) return false;
    return { success: false, error: 'Bu hesap için Ses AFK çalışmıyor.' };
  }

  let stopped = 0;
  for (const [sKey, state] of targets) {
    if (!state) continue;

    state.running = false;
    clearInterval(state.timer);

    // 1) Ses bağlantısını kapat (kanaldan çık)
    try { state.connection?.destroy(); } catch { }
    state.connection = null;

    runningSessions.delete(sKey);
    deleteSession(MODULE, userId, tokenIndex, state.guildId);
    stopped++;
    console.log(`🎙️ [VoiceAFK] Durduruldu: ${state.username || keyOf(userId, tokenIndex)} @ ${state.guildId} (${opts.reason || 'manual'})`);
  }

  // Hesabın başka sunucuda oturumu kalmadıysa havuz client'ını bırak
  if (sessionsOf(userId, tokenIndex).length === 0) {
    heldTokens.delete(keyOf(userId, tokenIndex));
    release(userId, tokenIndex, MODULE);
  }

  return stopped > 0 ? { success: true, stopped } : false;
}

// ── Sorgular ─────────────────────────────────────────────────────────────
/** Hesap herhangi bir sunucuda AFK mı? */
export function isVoiceAfkRunning(userId, tokenIndex) {
  return sessionsOf(userId, tokenIndex).length > 0;
}

/**
 * Canlı durum.
 * Oturum çoklu olduğu için `guildId` verilmezse ilk oturum döner.
 * Tüm oturumlar için `getAccountVoiceSessions()` kullanılır.
 */
export function getVoiceAfkStats(userId, tokenIndex, guildId = null) {
  const entries = sessionsOf(userId, tokenIndex);
  const picked = guildId
    ? entries.find(([, s]) => s.guildId === guildId)
    : entries[0];
  if (!picked) return null;
  const [, state] = picked;

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
    // Paneldeki "Mikrofon Kapat / Kulaklık Kapat" göstergesi için canlı durum
    selfMute: state.selfMute !== false,
    selfDeaf: state.selfDeaf !== false,
    guildCount: entries.length,
    sharedWith: refsOf(userId, tokenIndex).filter(m => m !== MODULE),
  };
}

/** Bir hesabın tüm sunuculardaki oturumları (sunucu başına bir kayıt) */
export function getAccountVoiceSessions(userId, tokenIndex) {
  return sessionsOf(userId, tokenIndex).map(([, s]) => ({
    guildId: s.guildId,
    channelId: s.currentChannelId,
    originalChannelId: s.channelId,
    connected: s.connection?.state?.status === VoiceConnectionStatus.Ready,
    status: s.connection?.state?.status || 'none',
    reconnections: s.reconnections,
    durationMin: Math.floor((Date.now() - s.startTime) / 60000),
    selfMute: s.selfMute !== false,
    selfDeaf: s.selfDeaf !== false,
  }));
}

/** Kullanıcının tüm ses AFK oturumları (hesap + sunucu) */
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

/** Tümünü durdur (hesabın tüm sunucuları) */
export function stopAllVoiceAfk(userId) {
  let stopped = 0;
  for (const [k, s] of [...runningSessions.entries()]) {
    if (s.userId !== userId) continue;
    if (stopVoiceAfk(s.userId, s.tokenIndex, { all: true })) stopped++;
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
