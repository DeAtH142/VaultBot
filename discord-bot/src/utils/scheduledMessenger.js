// src/utils/scheduledMessenger.js — 🕐 Oto Mesaj/Post Motoru
// Belirlenen kanala, belirli aralıkla (dakika bazlı) mesaj atar. Reboot'ta geri yüklenir.
import { Client } from 'discord.js-selfbot-v13';
import { decrypt } from './crypto.js';
import { getToken } from './tokenStore.js';
import { readModuleJson, writeModuleJson } from './moduleStore.js';

const FILE = 'scheduled_messages.json';
const jobs = new Map(); // `${userId}:${tokenIndex}` -> { timers: [], config }

export function getScheduledJobs(userId) {
  const store = readModuleJson(FILE);
  return Object.entries(store)
    .filter(([key]) => key.startsWith(userId + ':'))
    .map(([key, cfg]) => ({ key, tokenIndex: Number(key.split(':')[1]), ...cfg }));
}

export function getAllScheduledJobs() {
  return Object.entries(readModuleJson(FILE)).map(([key, cfg]) => ({ key, ...cfg }));
}

function persist(userId, tokenIndex, config) {
  const store = readModuleJson(FILE);
  const key = `${userId}:${tokenIndex}`;
  if (config === null) delete store[key];
  else store[key] = config;
  writeModuleJson(FILE, store);
}

export async function startScheduledJob(userId, tokenIndex, config) {
  stopScheduledJob(userId, tokenIndex);

  const tokenObj = getToken(userId, tokenIndex);
  if (!tokenObj) throw new Error('Hesap kasada bulunamadı!');
  const rawToken = decrypt(tokenObj);

  const client = new Client({ checkUpdate: false });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Giriş zaman aşımı (15s)')), 15000);
    client.once('ready', () => { clearTimeout(t); resolve(); });
    client.once('error', (e) => { clearTimeout(t); reject(e); });
    client.login(rawToken).catch((e) => { clearTimeout(t); reject(e); });
  });

  const state = { client, timers: [], config };
  jobs.set(`${userId}:${tokenIndex}`, state);

  const scheduleNext = () => {
    // dakika bazlı interval + küçük jitter (bot davranışı)
    const jitter = Math.floor(Math.random() * 15000);
    const timer = setTimeout(async () => {
      try {
        const ch = await client.channels.fetch(config.channelId).catch(() => null);
        if (ch) {
          const msg = config.messages[Math.floor(Math.random() * config.messages.length)];
          await ch.send(msg);
          state.sentCount = (state.sentCount || 0) + 1;
          state.lastSentAt = new Date().toISOString();
        }
      } catch (err) {
        console.error('[ScheduledMessenger] Gönderim hatası:', err.message);
      }
      scheduleNext();
    }, config.intervalMinutes * 60000 + jitter);
    state.timers.push(timer);
  };

  scheduleNext();
  persist(userId, tokenIndex, { ...config, sentCount: 0 });
  return true;
}

export function stopScheduledJob(userId, tokenIndex) {
  const key = `${userId}:${tokenIndex}`;
  const state = jobs.get(key);
  if (!state) { persist(userId, tokenIndex, null); return false; }
  state.timers.forEach(clearTimeout);
  try { state.client.destroy(); } catch { }
  jobs.delete(key);
  persist(userId, tokenIndex, null);
  return true;
}

export function getJobState(userId, tokenIndex) {
  const state = jobs.get(`${userId}:${tokenIndex}`);
  if (!state) return null;
  return {
    channel: state.config.channelId,
    intervalMinutes: state.config.intervalMinutes,
    messages: state.config.messages,
    sentCount: state.sentCount || 0,
    lastSentAt: state.lastSentAt || null,
  };
}

export function isJobRunning(userId, tokenIndex) {
  return jobs.has(`${userId}:${tokenIndex}`);
}

/** Reboot Recovery */
export async function recoverScheduledMessengers() {
  const store = readModuleJson(FILE);
  for (const [key, cfg] of Object.entries(store)) {
    const [userId, idxStr] = key.split(':');
    console.log(`[ScheduledMessenger] Reboot Recovery: ${key} geri yükleniyor...`);
    startScheduledJob(userId, Number(idxStr), cfg).catch(err =>
      console.error(`[ScheduledMessenger] Recovery hatası (${key}):`, err.message));
  }
}
