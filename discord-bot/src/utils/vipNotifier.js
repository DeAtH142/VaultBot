// src/utils/vipNotifier.js
// 🚨 VIP Webhook Bildirim Sistemi — token koptuğunda / sistem başladığında / hata olduğunda
// kullanıcının kendi Discord webhook'una şık embed bildirimi yollar.
import fs from 'fs';
import path from 'path';
import { hasVipWebhook } from './tierPerms.js';

const FILE = path.join(process.cwd(), 'data', 'vip_webhooks.json');

function load() {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { return {}; }
}

function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

/** Kullanıcının kayıtlı webhook URL'si (tier yetkisi yoksa null) */
export function getWebhook(userId) {
  if (!hasVipWebhook(userId)) return null;
  return load()[userId] || null;
}

/** Webhook kaydet (tier yetkisi yoksa false döner) */
export function setWebhook(userId, url) {
  if (!hasVipWebhook(userId)) return false;
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) return false;
  const data = load();
  data[userId] = url;
  save(data);
  return true;
}

export function removeWebhook(userId) {
  const data = load();
  if (data[userId]) { delete data[userId]; save(data); return true; }
  return false;
}

/**
 * 📨 VIP bildirimi yollar.
 * @param {string} userId — paket sahibi kullanıcı
 * @param {object} opts — { title, color, description, accountLabel, system }
 */
export async function notifyVip(userId, opts = {}) {
  try {
    const url = getWebhook(userId);
    if (!url) return false;

    const { title = 'REXAL Bildirimi', color = 0x5865f2, description = '', accountLabel = null, system = null } = opts;

    const lines = [];
    if (accountLabel) lines.push(`> 🔑 **Hesap:** \`${accountLabel}\``);
    if (system) lines.push(`> ⚙️ **Sistem:** \`${system}\``);
    if (description) lines.push('', description);

    const payload = {
      username: 'REXAL VIP Bilgi Servisi',
      embeds: [{
        title: `⚡ ${title}`,
        description: [
          '· · ─────── ✦ ─────── · ·',
          `> 👑 **Sayın VIP Üyemiz,**`,
          ...lines,
          '',
          `⟐ REXAL SYSTEMS • ${new Date().toLocaleString('tr-TR')}`,
        ].join('\n'),
        color,
        footer: { text: 'REXAL VIP Webhook • Anlık Raporlama' },
      }],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.warn('[VIPNotifier] Webhook gönderilemedi:', err.message);
    return false;
  }
}

/** Hazır bildirim tipleri */
export const VIP_EVENTS = {
  TOKEN_DEAD: (label, system) => ({
    title: 'Token Koptu — Oto-Kurtarma Devrede',
    color: 0xed4245,
    accountLabel: label,
    system,
    description: `> ${'⚠️'} Kasadaki hesabının token'ı koptu.\n> 🔁 **Oto-Kurtarma** sistem oturumunu duraklattı, tekrar bağlanmayı deniyor.`,
  }),
  TOKEN_RECOVERED: (label) => ({
    title: 'Token Kurtarıldı ✅',
    color: 0x57f287,
    accountLabel: label,
    description: `> Hesap tekrar bağlandı ve sistem kaldığı yerden devam ediyor.`,
  }),
  SYSTEM_STARTED: (system, label) => ({
    title: 'Sistem Başlatıldı 🚀',
    color: 0x57f287,
    system,
    accountLabel: label,
    description: `> \`${system}\` sistemi bu hesap için başarıyla başlatıldı.`,
  }),
  SYSTEM_ERROR: (system, err) => ({
    title: 'Sistem Hatası 💥',
    color: 0xed4245,
    system,
    description: `> \`${system}\` sistemi hata verdi:\n> \`\`\`${String(err).slice(0, 200)}\`\`\``,
  }),
  SUBSCRIPTION_ENDING: (pkgName, when) => ({
    title: 'Paket Süren Bitmek Üzere ⏰',
    color: 0xffd700,
    description: `> **${pkgName}** paketin ${when} sona eriyor.\n> Yenilemek için yöneticinle iletişime geç.`,
  }),
  SUBSCRIPTION_ENDED: (pkgName) => ({
    title: 'Paket Süresi Doldu 🕳️',
    color: 0xed4245,
    description: `> **${pkgName}** paketinin süresi doldu. Kasan \`Ücretsiz\` kapasiteye düşürüldü ve geçersiz tokenler temizlendi.`,
  }),
};
