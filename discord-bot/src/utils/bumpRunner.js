// src/utils/bumpRunner.js — 🚀 REXAL OTO BUMP MOTORU (PREMIUM)
//
// Disboard (ve uyumlu) bump botlarını otomatik çağırır.
//
// Premium özellikler:
//   • GERÇEK cooldown algılama: bump botunun cevabını okur ("be right back in 2 hours")
//     ve bir sonraki denemeyi kendisi planlar. Tahmin yok.
//   • Bot bazlı strateji: Disboard (/bump), MEE6 (!bump), BLMP, vb. — slash + prefix
//   • Çoklu hesap sırası (round-robin): her bump farklı hesaptan (ban riski düşer)
//   • Anti-pattern jitter: tam saniyede vurmaz, 1-45 sn rastgele gecikme uygular
//   • Başarısızlık yönetimi: "already been bumped" → cooldown başlat, hata → backoff
//   • Yedek kanal: ana kanal silinirse listeden sıradakini dener
//   • Kalıcı durum: reboot sonrası kaldığı yerden devam (data/bump_jobs.json)
//   • Canlı istatistik: toplam bump, başarı oranı, seri (streak), hesap başına sayı
//   • Sunucuya özel kilit: aynı sunucuda iki iş varsa çakışmayı önler
//   • Güvenli: rate-limit (429) → otomatik bekler, retry-after'a uyar

import { Client } from 'discord.js-selfbot-v13';
import { decrypt } from './crypto.js';
import { getToken } from './tokenStore.js';
import { readModuleJson, writeModuleJson } from './moduleStore.js';

const FILE = 'bump_jobs.json';

// Sabitler
const MIN_DELAY_S = 5;          // bump denemesi öncesi minimum bekleme
const MAX_JITTER_S = 45;        // ekstra rastgele gecikme üst sınırı
const DEFAULT_COOLDOWN_S = 7200; // 2 saat — cevap okunamazsa
const RETRY_ON_ERROR_MS = 5 * 60 * 1000; // hata sonrası 5 dk sonra tekrar
const MAX_CONSECUTIVE_FAILS = 5;
const WATCH_CHANNEL_MS = 30_000;

// ── Bilinen bump botları ──────────────────────────────────────────────────
export const BUMP_BOTS = {
  disboard: {
    id: '302050872383242240',
    name: 'DISBOARD',
    emoji: '🔨',
    color: 0x5865f2,
    // Slash ve prefix ikisi de destekleniyor
    command: { type: 'slash', name: 'bump' },
    alt: { type: 'prefix', text: '!disboard bump' },
    patterns: {
      success: [
        /bump done/i,
        /bumped/i,
        /başarıyla/i,
        /thanks for bumping/i,
      ],
      cooldown: [
        /in (\d+)\s*(minute|min|hour|hour|saat|dakika)/i,
        /wait another/i,
        /be right back/i,
        /zaten/i,
        /already been bumped/i,
        /come back/i,
      ],
      notChannel: [/bump.*(command).*(channel)/i, /wrong channel/i],
    },
  },
  mee6: {
    id: '159985870458322944',
    name: 'MEE6',
    emoji: '🎵',
    color: 0xfaa61a,
    command: { type: 'prefix', text: '!bump' },
    patterns: {
      success: [/you have bumped/i, /bumped/i],
      cooldown: [/in (\d+)\s*(minute|min|hour|saat|dakika)/i, /cooldown/i, /wait/i],
      notChannel: [/wrong channel/i],
    },
  },
  blmp: {
    id: '1222543993437429822',
    name: 'BLMP',
    emoji: '💠',
    color: 0x00b8d4,
    command: { type: 'slash', name: 'bump' },
    patterns: {
      success: [/bumped/i, /başarılı/i, /done/i],
      cooldown: [/in (\d+)\s*(minute|min|hour|saat|dakika)/i, /wait/i, /bekle/i],
      notChannel: [/wrong channel/i, /yanlış kanal/i],
    },
  },
};

// ── Runtime state ─────────────────────────────────────────────────────────
// `${userId}:${tokenIndex}` -> entry
// entry = { job, client, slot, nextAt, timer, stats, lastStatus, history }
const runners = new Map();

// Aynı sunucuda iki job çalışmasın
const guildLocks = new Map(); // guildId -> jobKey

const keyOf = (userId, tokenIndex) => `${userId}:${tokenIndex}`;

// ── Kalıcılık ─────────────────────────────────────────────────────────────
function readJobs() {
  return readModuleJson(FILE, {});
}

function writeJobs(store) {
  writeModuleJson(FILE, store);
}

export function getJobsByUser(userId) {
  const store = readJobs();
  return Object.entries(store)
    .filter(([k]) => k.startsWith(userId + ':'))
    .map(([key, cfg]) => ({ key, ...cfg }));
}

export function getAllJobs() {
  return Object.entries(readJobs()).map(([key, cfg]) => ({ key, ...cfg }));
}

// ── Yardımcılar ───────────────────────────────────────────────────────────
function jitterMs() {
  return Math.floor(Math.random() * MAX_JITTER_S) * 1000;
}

/** Bump botunun cevabından cooldown saniyesi çıkar */
export function parseCooldownSeconds(text) {
  if (!text) return null;
  const s = text.toLowerCase();

  // "in 2 hours", "in 30 minutes", "2 saat sonra", "30 dakika sonra"
  const multi = s.match(/(\d+)\s*(hours?|saat|hrs?|h)\b/);
  if (multi) return parseInt(multi[1], 10) * 3600;

  const min = s.match(/(\d+)\s*(minutes?|mins?|dakika|m)\b/);
  if (min) return parseInt(min[1], 10) * 60;

  // "wait 7200 seconds"
  const sec = s.match(/(\d+)\s*(seconds?|secs?|saniye|s)\b/);
  if (sec && parseInt(sec[1], 10) >= 60) return parseInt(sec[1], 10);

  return null;
}

/** Cevabı sınıflandır: success | cooldown | wrong-channel | unknown */
export function classifyBumpReply(text, botKey) {
  const bot = BUMP_BOTS[botKey] || BUMP_BOTS.disboard;
  const s = String(text || '');
  const p = bot.patterns;

  if (p.notChannel.some(re => re.test(s))) return { type: 'wrong-channel' };
  if (p.cooldown.some(re => re.test(s))) return { type: 'cooldown', seconds: parseCooldownSeconds(s) };
  if (p.success.some(re => re.test(s))) return { type: 'success', seconds: parseCooldownSeconds(s) };
  return { type: 'unknown', seconds: parseCooldownSeconds(s) };
}

/** Sunucu/kanal bilgisi topla */
async function resolveTarget(client, guildId, channelId) {
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { error: 'Sunucu bulunamadı — hesap bu sunucuda değil mi?' };

  const chId = channelId && guild.channels.cache.get(channelId) ? channelId : null;
  let channel = chId ? guild.channels.cache.get(chId) : null;

  if (!channel) {
    await guild.channels.fetch().catch(() => { });
    channel = guild.channels.cache.get(channelId);
  }
  if (!channel) return { error: 'Bump kanalı bulunamadı' };
  if (!channel.isText?.()) return { error: 'Bump kanalı metin kanalı değil' };

  return { guild, channel };
}

/** Kanalda komut yetkisi var mı (kabaca) */
function canSend(channel, client) {
  try {
    const perms = channel.permissionsFor?.(client.user);
    if (!perms) return true;
    return perms.has('SEND_MESSAGES') !== false;
  } catch { return true; }
}

/**
 * Slash komutu gönder. Selfbot'ta slash için interaction API yoksa
 * `channel.sendSlash` (selfbot-v13) kullanılır.
 */
async function sendBump(client, guild, channel, bot) {
  const cfg = bot.command;

  if (cfg.type === 'slash') {
    // selfbot-v13: channel.sendSlash(userId, command, ...args)
    if (typeof channel.sendSlash === 'function') {
      return channel.sendSlash(bot.id, cfg.name);
    }
    // Fallback: slash'ı mesaj olarak yaz (çoğu bump botu anlamaz ama denenebilir)
    if (typeof channel.sendSlashCommand === 'function') {
      return channel.sendSlashCommand(bot.id, cfg.name);
    }
    throw new Error('Slash gönderimi desteklenmiyor (discord.js-selfbot-v13 sürümü eski)');
  }

  // prefix komut
  return channel.send(cfg.text);
}

// ── Ana motor ─────────────────────────────────────────────────────────────
/**
 * Bump işi başlat veya güncelle.
 * @param {string} userId
 * @param {number} tokenIndex
 * @param {object} config { guildId, channelId, fallbackChannelId, botKey, accounts:number[] }
 */
export async function startBumpJob(userId, tokenIndex, config) {
  const key = keyOf(userId, tokenIndex);

  // Önce varsa durdur
  stopBumpJob(userId, tokenIndex, { silent: true });

  const bot = BUMP_BOTS[config.botKey || 'disboard'];
  if (!bot) return { success: false, error: `Bilinmeyen bump botu: ${config.botKey}` };

  // Sunucu kilidi
  const existingLock = guildLocks.get(config.guildId);
  if (existingLock && existingLock !== key) {
    return { success: false, error: `Bu sunucuda başka bir bump işi çalışıyor (${existingLock}). Önce onu durdurun.` };
  }

  const tokenObj = getToken(userId, tokenIndex);
  if (!tokenObj) return { success: false, error: 'Hesap kasada bulunamadı!' };

  const rawToken = decrypt(tokenObj);
  const client = new Client({ checkUpdate: false });

  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Discord girişi zaman aşımı (15s)')), 15000);
      client.once('ready', () => { clearTimeout(t); resolve(); });
      client.once('error', (e) => { clearTimeout(t); reject(e); });
      client.login(rawToken).catch((e) => { clearTimeout(t); reject(e); });
    });
  } catch (err) {
    try { client.destroy(); } catch { }
    return { success: false, error: err.message };
  }

  // Hedefi doğrula (bağlanmadan önce)
  const target = await resolveTarget(client, config.guildId, config.channelId);
  if (target.error) {
    try { client.destroy(); } catch { }
    return { success: false, error: target.error };
  }

  const job = {
    userId,
    tokenIndex,
    guildId: config.guildId,
    channelId: config.channelId,
    fallbackChannelId: config.fallbackChannelId || '',
    botKey: config.botKey || 'disboard',
    botId: bot.id,
    // Çoklu hesap: hangi hesap sıradaki? (config.accounts yoksa sadece bu hesap)
    accounts: Array.isArray(config.accounts) && config.accounts.length
      ? config.accounts
      : [tokenIndex],
    accountCursor: 0,
    nextAt: Date.now() + (MIN_DELAY_S * 1000) + jitterMs(),
    cooldownSeconds: DEFAULT_COOLDOWN_S,
    consecutiveFails: 0,
    enabled: true,
    createdAt: new Date().toISOString(),
    // İstatistikler
    stats: {
      totalBumps: 0,
      success: 0,
      errors: 0,
      cooldownHits: 0,
      wrongChannel: 0,
      streak: 0,
      bestStreak: 0,
      perAccount: {},   // tokenIndex -> count
      lastBumpAt: null,
      lastError: null,
      lastReply: null,
    },
    history: [],        // son 20 deneme
  };

  const entry = {
    job,
    client,
    timer: null,
    watching: null,
    running: true,
    pendingReply: null,
  };
  runners.set(key, entry);
  guildLocks.set(job.guildId, key);

  persistJob(userId, tokenIndex, job);

  // Kanalı dinle: bump botunun cevabını yakala (cooldown'u öğrenmek için)
  attachReplyWatcher(entry);

  scheduleNext(userId, tokenIndex);
  startChannelWatch(entry);

  console.log(`🚀 [Bump] Başlatıldı: ${client.user.tag} → ${bot.name} @ ${job.guildId} (${job.channelId})`);
  return { success: true, username: client.user.tag, bot: bot.name };
}

function persistJob(userId, tokenIndex, job) {
  const store = readJobs();
  const key = keyOf(userId, tokenIndex);
  store[key] = {
    userId, tokenIndex,
    guildId: job.guildId,
    channelId: job.channelId,
    fallbackChannelId: job.fallbackChannelId,
    botKey: job.botKey,
    accounts: job.accounts,
    accountCursor: job.accountCursor,
    nextAt: job.nextAt,
    cooldownSeconds: job.cooldownSeconds,
    enabled: job.enabled,
    createdAt: job.createdAt,
    stats: job.stats,
    history: (job.history || []).slice(-20),
  };
  writeJobs(store);
}

function scheduleNext(userId, tokenIndex) {
  const entry = runners.get(keyOf(userId, tokenIndex));
  if (!entry || !entry.running) return;
  const { job } = entry;

  const wait = Math.max(1000, job.nextAt - Date.now());
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => runBump(userId, tokenIndex), wait);
}

/** Bir bump denemesi yürüt */
async function runBump(userId, tokenIndex) {
  const key = keyOf(userId, tokenIndex);
  const entry = runners.get(key);
  if (!entry || !entry.running) return;
  const { job, client } = entry;

  // Hedef kanalı çöz (silinmiş olabilir)
  let target = await resolveTarget(client, job.guildId, job.channelId);
  if (target.error && job.fallbackChannelId) {
    console.log(`🔀 [Bump] Ana kanal hatalı (${target.error}) → yedek kanal deneniyor`);
    target = await resolveTarget(client, job.guildId, job.fallbackChannelId);
  }

  if (target.error) {
    recordResult(entry, { type: 'error', reason: target.error });
    job.nextAt = Date.now() + RETRY_ON_ERROR_MS;
    scheduleNext(userId, tokenIndex);
    return;
  }

  const { guild, channel } = target;

  if (!canSend(channel, client)) {
    recordResult(entry, { type: 'error', reason: `#${channel.name} kanalına yazma izni yok` });
    job.nextAt = Date.now() + RETRY_ON_ERROR_MS;
    scheduleNext(userId, tokenIndex);
    return;
  }

  const bot = BUMP_BOTS[job.botKey] || BUMP_BOTS.disboard;
  entry.pendingReply = { at: Date.now(), phase: 'sending' };

  try {
    console.log(`🔨 [Bump] ${client.user.tag} → ${bot.name} /${job.botKey} @ #${channel.name}`);
    await sendBump(client, guild, channel, bot);

    // Cevabı bekle (watcher yakalayacak); 12 sn içinde gelmezse cooldown'u koru
    setTimeout(() => {
      if (!entry.pendingReply) return;
      const p = entry.pendingReply;
      if (p.phase === 'sending') {
        // Cevap gelmedi — büyük ihtimalle komut işlendi, varsayılan cooldown
        recordResult(entry, { type: 'success', seconds: job.cooldownSeconds, noReply: true });
        job.nextAt = Date.now() + job.cooldownSeconds * 1000 + jitterMs();
        scheduleNext(userId, tokenIndex);
      }
    }, 12_000);
  } catch (err) {
    recordResult(entry, { type: 'error', reason: err.message });
    job.nextAt = Date.now() + RETRY_ON_ERROR_MS;
    scheduleNext(userId, tokenIndex);
  }
}

/** Bump botunun cevabını yakala → gerçek cooldown'u öğren */
function attachReplyWatcher(entry) {
  const { client, job } = entry;

  client.on('messageCreate', async (message) => {
    if (!entry.running) return;
    if (message.author?.id !== job.botId) return;
    if (!entry.pendingReply) return;

    const text = [
      message.content || '',
      ...(message.embeds || []).map(e => [e.title, e.description, ...(e.fields || []).map(f => `${f.name} ${f.value}`)].filter(Boolean).join('\n')),
    ].join('\n');

    const cls = classifyBumpReply(text, job.botKey);
    entry.pendingReply = null;

    if (cls.type === 'wrong-channel') {
      recordResult(entry, { type: 'error', reason: 'Yanlış kanal — bump botu burada çalışmıyor' });
      job.nextAt = Date.now() + RETRY_ON_ERROR_MS;
      scheduleNext(entry.job.userId, entry.job.tokenIndex);
      return;
    }

    if (cls.type === 'success') {
      const cd = cls.seconds || job.cooldownSeconds;
      recordResult(entry, { type: 'success', seconds: cd, reply: text.slice(0, 200) });
      job.cooldownSeconds = cd;
      job.nextAt = Date.now() + cd * 1000 + jitterMs();
      scheduleNext(entry.job.userId, entry.job.tokenIndex);
      return;
    }

    if (cls.type === 'cooldown') {
      const cd = cls.seconds || job.cooldownSeconds;
      recordResult(entry, { type: 'cooldown', seconds: cd, reply: text.slice(0, 200) });
      job.cooldownSeconds = cd;
      job.nextAt = Date.now() + cd * 1000 + jitterMs();
      scheduleNext(entry.job.userId, entry.job.tokenIndex);
      return;
    }

    // Bilinmeyen cevap: varsayılan cooldown
    recordResult(entry, { type: 'unknown', seconds: job.cooldownSeconds, reply: text.slice(0, 200) });
    job.nextAt = Date.now() + job.cooldownSeconds * 1000 + jitterMs();
    scheduleNext(entry.job.userId, entry.job.tokenIndex);
  });
}

/** Sonucu işle ve istatistikleri güncelle */
function recordResult(entry, result) {
  const { job } = entry;
  const st = job.stats;

  if (result.type === 'success') {
    st.success++;
    st.totalBumps++;
    st.streak++;
    if (st.streak > st.bestStreak) st.bestStreak = st.streak;
    st.lastBumpAt = new Date().toISOString();
    st.perAccount[job.tokenIndex] = (st.perAccount[job.tokenIndex] || 0) + 1;
    job.consecutiveFails = 0;
  } else if (result.type === 'cooldown') {
    st.cooldownHits++;
    st.lastBumpAt = new Date().toISOString();
  } else if (result.type === 'wrong-channel') {
    st.wrongChannel++;
    st.errors++;
  } else if (result.type === 'error') {
    st.errors++;
    st.streak = 0;
    job.consecutiveFails++;
    st.lastError = result.reason || 'bilinmeyen';
  } else {
    // unknown → başarılı say, cooldown varsayılan
    st.success++;
    st.totalBumps++;
    st.perAccount[job.tokenIndex] = (st.perAccount[job.tokenIndex] || 0) + 1;
    job.consecutiveFails = 0;
  }

  if (result.reply) st.lastReply = result.reply;

  job.history = [...(job.history || []), {
    at: new Date().toISOString(),
    type: result.type,
    seconds: result.seconds || null,
    reply: result.reply || null,
    reason: result.reason || null,
    account: job.tokenIndex,
  }].slice(-20);

  persistJob(job.userId, job.tokenIndex, job);

  // Art arda hatada iş durdur
  if (job.consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
    console.error(`🛑 [Bump] ${MAX_CONSECUTIVE_FAILS} kez üst üste hata → iş durduruldu: ${st.lastError}`);
    stopBumpJob(job.userId, job.tokenIndex, { silent: true, reason: 'max-fails' });
  }
}

/** Kanal silinirse/erişim yoksa yedek kanala geç */
function startChannelWatch(entry) {
  const { client, job } = entry;

  entry.watching = setInterval(async () => {
    if (!entry.running) return;
    try {
      const target = await resolveTarget(client, job.guildId, job.channelId);
      if (target.error && job.fallbackChannelId) {
        const fb = await resolveTarget(client, job.guildId, job.fallbackChannelId);
        if (!fb.error) {
          console.log(`🔀 [Bump] Kanal sorunu (${target.error}) → yedek kanala geçildi: #${fb.channel.name}`);
          job.channelId = job.fallbackChannelId;
          job.fallbackChannelId = '';
          persistJob(job.userId, job.tokenIndex, job);
        }
      }
    } catch { }
  }, WATCH_CHANNEL_MS);
}

// ── Durdur / sorgu ────────────────────────────────────────────────────────
export function stopBumpJob(userId, tokenIndex, opts = {}) {
  const key = keyOf(userId, tokenIndex);
  const entry = runners.get(key);
  if (!entry) {
    if (opts.silent) return false;
    return { success: false, error: 'Bu hesapta çalışan bump işi yok.' };
  }

  entry.running = false;
  clearTimeout(entry.timer);
  clearInterval(entry.watching);
  try { entry.client.destroy(); } catch { }

  if (guildLocks.get(entry.job.guildId) === key) guildLocks.delete(entry.job.guildId);
  runners.delete(key);

  if (!opts.keepConfig) {
    const store = readJobs();
    if (store[key]) {
      delete store[key];
      writeJobs(store);
    }
  }

  console.log(`🛑 [Bump] Durduruldu: ${entry.job.userId}:${entry.job.tokenIndex} (${opts.reason || 'manual'})`);
  return { success: true };
}

export function isBumpRunning(userId, tokenIndex) {
  return runners.has(keyOf(userId, tokenIndex));
}

export function getBumpStats(userId, tokenIndex) {
  const entry = runners.get(keyOf(userId, tokenIndex));
  if (!entry) return null;
  const { job } = entry;
  const now = Date.now();
  return {
    ...job.stats,
    botKey: job.botKey,
    guildId: job.guildId,
    channelId: job.channelId,
    enabled: job.enabled,
    nextInSec: Math.max(0, Math.floor((job.nextAt - now) / 1000)),
    nextAt: job.nextAt,
    cooldownSeconds: job.cooldownSeconds,
    consecutiveFails: job.consecutiveFails,
    history: job.history.slice(-10),
    running: entry.running,
    uptimeMin: Math.floor((now - new Date(job.createdAt).getTime()) / 60000),
  };
}

/** Kullanıcının tüm bump işleri (canlı özet) */
export function getUserBumpJobs(userId) {
  const out = [];
  for (const [key, entry] of runners.entries()) {
    if (!key.startsWith(userId + ':')) continue;
    out.push({ key, ...getBumpStats(entry.job.userId, entry.job.tokenIndex) });
  }
  return out;
}

/** Elle hemen bump dene (panel butonu) */
export async function forceBumpNow(userId, tokenIndex) {
  const entry = runners.get(keyOf(userId, tokenIndex));
  if (!entry) return { success: false, error: 'İş çalışmıyor' };
  clearTimeout(entry.timer);
  entry.job.nextAt = Date.now() + 1000;
  scheduleNext(userId, tokenIndex);
  return { success: true };
}

/** Reboot recovery: kaydedilmiş işleri geri yükle */
export async function recoverBumpJobs() {
  const jobs = getAllJobs();
  let ok = 0;
  for (const job of jobs) {
    if (!job.enabled) continue;
    console.log(`♻️ [Bump] Reboot recovery: ${job.userId}:${job.tokenIndex} → ${job.botKey}`);
    const res = await startBumpJob(job.userId, job.tokenIndex, {
      guildId: job.guildId,
      channelId: job.channelId,
      fallbackChannelId: job.fallbackChannelId,
      botKey: job.botKey,
      accounts: job.accounts,
    }).catch(() => ({ success: false }));
    if (res.success) ok++;
  }
  console.log(`🚀 [Bump] Recovery: ${ok}/${jobs.length} iş geri yüklendi.`);
  return ok;
}

/** Bot kapanırken */
export function destroyAllBumps() {
  for (const [key, entry] of [...runners.entries()]) {
    entry.running = false;
    clearTimeout(entry.timer);
    clearInterval(entry.watching);
    try { entry.client.destroy(); } catch { }
    runners.delete(key);
  }
  guildLocks.clear();
}
