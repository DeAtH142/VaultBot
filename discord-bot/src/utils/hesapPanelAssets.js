// src/utils/hesapPanelAssets.js — 🖼️ Hesap Kontrol Paneli ikonları & yardımcıları
//
// Token Kontrol Paneli (Ses AFK) embed'inde kullanılan ikonlar ve select
// değer yardımcıları tek yerden yönetilir.

/**
 * Panel emoji haritası.
 * ⚠️ Custom emoji ID'leri BOTUN BULUNDUĞU sunucuya ait olmalıdır (DM'de de
 * çalışır). Kendi sunucundaki emoji ID'lerini buraya yaz.
 * Format: '<:isim:ID>'  →  geçersizse aşağıdaki FALLBACK devreye girer.
 */
export const HESAP_EMOJI = {
  bolt: '<:rexbolt:0>',
  mic: '<:rexmic:0>',
  headphones: '<:rexheadset:0>',
  cam: '<:rexcam:0>',
  live: '<:rexlive:0>',
  gamepad: '<:rexpad:0>',
  spotify: '<:rexspotify:0>',
  check: '<:rexcheck:0>',
  cross: '<:rexcross:0>',
  circle: '<:rexcircle:0>',
  pin: '<:rexpin:0>',
  micOff: '<:rexmicoff:0>',
  deafOff: '<:rexdeafoff:0>',
  plugOff: '<:rexplugoff:0>',
};

/** Custom emoji yoksa kullanılacak güvenli standart emojiler */
export const HESAP_EMOJI_FALLBACK = {
  bolt: '⚡',
  mic: '🎤',
  headphones: '🎧',
  cam: '📹',
  live: '🔴',
  gamepad: '🎮',
  spotify: '🎵',
  check: '✅',
  cross: '❌',
  circle: '🔴',
  pin: '📍',
  micOff: '🔇',
  deafOff: '🔕',
  plugOff: '🔌',
};

/** Geçerli bir custom emoji mi? (<:ad:ID> veya <a:ad:ID>, ID >= 17 hane) */
export function isValidCustomEmoji(value) {
  return typeof value === 'string' && /^<a?:\w{2,32}:\d{17,20}>$/.test(value);
}

/** Emoji haritasını fallback'lerle birleştirilmiş hâlde döndürür */
export function panelIcons() {
  const out = { ...HESAP_EMOJI_FALLBACK };
  for (const [k, v] of Object.entries(HESAP_EMOJI)) {
    if (isValidCustomEmoji(v)) out[k] = v;
  }
  return out;
}

/** select menu option değeri → "h12" biçimi */
export const HESAP_OPT_PREFIX = 'h';

/** "h12" → 12 (geçersizse -1) */
export function parseHesapOption(value) {
  if (typeof value !== 'string' || !value.startsWith(HESAP_OPT_PREFIX)) return -1;
  const n = parseInt(value.slice(HESAP_OPT_PREFIX.length), 10);
  return Number.isFinite(n) ? n : -1;
}

/** Yuvarlak beyaz çerçeveli avatar görseli (panel sağ üst köşesi) */
export function roundAvatar(user, size = 256) {
  const url = typeof user?.displayAvatarURL === 'function'
    ? user.displayAvatarURL({ extension: 'png', size, forceStatic: true })
    : String(user || '');
  return url.replace(/\.(webp|gif)(\?|$)/i, '.png$2');
}
