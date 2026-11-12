// src/commands/profilechanger.js — 🌌 REXAL — Profile Changer (Vault Sürümlü)
// Kasadan seçilen hesapların avatar/banner'ını değiştirir. Token girilmez.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { loginVaultAccount, destroyClient, sleep, buildReportLines } from '../utils/selfbotHelpers.js';
import { getTokens } from '../utils/tokenStore.js';
import { COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('Identity Forge Engine');
const ACCOUNT_DELAY_MS = 1500;
const API_THROTTLE_MS = 2000; // PATCH /users/@me rate-limit koruması

/**
 * Bir hesabın profilini değiştirir.
 * @param {string} avatarDataUrl - data:image/png;base64,... formatında (opsiyonel)
 * @param {string} bannerDataUrl - opsiyonel
 */
async function applyProfile(client, { avatarDataUrl, bannerDataUrl, displayName, bio }) {
  const patch = {};
  if (avatarDataUrl) patch.avatar = avatarDataUrl;
  if (bannerDataUrl) patch.banner = bannerDataUrl;
  if (displayName) patch.global_name = displayName;
  if (bio) patch.bio = bio;

  if (Object.keys(patch).length === 0) throw new Error('Değiştirilecek alan yok!');
  await client.user.edit(patch).catch((e) => { throw new Error('Profil güncellenemedi: ' + e.message); });
  // throttle
  await new Promise(r => setTimeout(r, API_THROTTLE_MS));
  return Object.keys(patch).join(', ');
}

async function runProfileJob(ownerId, indices, opts) {
  const reports = [];
  for (let a = 0; a < indices.length; a++) {
    const idx = indices[a];
    if (a > 0) await sleep(ACCOUNT_DELAY_MS);

    const login = await loginVaultAccount(ownerId, idx);
    if (!login.success) {
      reports.push({ tokenIndex: idx, ok: false, error: login.error });
      continue;
    }
    try {
      const fields = await applyProfile(login.client, opts);
      reports.push({ tokenIndex: idx, username: login.username, ok: true, summary: `güncellendi → \`${fields}\`` });
    } catch (err) {
      reports.push({ tokenIndex: idx, username: login.username, ok: true, error: err.message });
    } finally {
      destroyClient(login.client);
    }
  }
  return reports;
}

/** Görsel URL'sini Discord'un istediği data URL'e çevirir */
async function urlToDataUrl(url) {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Görsel indirilemedi (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') || 'image/png';
  return `data:${type};base64,${buffer.toString('base64')}`;
}

export default {
  name: 'profilechanger',
  aliases: ['profil', 'profildegistir', 'pchanger'],
  description: 'REXAL — Profile Changer Kontrol Paneli',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(0x6a0dad)
      .setAuthor({ name: `${BRAND.name} • Identity Forge ${BRAND.version}` })
      .setTitle(`🌌 REXAL — Profile Changer`)
      .setDescription([
        UX.header,
        UX.footerLine,
        '',
        statusLine([['🌐', 'Sistem', 'Aktif'], ['👤', 'Durum', '🔰 Hazır'], ['🖼️', 'Alanlar', '4']]),
        '',
        section('Nasıl Kullanılır?'),
        `> 1️⃣ Kasaya \`!hesaplarim\` ile hesap ekleyin (token gerekmez!)`,
        `> 2️⃣ Aşağıdaki butona tıklayıp kasadan hesap(lar) seçin`,
        `> 3️⃣ Yeni avatar/banner URL'lerini girin`,
        `> 4️⃣ Rapor anında size iletilir`,
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('⏱️', 'Rate-Limit Koruması', 'Discord API limitleri korunur')}`,
        `> ${UX.dot2} ${bullet('⏱️', 'Değişiklik Timerı', 'Her hesap arasında `1.5sn` gecikme')}`,
        `> ${UX.dot2} ${bullet('⏱️', 'Rapor', 'Başarılı/başarısız detay rapor gelir')}`,
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('profilechanger:sec').setLabel('Profile Changer Başlat').setEmoji('🌌').setStyle(ButtonStyle.Success),
      ),
    ];

    await message.reply({ embeds: [embed], components: rows });
  },

  async onButton(interaction) {
    const tokens = getTokens(interaction.user.id);
    if (tokens.length === 0) {
      return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
    }

    const options = tokens
      .filter(t => t.status !== 'gecersiz')
      .map((t) => ({
        label: t.label || t.username || 'Hesap',
        description: `Durum: ${t.status || 'pasif'}`,
        value: String(tokens.indexOf(t)),
        emoji: '🌌',
      }));

    if (options.length === 0) {
      return interaction.reply({ content: '❌ Kasada geçerli hesap yok.', ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('profilechanger:select')
        .setPlaceholder('Profil değiştirilecek hesapları seç (çoklu)...')
        .addOptions(options)
        .setMaxValues(Math.min(options.length, 25)),
    );

    return interaction.reply({ content: '🌌 **Kasadan hesap seç:**', components: [row], ephemeral: true });
  },

  async onSelect(interaction) {
    const indices = interaction.values.map(v => parseInt(v, 10));
    const modal = new ModalBuilder()
      .setCustomId(`profilechanger:modal:${indices.join('-')}`)
      .setTitle('Profile Changer — Ayarlar');

    const avatarInput = new TextInputBuilder()
      .setCustomId('avatar_url')
      .setLabel('Yeni Avatar URL (boş=değişmez)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://cdn.discordapp.com/...  veya herhangi bir görsel linki')
      .setRequired(false);

    const bannerInput = new TextInputBuilder()
      .setCustomId('banner_url')
      .setLabel('Yeni Banner URL (boş=değişmez)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const nameInput = new TextInputBuilder()
      .setCustomId('display_name')
      .setLabel('Yeni Görünen Ad (boş=değişmez)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const bioInput = new TextInputBuilder()
      .setCustomId('bio')
      .setLabel('Yeni Hakkında/Bio (boş=değişmez)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(avatarInput),
      new ActionRowBuilder().addComponents(bannerInput),
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(bioInput),
    );

    return interaction.showModal(modal);
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'modal') return;
    const indices = parts[1].split('-').map(Number).filter(n => !isNaN(n));

    const avatarUrl = interaction.fields.getTextInputValue('avatar_url').trim();
    const bannerUrl = interaction.fields.getTextInputValue('banner_url').trim();
    const displayName = interaction.fields.getTextInputValue('display_name').trim();
    const bio = interaction.fields.getTextInputValue('bio').trim();

    if (!avatarUrl && !bannerUrl && !displayName && !bio) {
      return interaction.reply({ embeds: [errorEmbed('Değiştirilecek en az bir alan doldurun!')], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const avatarDataUrl = await urlToDataUrl(avatarUrl);
      const bannerDataUrl = await urlToDataUrl(bannerUrl);

      const reports = await runProfileJob(interaction.user.id, indices, { avatarDataUrl, bannerDataUrl, displayName, bio });
      const successCount = reports.filter(r => r.ok && !r.error).length;

      const embed = new EmbedBuilder()
        .setTitle(`🌌 Profile Changer Raporu`)
        .setColor(successCount === indices.length ? COLORS.success : COLORS.info)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 👥 **Hesaplar:** \`${indices.length}\`  ✅ **Başarılı:** \`${successCount}\``,
          ``,
          buildReportLines(reports),
          `\`${THIN_DIVIDER}\``,
        ].join('\n'))
        .setFooter(FOOTER())
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(err.message)] });
    }
  },
};
