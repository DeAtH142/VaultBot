// src/utils/accessGuard.js
// 🔐 SELFBOT_USERS yetki kontrolü — config/rexal.config.js'teki listeye bakar.
import { canUseSelfbot } from '../../config/rexal.config.js';
import { EmbedBuilder } from 'discord.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from './embeds.js';

/**
 * Kullanıcı selfbot sistemlerini kullanabilir mi?
 * Yetkisi yoksa hazır deny embed'i döner (reply edilmesi caller'a ait).
 * @returns {EmbedBuilder|null} null = izin var, EmbedBuilder = reddedildi
 */
export function selfbotDenyEmbed(userId, commandName = 'bu komut') {
  if (canUseSelfbot(userId)) return null;
  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle(`${E.lock || '🔒'} Erişim Reddedildi`)
    .setDescription([
      THIN_DIVIDER,
      `> ${E.info} \`${commandName}\` gibi **selfbot sistemleri** yetkili kullanıcılara özeldir.`,
      `> Yetki için yöneticinle iletişime geç.`,
      '',
      `⟐ *Erişim ≠ Kapasite — kapasiten aktif paketinden gelir.*`,
    ].join('\n'))
    .setFooter(BRAND.footer('Erişim Kontrolü'));
}

/** Kısa yol: kullanılabilir mi? */
export function canAccess(userId) {
  return canUseSelfbot(userId);
}
