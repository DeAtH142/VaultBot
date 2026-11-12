// src/utils/voiceAfkRunner.js — 🌙 Ses AFK Motoru
// Vault'tan seçilen hesapları ses kanalına bağlar; koparsa otomatik geri sokar.
// discord.js-selfbot-v13voice join için @discordjs/udp apileri kullanır
// (selfbot-v13'ün built-in voice desteği: VoiceConnectionStatus ile client.voice).
import { joinVoiceChannel } from '@discordjs/voice';
import { loginVaultAccount, destroyClient, sleep } from './selfbotHelpers.js';
import { saveSession, deleteSession, getAllSessions } from './sessionStore.js';

const runningSessions = new Map(); // `${userId}:${tokenIndex}` -> state
const RECONNECT_CHECK_MS = 15000;
const MAX_JOIN_ATTEMPTS = 10;      // Kanal bağlanma deneme limiti

/**
 * Ses AFK oturumu başlat.
 * @param {string} userId
 * @param {number} tokenIndex
 * @param {string} guildId
 * @param {string} channelId - ses kanalı ID
 */
export async function startVoiceAfk(userId, tokenIndex, guildId, channelId) {
  const key = `${userId}:${tokenIndex}`;
  stopVoiceAfk(userId, tokenIndex, { silent: true });

  const login = await loginVaultAccount(userId, tokenIndex);
  if (!login.success) return { success: false, error: login.error };

  const client = login.client;
  const state = {
    userId, tokenIndex, client, guildId, channelId,
    running: true, reconnections: 0, startTime: Date.now(),
    timer: null, connection: null,
  };
  runningSessions.set(key, state);

  saveSession('voiceafk', userId, tokenIndex, { guildId, channelId });

  const connect = () => {
    try {
      // selfbot-v13: guild.voiceAdapterCreator kullanılır (client.voiceAdapters yoktur)
      const guildObj = client.guilds.cache.get(guildId);
      const adapterCreator = guildObj?.voiceAdapterCreator;
      if (!adapterCreator) throw new Error('Ses adaptörü bulunamadı (hesap bu sunucuda olmayabilir)');

      const conn = joinVoiceChannel({
        channelId,
        guildId,
        adapterCreator,
        selfDeaf: true,
        selfMute: true,
      });
      state.connection = conn;
      return true;
    } catch (err) {
      console.error(`🎙️ [VoiceAFK] join hatası (${key}):`, err.message);
      return false;
    }
  };

  // 🔍 Hedef kanalı en fazla MAX_JOIN_ATTEMPTS kez arayıp bağlanmayı dener.
  // Bulamazsa (veya limit dolarsa) ısrar etmez, oturumu temizler.
  const findAndJoinChannel = async () => {
    for (let attempt = 1; attempt <= MAX_JOIN_ATTEMPTS && state.running; attempt++) {
      try {
        const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          let ch = guild.channels.cache.get(channelId);
          if (!ch) {
            await guild.channels.fetch().catch(() => {});
            ch = guild.channels.cache.get(channelId);
          }
          if (ch) {
            if (connect()) {
              state.attempts = attempt;
              return true;
            }
          }
        }
      } catch (err) {
        console.error(`🎙️ [VoiceAFK] kanal arama hatası (${key}):`, err.message);
      }
      console.log(`🔍 [VoiceAFK] Kanal bulunamadı/bağlanamadı (${attempt}/${MAX_JOIN_ATTEMPTS}): ${client.user.tag}`);
      await sleep(3000);
    }
    return false;
  };

  // İlk bağlanma — 10 deneme hakkı, bulamazsa pes eder
  const joined = await findAndJoinChannel();
  if (!joined || !state.running) {
    stopVoiceAfk(userId, tokenIndex, { silent: true });
    return { success: false, error: `Ses kanalı bulunamadı (${MAX_JOIN_ATTEMPTS} deneme yapıldı)` };
  }

  // 🛡️ Akıllı Yeniden Bağlanma: periyodik kontrol — koparsa geri sok.
  // Yeniden bağlanırken de aynı 10 deneme limiti uygulanır; limit dolarsa oturum kapanır.
  state.timer = setInterval(async () => {
    if (!state.running) return;
    try {
      const guild = client.guilds.cache.get(guildId);
      const member = guild?.members.cache.get(client.user.id);
      const connected = member?.voice?.channelId === channelId;
      if (!connected) {
        state.reconnections++;
        console.log(`🔁 [VoiceAFK] Yeniden bağlanıyor: ${client.user.tag}`);
        const ok = await findAndJoinChannel();
        if (!ok) {
          console.log(`🛑 [VoiceAFK] ${MAX_JOIN_ATTEMPTS} deneme başarısız, oturum kapatılıyor: ${client.user.tag}`);
          stopVoiceAfk(userId, tokenIndex, { silent: true });
        }
      }
    } catch { }
  }, RECONNECT_CHECK_MS);

  console.log(`🎙️ [VoiceAFK] Başlatıldı: ${login.username} → kanal ${channelId}`);
  return { success: true, username: login.username };
}

export function stopVoiceAfk(userId, tokenIndex, opts = {}) {
  const key = `${userId}:${tokenIndex}`;
  const state = runningSessions.get(key);
  if (!state) return opts.silent ? false : { success: false, error: 'Bu hesap için Ses AFK çalışmıyor.' };

  state.running = false;
  clearInterval(state.timer);
  try { state.connection?.destroy(); } catch { }
  destroyClient(state.client);
  runningSessions.delete(key);
  deleteSession('voiceafk', userId, tokenIndex);
  console.log(`🎙️ [VoiceAFK] Durduruldu: ${key}`);
  return { success: true };
}

export function isVoiceAfkRunning(userId, tokenIndex) {
  return runningSessions.has(`${userId}:${tokenIndex}`);
}

export function getVoiceAfkStats(userId, tokenIndex) {
  const state = runningSessions.get(`${userId}:${tokenIndex}`);
  if (!state) return null;
  return {
    guildId: state.guildId,
    channelId: state.channelId,
    reconnections: state.reconnections,
    durationMin: Math.floor((Date.now() - state.startTime) / 60000),
  };
}

export function getAllVoiceAfkSessions() {
  return getAllSessions('voiceafk');
}

/** Reboot Recovery */
export async function recoverVoiceAfk() {
  const sessions = getAllSessions('voiceafk');
  let recovered = 0;
  for (const s of sessions) {
    const res = await startVoiceAfk(s.userId, s.tokenIndex, s.guildId, s.channelId).catch(() => ({ success: false }));
    if (res.success) recovered++;
  }
  console.log(`🎙️ [VoiceAFK] Reboot Recovery: ${recovered}/${sessions.length} oturum geri yüklendi.`);
  return recovered;
}
