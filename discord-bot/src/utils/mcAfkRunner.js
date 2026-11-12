// src/utils/mcAfkRunner.js — ⛏️ Minecraft AFK Motoru
// Mineflayer tabanlı; hesapları sunucuya bağlar, anti-AKF hareketi yapar,
// koparsa otomatik yeniden bağlanır. Discord paneli: src/commands/mcafk.js
import fs from 'node:fs';
import path from 'node:path';
import mineflayer from 'mineflayer';

const DATA_DIR = path.join(process.cwd(), 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'mc_afk.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, '{}', 'utf8');
}
function readStore() {
  ensureFile();
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}
function writeStore(store) {
  ensureFile();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function getMcAccounts(userId) {
  return readStore()[userId]?.accounts ?? [];
}
export function saveMcAccounts(userId, accounts) {
  const store = readStore();
  if (!store[userId]) store[userId] = {};
  store[userId].accounts = accounts;
  writeStore(store);
}

export function getMcStats(userId, accountIndex) {
  const running = runningBots.get(`${userId}:${accountIndex}`);
  if (running) {
    return {
      running: true,
      username: running.bot?.username ?? running.cfg.username,
      uptimeMin: Math.floor((Date.now() - running.startTime) / 60000),
      reconnections: running.reconnections,
      lastChat: running.lastChat || null,
    };
  }
  const sess = readStore()[userId]?.sessions?.[String(accountIndex)];
  if (sess) {
    return { running: false, ...sess };
  }
  return null;
}

const runningBots = new Map(); // `${userId}:${accountIndex}` -> state
const SWING_INTERVAL_MS = 45_000;   // Anti-AFK: her 45 sn kol sallar
const RECONNECT_DELAY_MS = 8_000;   // Kopunca bekleme
const MAX_RECONNECTS = 999;         // Sürekli yeniden bağlan

function createBot(cfg, state) {
  const opts = {
    host: cfg.host,
    port: Number(cfg.port) || 25565,
    username: cfg.username,
    version: cfg.version || false,
    auth: cfg.authMode === 'offline' ? 'microsoft' : undefined, // offline sunucularda microsoft auth header gönderilmez ama isim serbest
    hideErrors: true,
  };

  // Offline (cracked) sunucu: kimlik doğrulaması gerekmez
  if (cfg.authMode === 'offline') delete opts.auth;

  const bot = mineflayer.createBot(opts);
  state.bot = bot;
  state.connectedAt = Date.now();

  bot.once('spawn', () => {
    state.spawned = true;
    state.reconnections++;
    // Anti-AFK döngüsü: kol salla + hafif dön
    state.swingTimer = setInterval(() => {
      try {
        bot.swingArm();
        bot.look(bot.entity.yaw + (Math.random() * 0.6 - 0.3), bot.entity.pitch, false);
      } catch { /* yut */ }
    }, SWING_INTERVAL_MS);
  });

  bot.on('messagestr', (msg) => {
    state.lastChat = `[${new Date().toLocaleTimeString('tr-TR')}] ${msg}`.slice(0, 180);
    if (state.chatLog.length > 20) state.chatLog.shift();
    state.chatLog.push(state.lastChat);
  });

  bot.on('kick', (reason) => {
    state.chatLog.push(`⚠️ Kick: ${String(reason).slice(0, 120)}`);
  });

  bot.on('end', async (reason) => {
    clearInterval(state.swingTimer);
    state.connected = false;
    if (!state.running) return;
    state.reconnects++;
    if (state.reconnects > MAX_RECONNECTS) return;
    // Kapanmadiysa yeniden dene
    setTimeout(() => {
      if (!state.running) return;
      try { bot.end(); } catch { /* yut */ }
      createBot(cfg, state);
    }, RECONNECT_DELAY_MS);
  });

  bot.on('error', () => { /* end tetiklenir; sessiz */ });

  return bot;
}

/**
 * Minecraft AFK botunu başlat.
 * @param {string} userId
 * @param {number} accountIndex
 * @param {{host,port,username,version,authMode,password}} cfg
 */
export async function startMcAfk(userId, accountIndex, cfg) {
  const key = `${userId}:${accountIndex}`;
  stopMcAfk(userId, accountIndex, { silent: true });

  if (!cfg.host || !cfg.username) return { success: false, error: 'Host ve kullanıcı adı zorunlu' };

  const state = {
    userId, accountIndex, cfg, running: true, connected: false, spawned: false,
    reconnections: 0, reconnects: 0, startTime: Date.now(), lastChat: null,
    chatLog: [], swingTimer: null, bot: null,
  };
  runningBots.set(key, state);

  // Kalıcılık yaz
  const store = readStore();
  if (!store[userId]) store[userId] = {};
  if (!store[userId].sessions) store[userId].sessions = {};
  store[userId].sessions[String(accountIndex)] = {
    host: cfg.host, port: cfg.port, username: cfg.username,
    version: cfg.version || '', authMode: cfg.authMode || 'offline',
    autoRestart: true, savedAt: new Date().toISOString(),
  };
  writeStore(store);

  try {
    createBot(cfg, state);
    return { success: true };
  } catch (err) {
    runningBots.delete(key);
    return { success: false, error: err.message };
  }
}

export function sendMcChat(userId, accountIndex, message) {
  const state = runningBots.get(`${userId}:${accountIndex}`);
  if (!state?.bot || !state.spawned) return { success: false, error: 'Bot bağlı değil' };
  try {
    state.bot.chat(String(message).slice(0, 256));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function sendMcCommand(userId, accountIndex, command) {
  return sendMcChat(userId, accountIndex, command);
}

export function stopMcAfk(userId, accountIndex, { silent = false } = {}) {
  const key = `${userId}:${accountIndex}`;
  const state = runningBots.get(key);
  if (!state) {
    if (silent) return { success: false };
    return { success: false, error: 'Bu hesapta aktif bot yok' };
  }
  state.running = false;
  clearInterval(state.swingTimer);
  try { state.bot?.end(); } catch { /* yut */ }
  runningBots.delete(key);
  return { success: true };
}

export function stopAllMcAfk(userId) {
  let stopped = 0;
  for (const [key] of runningBots) {
    if (key.startsWith(`${userId}:`)) {
      if (stopMcAfk(userId, Number(key.split(':')[1]), { silent: true }).success) stopped++;
    }
  }
  return stopped;
}

/** Bot yeniden başladığında kayıtlı oturumları kaldığı yerden sürdürür */
export async function recoverMcAfks() {
  const store = readStore();
  const entries = Object.entries(store);
  let revived = 0;
  for (const [userId, cfg] of entries) {
    for (const [idxStr, sess] of Object.entries(cfg.sessions || {})) {
      if (!sess.autoRestart) continue;
      const res = await startMcAfk(userId, Number(idxStr), sess);
      if (res.success) revived++;
    }
  }
  if (revived) console.log(`⛏️ [MCAFk] ${revived} Minecraft oturumu kaldığı yerden devam ediyor.`);
}
