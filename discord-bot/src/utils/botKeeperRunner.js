// src/utils/botKeeperRunner.js — 🤖 REXAL Discord Bot Aktif Tutucu Motoru
// Kullanıcının KENDİ bot tokenlerini 7/24 aktif tutar (discord.js normal Client).
// Her botta: durum (online/idle/dnd/invisible) + aktivite tipi ve metni ayarlanır.
// Sistem botu restart olsa bile tüm botları Reboot Recovery ile geri başlatır.
//
// Aktivite tipleri: OYUYOR(0) | YAYINDA(1) | DİNLİYOR(2) | İZLİYOR(3) | YARIŞ(5)

import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import { saveSession, getAllSessions, deleteSession } from './sessionStore.js';

const MODULE = 'botkeeper';
const KEEPALIVE_MS = 6 * 60 * 1000; // 6 dk'da bir presence tazele

const activeBots = new Map(); // `${ownerId}:${botId}` -> { client, config, keepAliveTimer, startedAt }

export const ACTIVITY_TYPES = [
  { value: 'OYUYOR', label: '🎮 Oynuyor', type: ActivityType.Playing },
  { value: 'YAYINDA', label: '📡 Yayında', type: ActivityType.Streaming },
  { value: 'DINLIYOR', label: '🎧 Dinliyor', type: ActivityType.Listening },
  { value: 'IZLIYOR', label: '👁️ İzliyor', type: ActivityType.Watching },
  { value: 'YARISIYOR', label: '🏁 Yarışıyor', type: ActivityType.Competing },
];

const STATUS_MAP = {
  online: 'online', idle: 'idle', dnd: 'dnd', invisible: 'invisible',
  gorunmez: 'invisible', bosta: 'idle', rahatsiz: 'dnd',
};

function activityTypeOf(value) {
  return ACTIVITY_TYPES.find(a => a.value === value)?.type ?? ActivityType.Playing;
}

/** Aktivite payload'ını derler */
function buildActivity(cfg) {
  if (!cfg.activityText && cfg.activityType !== 'YAYINDA') return [];
  const map = { OYUYOR: ActivityType.Playing, YAYINDA: ActivityType.Streaming, DINLIYOR: ActivityType.Listening, IZLIYOR: ActivityType.Watching, YARISIYOR: ActivityType.Competing };
  const type = map[cfg.activityType] ?? ActivityType.Playing;
  const act = { name: cfg.activityText || 'Discord', type };
  if (type === ActivityType.Streaming) act.url = 'https://twitch.tv/discord'; // streaming link zorunlu
  return [act];
}

function applyPresence(entry) {
  try {
    entry.client.user.setPresence({
      status: entry.config.status,
      activities: buildActivity(entry.config),
    });
  } catch (err) {
    console.warn(`[BotKeeper] presence hatası (${entry.botId}):`, err.message);
  }
}

function startKeepAlive(entry) {
  clearInterval(entry.keepAliveTimer);
  entry.keepAliveTimer = setInterval(() => {
    if (entry.client?.isReady?.()) applyPresence(entry);
  }, KEEPALIVE_MS);
  entry.keepAliveTimer.unref?.();
}

/**
 * Bir botu aktif tutmaya başla.
 * @param {string} ownerId panel sahibi kullanıcı
 * @param {string} botToken BOT tokeni (MTI... gibi)
 * @param {{status?, activityType?, activityText?}} config
 */
export async function addBot(ownerId, botToken, config = {}) {
  botToken = (botToken || '').trim();
  if (!botToken || botToken.length < 40) {
    return { ok: false, error: 'Bot tokeni geçersiz görünüyor. Token "MTIxxx..." gibi uzun bir dizi olmalı.' };
  }

  const status = STATUS_MAP[(config.status || '').toLowerCase()] || 'online';
  const cfg = {
    status,
    activityType: config.activityType || 'OYUYOR',
    activityText: (config.activityText || '').trim(),
  };

  // Tekrar eklenmeye çalışılıyorsa önce kapat (üzerine yaz)
  const existingEntry = [...activeBots.entries()].find(([, v]) => v.ownerId === ownerId && v.rawToken === botToken);
  if (existingEntry) {
    stopBotById(existingEntry[0], { silent: true });
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    restRequestTimeout: 20000,
  });

  const entry = {
    ownerId, botId: null, rawToken: botToken,
    client, config, keepAliveTimer: null, startedAt: Date.now(),
  };

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Bot giriş zaman aşımı (20s).')), 20000);
      client.once('ready', () => { clearTimeout(timeout); resolve(); });
      client.once('error', (err) => { clearTimeout(timeout); reject(err); });
      client.login(botToken).catch((err) => { clearTimeout(timeout); reject(err); });
    });

    entry.botId = client.user.id;
    applyPresence(entry);
    startKeepAlive(entry);

    const key = `${ownerId}:${entry.botId}`;
    activeBots.set(key, entry);

    saveSession(MODULE, ownerId, entry.botId, {
      ownerKey: ownerId,
      botTag: client.user.tag,
      botTokenEncrypted: Buffer.from(botToken, 'utf8').toString('base64'), // temel gizleme (aynı klasör şifre mantığıyla devralınabilir)
      status: cfg.status,
      activityType: cfg.activityType,
      activityText: cfg.activityText,
    });

    // Yeniden bağlanma: bağlantı koparsa backoff ile tekrar login
    client.on('close', async () => {
      console.warn(`[BotKeeper] Bağlantı koptu: ${entry.botId} — yeniden bağlanılıyor...`);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise(r => setTimeout(r, Math.min(60000, 5000 * 2 ** (attempt - 1))));
        try {
          const nc = new Client({ intents: [GatewayIntentBits.Guilds] });
          await new Promise((resolve, reject) => {
            const tm = setTimeout(() => reject(new Error('timeout')), 20000);
            nc.once('ready', () => { clearTimeout(tm); resolve(); });
            nc.login(botToken).catch((e) => { clearTimeout(tm); reject(e); });
          });
          try { entry.client.destroy(); } catch { }
          entry.client = nc;
          applyPresence(entry);
          startKeepAlive(entry);
          console.log(`✅ [BotKeeper] Yeniden bağlandı: ${entry.botId} (deneme ${attempt})`);
          return;
        } catch (err) {
          console.warn(`[BotKeeper] Yeniden bağlanma ${attempt}/5 (${entry.botId}): ${err.message}`);
        }
      }
      console.error(`[BotKeeper] ${entry.botId} tamamen koptu — recovery bekleniyor.`);
    });

    return {
      ok: true,
      botTag: client.user.tag,
      botId: entry.botId,
      avatar: client.user.displayAvatarURL(),
      status: cfg.status,
      activityType: cfg.activityType,
      activityText: cfg.activityText,
    };
  } catch (err) {
    try { client.destroy(); } catch { }
    return { ok: false, error: err.message };
  }
}

/** Belli bir botu aktif listeden kaldır (sistemden de sil) */
export function stopBotById(key, { silent = false } = {}) {
  const entry = activeBots.get(key);
  if (entry) {
    clearInterval(entry.keepAliveTimer);
    try { entry.client.destroy(); } catch { }
    activeBots.delete(key);
  }
  return { ok: true };
}

/** ownerId altındaki birlilikleri listele */
export function listBots(ownerId) {
  return [...activeBots.entries()]
    .filter(([k]) => k.startsWith(`${ownerId}:`))
    .map(([k, v]) => ({
      key: k,
      botId: v.botId,
      botTag: v.client.user?.tag || '(bağlanıyor)',
      avatar: v.client.user?.displayAvatarURL?.() || null,
      status: v.config.status,
      activityType: v.config.activityType,
      activityText: v.config.activityText,
      minutes: Math.floor((Date.now() - v.startedAt) / 60000),
      ready: v.client.isReady(),
    }));
}

export function isKeeperRunning(ownerId) {
  return listBots(ownerId).length > 0;
}

/** Kullanıcının aktif botlarını sayar */
export function countBots(ownerId) {
  return listBots(ownerId).length;
}

/** Reboot Recovery — kayıtlı tüm botları tekrar başlatır */
export async function recoverBotKeeper() {
  const sessions = getAllSessions(MODULE);
  let revived = 0;
  for (const s of sessions) {
    try {
      const token = Buffer.from(s.botTokenEncrypted, 'base64').toString('utf8');
      const res = await addBot(s.ownerKey || s.userId, token, {
        status: s.status, activityType: s.activityType, activityText: s.activityText,
      });
      if (res.ok) revived++;
    } catch (err) {
      console.warn(`[BotKeeper] Recovery başarısız (${s.ownerKey}):`, err.message);
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  if (revived) console.log(`🤖 [BotKeeper] Reboot Recovery: ${revived}/${sessions.length} bot geri başlatıldı.`);
  return revived;
}
