// src/commands/checker.js — 🔎 Token Denetleyici
// Kasadaki tokenlerin geçerliliğini toplu kontrol eder, geçersizleri temizler + rapor verir.
// Selfbot login GEREKMEZ — Discord REST API'ye hafif bir istek atılır (hızlı + düşük risk).
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { decrypt } from '../utils/crypto.js';
import { getTokens, updateTokenStatus, deleteInvalidTokens } from '../utils/tokenStore.js';
import { COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine, progressBar } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('Token Integrity Checker');
const CHECK_DELAY_MS = 1500; // hesaplar arası bekleme (rate-limit koruması)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Token geçerliliğini REST üzerinden kontrol et (selfbot login yok) */
async function checkToken(rawToken) {
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: rawToken },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401 || res.status === 403) return { valid: false, reason: 'Token geçersiz (401)' };
    if (!res.ok) return { valid: false, reason: `API hatası ${res.status}` };
    const user = await res.json();
    return { valid: true, username: user.username, id: user.id, avatar: user.avatar };
  } catch (err) {
    return { valid: false, reason: 'Bağlantı hatası: ' + err.message };
  }
}

/** Kasadaki tüm tokenleri denetle, durumları güncelle. @returns {results, stats} */
async function runCheck(ownerId, indices = null) {
  const tokens = getTokens(ownerId);
  const targets = tokens.map((t, i) => ({ t, i })).filter(({ t, i }) => {
    if (indices && !indices.includes(i)) return false;
    return true;
  });

  const results = [];
  for (let n = 0; n < targets.length; n++) {
    const { t, i } = targets[n];
    if (n > 0) await sleep(CHECK_DELAY_MS);
    let raw;
    try { raw = decrypt(t); } catch (err) {
      results.push({ index: i, label: t.username || t.label, valid: false, reason: 'Deşifre hatası' });
      updateTokenStatus(ownerId, i, 'gecersiz');
      continue;
    }
    const r = await checkToken(raw);
    results.push({ index: i, label: t.username || t.label || `Hesap ${i + 1}`, ...r });
    updateTokenStatus(ownerId, i, r.valid ? (t.status === 'gecersiz' ? 'pasif' : t.status || 'pasif') : 'gecersiz');
  }
  return results;
}

function buildResultEmbed(results, deletedCount) {
  const valid = results.filter(r => r.valid).length;
  const invalid = results.length - valid;
  const lines = results.map(r =>
    r.valid
      ? `> ✅ **${r.label}** — \`${r.username}\``
      : `> 💔 **${r.label}** — ${r.reason}`
  ).join('\n') || '> ℹ️ Kontrol edilecek hesap yok.';

  return new EmbedBuilder()
    .setTitle('🔎 Token Denetim Raporu')
    .setColor(invalid === 0 ? COLORS.success : COLORS.gold)
    .setDescription([
      `\`${THIN_DIVIDER}\``,
      `\`\`\`${progressBar(valid, results.length || 1)}  ${valid}/${results.length}\`\`\``,
      `> ✅ **Geçerli:** \`${valid}\`   💔 **Geçersiz:** \`${invalid}\`   🧹 **Temizlenen:** \`${deletedCount}\``,
      '',
      lines.slice(0, 3800),
      '',
      `> ♾️ *Geçersiz tokenlerin durumları \`gecersiz\` olarak işaretlendi${deletedCount ? ' ve temizlendi' : ''}.*`,
    ].join('\n'))
    .setFooter(FOOTER())
    .setTimestamp();
}

export default {
  name: 'checker',
  aliases: ['denetle', 'tokencheck', 'kontrol'],
  description: 'Kasadaki tokenlerin geçerliliğini toplu kontrol eder',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setAuthor({ name: `${BRAND.name} • Token Integrity Checker ${BRAND.version}` })
      .setTitle('🔎 REXAL — Token Denetleyici')
      .setDescription([
        UX.header, UX.footerLine, '',
        statusLine([['🌐', 'Sistem', 'Hazır'], ['⚡', 'Motor', 'REST API'], ['🤫', 'Login', 'Gereksiz']]),
        '',
        section('Ne Yapar?'),
        'Kasadaki tüm tokenlerin Discord tarafında **hâlâ geçerli olup olmadığını** toplu kontrol eder.',
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('⚡', 'Hızlı', 'Selfbot login yok — hafif REST isteği')}`,
        `> ${UX.dot2} ${bullet('🧹', 'Oto Temizlik', 'Geçersizleri tek tuşla kasadan siler')}`,
        `> ${UX.dot2} ${bullet('📊', 'Rapor', 'Hesap başı sonuç + sağlık yüzdesi')}`,
        '',
        section('Kontrol Paneli'),
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('checker:kontrol').setLabel('Denetimi Başlat').setEmoji('🔎').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('checker:temizle').setLabel('Geçersizleri Sil').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      )],
    });
  },

  async onButton(interaction, action) {
    const tokens = getTokens(interaction.user.id);
    if (tokens.length === 0) {
      return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
    }

    if (action[0] === 'temizle') {
      const deleted = deleteInvalidTokens(interaction.user.id);
      return interaction.reply({ content: `🧹 \`${deleted}\` geçersiz hesap kasadan temizlendi.`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const results = await runCheck(interaction.user.id);
      await interaction.editReply({ embeds: [buildResultEmbed(results, 0)] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(`Denetim hatası: ${err.message}`)] });
    }
  },
};
