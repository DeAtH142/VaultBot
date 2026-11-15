// src/utils/tierPerms.js
// 🎖️ Tier Yetki Motoru — kullanıcının aktif paketine göre özellik katmanı kontrol eder.
import { getUserSubscription } from './tokenStore.js';
import { PACKAGES, PACKAGE_BY_ID } from '../../config/rexal.config.js';

/** Kullanıcının aktif (süresi dolmamış) paket kaydını döndürür, yoksa null */
export function getActivePackage(userId) {
  const sub = getUserSubscription(userId);

  if (!sub || !sub.roleId) return null;

  // Süre kontrolü
  if (sub.expiresAt && sub.expiresAt !== 'infinite') {
    if (Date.now() > new Date(sub.expiresAt).getTime()) return null;
  }

  // roleId'ye göre paket bul (type ismi de eşleşebilir)
  const byRole = PACKAGES.find(p => p.roleId === sub.roleId);
  if (byRole) return byRole;

  const byName = PACKAGES.find(p => p.name === sub.type || sub.type?.startsWith(p.name.split(' ')[2] || '###'));
  return byName || null;
}

/** Kullanıcının tier'ı (0 = ücretsiz) */
export function getUserTier(userId) {
  return getActivePackage(userId)?.tier || 0;
}

/** VIP Webhook kullanabilir mi? (TÜM 6 paket) */
export function hasVipWebhook(userId) {
  return getActivePackage(userId)?.features?.webhook === true;
}

/** Detaylı kasa istatistiği kullanabilir mi? (Lidya + Hilal + Zoktay + Esin) */
export function hasStats(userId) {
  return getActivePackage(userId)?.features?.stats === true;
}

/** Anti-Ban Güvenli Mod kullanabilir mi? (Zoktay + Esin) */
export function hasAntiBan(userId) {
  return getActivePackage(userId)?.features?.antiban === true;
}

/** Embed için paket adı ve tier rozeti */
export function tierBadgeText(userId) {
  const pkg = getActivePackage(userId);
  if (!pkg) return '`Ücretsiz`';
  return `\`${pkg.name}\``;
}
