// src/commands/joiner.js — 🛡️ REXAL — Token Joiner (Vault Sürümlü)
// KASADAN seçilen hesapları, verilen invite linkine OAuth2 akışıyla sokar.
// Hiçbir yerde token girilmez — hesaplar !hesaplarim kasasından seçilir.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { loginVaultAccount, destroyClient, sleep, buildReportLines } from '../utils/selfbotHelpers.js';
import { getTokens } from '../utils/tokenStore.js';
import { COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('OAuth2 Secure Joiner');
const JOIN_DELAY_MS = 1500; // her token arası

/**
 * Bir selfbot client'ı invite üzerinden sunucuya sokar.
 * selfbot-v13 fetchInvite + join akışı kullanır.
 */
async function joinViaInvite(client, inviteCode) {
  const invite = await client.fetchInvite(inviteCode);
  if (!invite || !invite.guild) throw new Error('Invite çözülemedi (geçersiz veya süresi dolmuş olabilir)');
  await client.acceptInvite(inviteCode);
  return invite.guild?.name || inviteCode;
}

async function runJoinJob(ownerId, indices, inviteCode) {
  const reports = [];
  for (let a = 0; a < indices.length; a++) {
    const idx = indices[a];
    if (a > 0) await sleep(JOIN_DELAY_MS); // 🛡️ akıllı rate-limit

    const login = await loginVaultAccount(ownerId, idx);
    if (!login.success) {
      reports.push({ tokenIndex: idx, ok: false, error: login.error });
      continue;
    }

    try {
      const guildName = await joinViaInvite(login.client, inviteCode);
      reports.push({ tokenIndex: idx, username: login.username, ok: true, summary: `join → **${guildName}**` });
    } catch (err) {
      reports.push({ tokenIndex: idx, username: login.username, ok: true, error: err.message });
    } finally {
      destroyClient(login.client);
    }
  }
  return reports;
}

export default {
  name: 'joiner',
  aliases: ['tokenjoiner', 'joinpanel'],
  description: 'REXAL — Token Joiner Kontrol Paneli',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: `${BRAND.name} • Secure Joiner ${BRAND.version}` })
      .setTitle(`🛡️ REXAL — Token Joiner`)
      .setDescription([
        UX.header,
        UX.footerLine,
        '',
        statusLine([['🌐', 'Sistem', 'Aktif'], ['👤', 'Durum', '🔰 Hazır'], ['🔐', 'Akış', 'OAuth2']]),
        '',
        section('Nasıl Kullanılır?'),
        `> 1️⃣ Kasaya \`!hesaplarim\` ile hesap ekleyin (token girmenize gerek yok!)`,
        `> 2️⃣ Aşağıdaki butona tıklayın ve kasadan hesap seçin`,
        `> 3️⃣ Sunucu invite linkini girin`,
        `> 4️⃣ İşlem sonunda rapor DM/eylem kanalınıza düşer`,
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('🔐', 'OAuth2 Güvenli Giriş', 'Discord resmi APIsisi üzerinden')}`,
        `> ${UX.dot2} ${bullet('🔐', 'Akıllı Rate-Limit', 'Her hesap arası `1.5sn` gecikme koruması')}`,
        `> ${UX.dot2} ${bullet('🔐', 'Rapor', 'Başarılı/başarısız tüm detay iletilir')}`,
        '',
        section('Başlat'),
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('joiner:sec').setLabel('Token Joiner Başlat').setEmoji('➕').setStyle(ButtonStyle.Success),
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
        label: t.label || t.username || `Hesap`,
        description: `Durum: ${t.status || 'pasif'}`,
        value: String(tokens.indexOf(t)),
        emoji: '🛡️',
      }));

    if (options.length === 0) {
      return interaction.reply({ content: '❌ Kasada geçerli hesap yok.', ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('joiner:select')
        .setPlaceholder('Sunucuya sokulacak hesapları seç (çoklu)...')
        .addOptions(options)
        .setMaxValues(Math.min(options.length, 25)),
    );

    return interaction.reply({ content: '🛡️ **Kasadan joinlenecek hesapları seç:**', components: [row], ephemeral: true });
  },

  async onSelect(interaction) {
    const indices = interaction.values.map(v => parseInt(v, 10));
    const modal = new ModalBuilder()
      .setCustomId(`joiner:modal:${indices.join('-')}`)
      .setTitle('Token Joiner — Invite Bilgisi');

    const inviteInput = new TextInputBuilder()
      .setCustomId('invite')
      .setLabel('Sunucu Invite Linki')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('discord.gg/xxxx  veya  https://discord.gg/xxxx')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(inviteInput));
    return interaction.showModal(modal);
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'modal') return;
    const indices = parts[1].split('-').map(Number).filter(n => !isNaN(n));
    let invite = interaction.fields.getTextInputValue('invite').trim();

    await interaction.deferReply({ ephemeral: true });

    // Invite kodunu normalize et
    invite = invite.replace(/^https?:\/\/(www\.)?(discord\.gg|discord\.com\/invite)\//i, '').split(/[/?#]/)[0];
    if (!invite) return interaction.editReply({ embeds: [errorEmbed('Invite linki geçersiz!')] });

    const reports = await runJoinJob(interaction.user.id, indices, invite);
    const successCount = reports.filter(r => r.ok && !r.error).length;

    const embed = new EmbedBuilder()
      .setTitle(`🛡️ Token Joiner Raporu`)
      .setColor(successCount === indices.length ? COLORS.success : COLORS.info)
      .setDescription([
        `\`${THIN_DIVIDER}\``,
        `> 🏠 **Hedef:** \`${invite}\``,
        `> 👥 **Hesaplar:** \`${indices.length}\`  ✅ **Başarılı:** \`${successCount}\``,
        ``,
        buildReportLines(reports),
        `\`${THIN_DIVIDER}\``,
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
