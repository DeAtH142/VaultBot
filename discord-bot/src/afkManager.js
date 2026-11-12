// src/afkManager.js
import { ActivityType } from 'discord.js';

const afkSessions = new Map(); // guildId:userId → { intervalId, channel, status }

/**
 * AFK koruyucuyu başlat
 * @param {string} key        guildId:userId
 * @param {import('discord.js').TextChannel} channel
 */
export function startAfk(key, channel) {
  if (afkSessions.has(key)) return false;

  // İlk typing hemen gönder
  channel.sendTyping().catch(() => {});

  const intervalId = setInterval(() => {
    channel.sendTyping().catch(() => {});

    channel.client.user.setPresence({
      activities: [{ name: '🔐 Vault Koruma', type: ActivityType.Watching }],
      status: 'online',
    });
  }, 4 * 60 * 1000); // her 4 dk

  afkSessions.set(key, { intervalId, channel });
  return true;
}

/**
 * AFK koruyucuyu durdur
 * @param {string} key
 */
export function stopAfk(key) {
  const session = afkSessions.get(key);
  if (!session) return false;

  clearInterval(session.intervalId);
  afkSessions.delete(key);
  return true;
}

/**
 * AFK aktif mi?
 * @param {string} key
 */
export function isAfkActive(key) {
  return afkSessions.has(key);
}
