// src/utils/autoTyperRunner.js — 📤 AutoTyper Motoru
// Vault'tan seçilen hesaplarla seçilen kanallarda 7/24 "Yazıyor..." gösterimi.
// 8 saniyede bir typing trigger yenilenir (Discord typing 10 sn'de düşer).
import { loginVaultAccount, destroyClient, sleep } from './selfbotHelpers.js';
import { saveSession, deleteSession, getAllSessions } from './sessionStore.js';

const runningTypers = new Map(); // `${userId}:${tokenIndex}` -> state
const TYPE_REFRESH_MS = 8000;

/**
 * AutoTyper oturumu başlat.
 * @param {string} userId
 * @param {number} tokenIndex
 * @param {string[]} channelIds
 */
export async function startAutoTyper(userId, tokenIndex, channelIds) {
  const key = `${userId}:${tokenIndex}`;
  stopAutoTyper(userId, tokenIndex, { silent: true });

  const login = await loginVaultAccount(userId, tokenIndex);
  if (!login.success) return { success: false, error: login.error };

  const state = {
    userId, tokenIndex, client: login.client, channelIds,
    running: true, typingCount: 0, startTime: Date.now(), timer: null,
  };
  runningTypers.set(key, state);

  saveSession('autotyper', userId, tokenIndex, { channelIds });

  const cycle = async () => {
    while (state.running) {
      for (const channelId of state.channelIds) {
        if (!state.running) break;
        try {
          const ch = await state.client.channels.fetch(channelId).catch(() => null);
          if (ch && ch.isText()) {
            await ch.sendTyping().catch(() => { });
            state.typingCount++;
          }
        } catch { }
        await sleep(Math.floor(TYPE_REFRESH_MS / state.channelIds.length));
      }
    }
  };
  cycle(); // async döngü — await edilmemesi normal

  console.log(`📤 [AutoTyper] Başlatıldı: ${login.username} → ${channelIds.join(', ')}`);
  return { success: true, username: login.username };
}

export function stopAutoTyper(userId, tokenIndex, opts = {}) {
  const key = `${userId}:${tokenIndex}`;
  const state = runningTypers.get(key);
  if (!state) return opts.silent ? false : { success: false, error: 'Bu hesap için AutoTyper çalışmıyor.' };

  state.running = false;
  destroyClient(state.client);
  runningTypers.delete(key);
  deleteSession('autotyper', userId, tokenIndex);
  console.log(`📤 [AutoTyper] Durduruldu: ${key}`);
  return { success: true };
}

export function isAutoTyperRunning(userId, tokenIndex) {
  return runningTypers.has(`${userId}:${tokenIndex}`);
}

export function getAutoTyperStats(userId, tokenIndex) {
  const state = runningTypers.get(`${userId}:${tokenIndex}`);
  if (!state) return null;
  return {
    channelIds: state.channelIds,
    typingCount: state.typingCount,
    durationMin: Math.floor((Date.now() - state.startTime) / 60000),
  };
}

export function getAllAutoTyperSessions() {
  return getAllSessions('autotyper');
}

/** Reboot Recovery */
export async function recoverAutoTypers() {
  const sessions = getAllSessions('autotyper');
  let recovered = 0;
  for (const s of sessions) {
    const res = await startAutoTyper(s.userId, s.tokenIndex, s.channelIds).catch(() => ({ success: false }));
    if (res.success) recovered++;
  }
  console.log(`📤 [AutoTyper] Reboot Recovery: ${recovered}/${sessions.length} oturum geri yüklendi.`);
  return recovered;
}
