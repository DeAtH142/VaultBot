// src/utils/embeds.js — ✨ ULTRA PREMIUM EMBEDS ✨
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';

export const COLORS = {
  vault: 0x1f2125,
  online: 0x57f287,
  success: 0x57f287,
  danger: 0xed4245,
  info: 0x3498db,
  primary: 0x5865f2,
  gray: 0x2b2d31,
  gold: 0xffd700,
  purple: 0x9b59b6,
  red: 0xe74c3c,
  darkPurple: 0x6a0dad,
};

export const E = {
  vault: '🔐',
  shield: '🛡️',
  check: '✅',
  cross: '❌',
  warning: '⚠️',
  star: '⭐',
  gear: '⚙️',
  chart: '📊',
  clock: '🕒',
  lightning: '⚡',
  online: '🟢',
  idle: '🟡',
  dnd: '🔴',
  offline: '⚫',
  invisible: '⚪',
  dot: '▸',
  line: '━',
  sparkle: '✨',
  trash: '🗑️',
  info: 'ℹ️',
  fire: '🔥',
  crown: '👑',
  gem: '💎',
  money: '💰',
  rocket: '🚀',
  target: '🎯',
  trophy: '🏆',
  brain: '🧠',
  bow: '🏹',
  sword: '⚔️',
};

export const DIVIDER = '━━━━━━━━━━━━━━━━━━━━━━━';
export const THIN_DIVIDER = '· · ─────── ✦ ─────── · ·';

// ── 🏛️ REXAL SYSTEMS — Marka & Ultra Embed Stili ───────────────────────
export const BRAND = {
  name: 'REXAL SYSTEMS',
  tagline: 'Ultra Premium Automation Suite',
  version: 'v4.0',
  footer: (extra = '') => ({
    text: `⟐ REXAL SYSTEMS ${extra ? '• ' + extra : ''} • ${new Date().getFullYear()}`,
  }),
};

export const UX = {
  header: '◗ ━━━━━━━━━━━━━━━━━━ ◤',
  footerLine: '◈ ━━━━━━━━━━━━━━━━━━ ◥',
  dot2: '◆',
  arrow: '➤',
  badge: (label, value) => `**${label}:** \`${value}\``,
};

/** Standart ultra-premium durum satırı: 🟢 DURUM: `AKTİF`  ◆ MOTOR: `v4` */
export function statusLine(items) {
  return items.map(([emoji, label, value]) => `${emoji} **${label}:** \`${value}\``).join('  ◆  ');
}

/** Bölüm başlığı: ❯ NEDİR? */
export function section(title) {
  return `❯ **${title.toUpperCase()}**`;
}

/** Madde: » ... */
export function bullet(emoji, bold, text) {
  return `» ${emoji} **${bold}** — ${text}`;
}

/** Progress bar üretir (░▒) */
export function progressBar(current, total, length = 12) {
  const filled = Math.max(0, Math.min(length, Math.round((current / total) * length)));
  return '░'.repeat(filled) + '▒'.repeat(length - filled);
}

/** Zarif footer */
const FOOTER_PREMIUM = (extra = '') => ({
  text: `⟐ REXAL SYSTEMS ${extra ? '• ' + extra : ''} • ${new Date().getFullYear()}`,
});

export function tokenAddedEmbed(user, label, index) {
  return new EmbedBuilder()
    .setTitle('✨ Token Kasaya Eklendi!')
    .setColor(COLORS.gold)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setDescription([
      `${THIN_DIVIDER}`,
      `> ✅ **Yeni Hesap Kasaya Eklendi!**`,
      '',
      `> 👤 **Sahip:** <@${user.id}>`,
      `> 🏷️ **Etiket:** \`${label}\``,
      `> 📂 **Slot:** \`#${index}\``,
      '',
      `${THIN_DIVIDER}`,
      `🛡️ Token \`AES-256-GCM\` ile şifrelendi ve güvenle REXAL Kasası'na yerleştirildi.`,
    ].join('\n'))
    .setFooter(FOOTER_PREMIUM('Vault Secured'))
    .setTimestamp();
}

export function tokenDeletedEmbed(user, label) {
  return new EmbedBuilder()
    .setTitle('🗑️ Token Kasadan Silindi')
    .setColor(COLORS.danger)
    .setDescription([
      `${THIN_DIVIDER}`,
      `> 🗑️ **Silinen Hesap:** \`${label}\``,
      `> 👤 **İşlem Yapan:** <@${user.id}>`,
      '',
      `ℹ️ Bu işlem geri alınamaz.`,
    ].join('\n'))
    .setFooter(FOOTER_PREMIUM())
    .setTimestamp();
}

export function errorEmbed(msg) {
  return new EmbedBuilder()
    .setTitle(`${E.cross} Hata Oluştu`)
    .setColor(COLORS.danger)
    .setDescription([
      `${THIN_DIVIDER}`,
      typeof msg === 'string' ? msg : `\`${JSON.stringify(msg)}\``,
      '',
      `*Yardım için \`!yardim\` komutunu kullanabilirsin.*`,
    ].join('\n'))
    .setFooter(FOOTER_PREMIUM())
    .setTimestamp();
}

export function infoEmbed(title, msg) {
  return new EmbedBuilder()
    .setTitle(`${E.info} ${title}`)
    .setColor(COLORS.info)
    .setDescription([
      `${THIN_DIVIDER}`,
      msg,
    ].join('\n'))
    .setFooter(FOOTER_PREMIUM())
    .setTimestamp();
}

/**
 * 💎 1. resimdeki REXAL Vault ULTRA embed tasarımı
 */
export function createVaultEmbed(user, tokenList) {
  const maxCapacity = 5;
  const total = tokenList.length;
  const activeCount = tokenList.filter(t => t.status && t.status !== 'pasif' && t.status !== 'gecersiz').length;
  const passiveCount = tokenList.filter(t => t.status === 'pasif').length;
  const invalidCount = tokenList.filter(t => t.status === 'gecersiz').length;

  const bar = progressBar(total, maxCapacity, maxCapacity);

  let accountsText = tokenList.length === 0
    ? `> 🤍 *Henüz hesap eklenmemiş — "Token Ekle" butonuna bas!*`
    : tokenList.map((t, i) => {
      const icon = t.status === 'gecersiz' ? '💔' : (t.status === 'pasif' ? '🤍' : '💚');
      const stText = t.status === 'gecersiz' ? '`Geçersiz`' : (t.status === 'pasif' ? '`Pasif`' : `\`${t.status.toUpperCase()}\``);
      const rank = i === 0 ? `${E.crown} ` : `#${i + 1} `;
      return `> ${icon} ${rank}**${t.username || t.label}** — ${stText}`;
    }).join('\n');

  const healthPercent = total === 0 ? 100 : Math.round(((activeCount * 1) + (passiveCount * 0.4)) / total * 100);
  const healthEmoji = healthPercent >= 80 ? E.fire : healthPercent >= 50 ? E.lightning : E.warning;

  return new EmbedBuilder()
    .setColor(COLORS.vault)
    .setTitle(`${E.vault}  REXAL TOKEN KASASI`)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setDescription([
      `\`${THIN_DIVIDER}\``,
      `> ${E.crown} **Kullanıcı:** <@${user.id}>  ${E.star} **Paket:** \`Ücretsiz\``,
      '',
      `${E.chart} **KAPASİTE & DURUM**`,
      `\`\`\`${bar}  ${total}/${maxCapacity}\`\`\``,
      `> ${E.check} **Aktif:** \`${activeCount}\`   ${E.offline} **Pasif:** \`${passiveCount}\`   💔 **Geçersiz:** \`${invalidCount}\``,
      `> ${healthEmoji} **Kasa Sağlığı:** \`${healthPercent}%\``,
      '',
      `${E.vault} **KAYITLI HESAPLAR (${total})**`,
      accountsText,
      '',
      `*Yönetmek için aşağıdaki menüden hesap seçin ↓*`,
    ].join('\n'))
    .setFooter(FOOTER_PREMIUM('AES-256-GCM Encrypted'))
    .setTimestamp();
}

/**
 * Vault kontrol bileşenleri (Select menu + Butonlar) — ULTRA stil
 */
export function createVaultComponents(tokenList) {
  const rows = [];

  const selectOptions = tokenList.length === 0
    ? [{ label: 'Hesap bulunmuyor', value: 'none', description: 'Önce token ekleyin', emoji: '🤍' }]
    : tokenList.map((t, i) => ({
      label: `${i + 1}. ${t.username || t.label || `Hesap ${i + 1}`}`,
      description: `Durum: ${t.status || 'pasif'} • ID: ${t.accountUserId || t.userId || 'Bilinmiyor'}`,
      value: String(i),
      emoji: t.status === 'gecersiz' ? '💔' : (t.status === 'pasif' ? '🤍' : '💚'),
    }));

  rows.push(new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('vault:hesapsec')
      .setPlaceholder('🔍 Bir hesap seç → yönet, başlat, durdur...')
      .addOptions(selectOptions)
      .setDisabled(tokenList.length === 0),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vault:prev').setLabel('◀ Önceki').setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('vault:page').setLabel('Sayfa 1/1').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('vault:next').setLabel('Sonraki ▶').setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('vault:yedek').setLabel('Yedek İndir').setEmoji('📥').setStyle(ButtonStyle.Success),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vault:mobilqr').setLabel('Mobil / QR ile Ekle').setEmoji('📱').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('vault:tokenekle_modal').setLabel('Token Ekle').setEmoji('✨').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('vault:denetle').setLabel('Denetle').setEmoji('🔍').setStyle(ButtonStyle.Secondary),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vault:gecersizlerisil').setLabel('Geçersizleri Temizle').setEmoji('🧹').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vault:tumunudurdur').setLabel('Tümünü Durdur').setEmoji('⛔').setStyle(ButtonStyle.Danger),
  ));

  return rows;
}

/**
 * 🌙 REXAL Online Tutma Sistemi — ULTRA Embed
 */
export function createOnlineSystemEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.purple)
    .setAuthor({ name: 'REXAL SYSTEMS • Presence Engine', iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' })
    .setTitle(`${E.rocket}  REXAL — ONLINE TUTMA SİSTEMİ ${BRAND.version}`)
    .setDescription([
      `${UX.header}`,
      `> ${E.online} **Sistem Durumu:** \`AKTİF\`  ${E.gear} **Motor:** \`${BRAND.version} Ultra\``,
      `${UX.footerLine}`,
      '',
      section('Ne Yapar?'),
      'Hesaplarını Rich Presence olmadan **7/24** online/idle/dnd/invisible tutar. ',
      'Sadece Discord durumunu düzenler — ses kanalına girmez, yayın açmaz.',
      '',
      section('Premium Özellikler'),
      `> ${UX.dot2} ${bullet(E.dot, 'Ultra Hafif', 'Sadece durum, sıfır performans etkisi')}`,
      `> ${UX.dot2} ${bullet(E.dot, 'Havuzdan Seç', 'Token tekrar girmene gerek yok')}`,
      `> ${UX.dot2} ${bullet(E.dot, 'Reboot Recovery', 'Bot kapansa bile oturumlar geri gelir')}`,
      `> ${UX.dot2} ${bullet(E.dot, 'Custom Status', 'İstediğin durum yazısı')}`,
      '',
      `${E.target} *Kontrol paneli aşağıda ↓*`,
    ].join('\n'))
    .setFooter(BRAND.footer('#destek kanalından yardım alabilirsin'))
    .setTimestamp();
}

export function createOnlineSystemComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('online:ekle').setLabel('Hesap Ekle & Online Yap').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('online:cikar').setLabel('Hesap Çıkar').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('online:aktifler').setLabel('Aktif Hesaplar').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ══════════════════════════════════════════════════
// ⏱️  ROL İLERLEME / SÜRE PANELİ — PRO EMBED SETİ
// ══════════════════════════

import { ROLE_TIERS, fmtHours, fmtTimer } from './playtimeStore.js';
import { sourceMeta } from './playtimeHooks.js';

/** ▰▰▰▱▱▱ tarzı parlak ilerleme çubuğu */
export function proBar(pct, length = 14) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const filled = Math.round((p / 100) * length);
  return `${'▰'.repeat(filled)}${'▱'.repeat(length - filled)}`;
}

const TIER_MEDALS = ['🥉', '🥈', '🥇', '💠', '🔷', '🔶', '🌟', '👑', '🔥', '🏆'];

export function tierBadge(tier) {
  if (!tier) return '⬜ **Ünvan yok**';
  return `${TIER_MEDALS[tier - 1] || '🏅'} **${tier}. ROL — ${ROLE_TIERS[tier - 1]?.name || ''}**`;
}

/** Canlı sistem listesi satırları */
function liveSystemsText(progress) {
  if (!progress.live) return '> `⚫` *Şu anda süre sayılmıyor*';
  const now = Date.now();
  return progress.liveSessions
    .map(s => {
      const meta = sourceMeta(s.key.split(':')[0]);
      return `> ${meta.emoji} **${meta.label}** · \`${fmtTimer((now - s.start) / 1000)}\``;
    })
    .join('\n');
}

/**
 * 🎖️ Ana ilerleme paneli
 */
export function createProgressEmbed(user, progress, extra = {}) {
  const {
    tierIndex, tierCount, nextTier, currentTier,
    cumulativeSec, requiredSec, remainingSec, progressPct,
    totalSec, lastPlayedAt, lastAward, pendingAwards,
  } = progress;

  const startedAt = progress.liveSessions.length
    ? Math.min(...progress.liveSessions.map(s => s.start))
    : null;

  const headerRight = progress.live
    ? `🔴 **SÜRE AKIYOR** · \`${fmtTimer((Date.now() - startedAt) / 1000)}\``
    : '⚫ **BEKLEMEDE**';

  const lines = [
    UX.header,
    `${statusLine([
      [progress.live ? E.online : E.offline, 'DURUM', progress.live ? 'AKTİF' : 'PASİF'],
      [E.clock, 'Oturumlar', String(progress.liveSessions.length)],
      [E.trophy, 'ROL', `${tierIndex}/${tierCount}`],
    ])}`,
    UX.footerLine,
    '',
    `### ${headerRight}`,
    `${E.lightning} **AKTİF SİSTEMLER**`,
    liveSystemsText(progress),
    '',
    `${E.chart} **SIRADAKİ ROL İLERLEMESİ**`,
    `\`${proBar(progressPct, 14)}\`  **\`${progressPct}%\`**`,
    nextTier
      ? [
        `> ${UX.arrow} **Hedef:** ${tierBadge(nextTier.tier)}`,
        `> ${UX.arrow} **Gereken (bu rol için):** \`${nextTier.requiredHours} sa\``,
        `> ${UX.arrow} **Toplanan:** \`${fmtHours(cumulativeSec)}\` / \`${fmtHours(requiredSec)}\``,
        `> ${UX.arrow} **Kalan:** \`${fmtHours(remainingSec)}\``,
      ].join('\n')
      : `> ${E.crown} **Tüm roller tamamlandı!** Tebrikler.`,
    '',
    `${E.clock} **KİŞİSEL KAYITLAR**`,
    `> ${UX.dot2} **Şu anki ünvan:** ${tierBadge(currentTier?.tier)}`,
    `> ${UX.dot2} **Toplam sayılan süre:** \`${fmtHours(totalSec)}\``,
    `> ${UX.dot2} **Son görülme:** ${lastPlayedAt ? `<t:${Math.floor(new Date(lastPlayedAt).getTime() / 1000)}:R>` : '*Henüz yok*'}`,
    lastAward ? `> ${UX.dot2} **Son ödül:** ${tierBadge(lastAward.tier)} — <t:${Math.floor(new Date(lastAward.at).getTime() / 1000)}:R>` : '',
    pendingAwards?.length
      ? `> ${E.warning} **Rol bekliyor:** ${pendingAwards.map(p => tierBadge(p.tier)).join(', ')}\n> ${UX.arrow} *\`!surem rolver\` ile hemen dene*`
      : '',
    extra.roleStatusLine || '',
    '',
    `*${THIN_DIVIDER}*`,
    `> ${E.info} Süre yalnızca **uygun sistemler gerçekten çalışırken** sayılır. Aynı anda birden fazla ` +
      `sistem açıksa aynı zaman aralığı **tek kez** hesaplanır (birleşim süresi).`,
    `> ${E.warning} Bot kapalıyken geçen süre **sayılmaz**.`,
    '',
    `${E.target} *Yönetim paneli:* \`!surem panel\`  ·  *Komutlar:* \`!surem\``,
  ].filter(Boolean);

  return new EmbedBuilder()
    .setAuthor({ name: `${BRAND.name} • Rol İlerleme Motoru ${BRAND.version}`, iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' })
    .setColor(progress.live ? COLORS.purple : COLORS.gray)
    .setTitle(`${E.clock}  REXAL — SÜRE & ROL İLERLEMESİ`)
    .setThumbnail(user?.displayAvatarURL ? user.displayAvatarURL({ dynamic: true, size: 256 }) : null)
    .setDescription(lines.join('\n'))
    .setFooter(BRAND.footer('Birleşim süresi • Kalıcı kayıt'))
    .setTimestamp();
}

/** 🪜 Rol eşik tablosu (tasarımdaki 10 aşamalı yol haritası) */
export function createTierRoadmapEmbed(user, progress) {
  const rows = ROLE_TIERS.map(t => {
    const done = t.tier <= progress.tierIndex;
    const active = t.tier === progress.tierIndex + 1;
    const mark = done ? '✅' : active ? '⏳' : '🔒';
    const medal = TIER_MEDALS[t.tier - 1] || '🏅';
    const line = `> ${mark} ${medal} **${t.tier}. ${t.name}** · ek \`${t.requiredHours} sa\` · toplam \`${t.totalHours} sa\``;
    return active
      ? `${line}\n>　　　┗ ${proBar(progress.progressPct, 10)} \`${fmtHours(progress.cumulativeSec)} / ${t.requiredHours} sa\``
      : line;
  });

  return new EmbedBuilder()
    .setAuthor({ name: `${BRAND.name} • Rol Yol Haritası`, iconURL: user?.displayAvatarURL?.({ dynamic: true }) })
    .setColor(COLORS.gold)
    .setTitle(`${E.trophy}  REXAL — 10 AŞAMALI ROL HEDEFİ`)
    .setDescription([
      UX.header,
      `> ${E.check} **Tamamlanan:** \`${progress.tierIndex}/${ROLE_TIERS.length}\`  ${E.chart} **Toplam süre:** \`${fmtHours(progress.totalSec)}\``,
      UX.footerLine,
      '',
      '**Her rol, öncekinin üzerine EK süre ister.** Eşik dolunca sayaç sıfırdan başlar, ' +
      'toplam ilerlemen ise her zaman korunur.',
      '',
      ...rows,
      '',
      `*Toplam hedef:* \`${ROLE_TIERS.reduce((a, t) => a + t.requiredHours, 0)} sa\` (10 rolün tamamı)`,
    ].join('\n'))
    .setFooter(BRAND.footer('Saniye hassasiyeti'))
    .setTimestamp();
}

/** 📊 Komut yardım embed'i */
export function createPlaytimeHelpEmbed() {
  return new EmbedBuilder()
    .setAuthor({ name: `${BRAND.name} • Süre Sistemi`, iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' })
    .setColor(COLORS.purple)
    .setTitle(`${E.clock}  !sürem — Komutlar`)
    .setDescription([
      UX.header,
      `> ${UX.arrow} \`!surem\` — Kişisel ilerleme kartın`,
      `> ${UX.arrow} \`!surem panel\` — Detaylı panel + butonlar`,
      `> ${UX.arrow} \`!surem roller\` — 10 aşamalı rol yol haritası`,
      `> ${UX.arrow} \`!surem canli\` — Bu kullanıcının canlı sistemleri`,
      `> ${UX.arrow} \`!surem rolver\` — Bekleyen rolü hemen vermeyi dene`,
      UX.footerLine,
      '',
      section('Nasıl Çalışır?'),
      `${bullet(E.dot, 'Gerçek Başlangıç', 'Süre, panelde "başarılı" sonucu geldiği an açılır')}`,
      `${bullet(E.dot, 'Tek Sayaç', 'Birden fazla sistem açık olsa da süre ikinci kez sayılmaz')}`,
      `${bullet(E.dot, 'Kalıcı Kayıt', 'Bot kapansa da ilerleme Firestore\'da korunur')}`,
      `${bullet(E.dot, 'Bot Kapalı = Süre Yok', 'Canlılık damgası sayesinde offline süre asla eklenmez')}`,
    ].join('\n'))
    .setFooter(BRAND.footer('REXAL Time Engine'))
    .setTimestamp();
}

/** Panel butonları */
export function createProgressComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('surem:refresh').setLabel('Durumu Yenile').setEmoji('🔄').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('surem:roller').setLabel('Rol Yol Haritası').setEmoji('🪜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('surem:canli').setLabel('Canlı Sistemler').setEmoji('📡').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('surem:kurallar').setLabel('Kurallar').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    ),
  ];
}
