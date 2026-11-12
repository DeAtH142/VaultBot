// src/commands/voiceafk.js — 🌙 Özel AFK & Ses Sistemi
// TEK PANEL: Kasadaki TÜM hesaplar tek modal ile ses kanalına bağlanır.
// Kanal en fazla 10 kez aranır; bulunamazsa ısrar edilmez.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  startVoiceAfk, stopVoiceAfk, getVoiceAfkStats,
} from '../utils/voiceAfkRunner.js';
import { COLORS, THIN_DIVIDER, BRAND, UX, section, statusLine } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('Secure Voice Engine');

export default {
  name: 'voiceafk',
  aliases: ['sesafk', 'sesafkpanel', 'afkses'],
  description: 'REXAL — Özel AFK & Ses Sistemi Kontrol Paneli',

  async execute(message) {
    const tokens = getTokens(message.author.id);
    const stats = tokens
      .map((t, i) => ({ t, i }))
      .filter(({ i }) => getVoiceAfkStats(message.author.id, i))
      .map(({ t, i }) => {
        const s = getVoiceAfkStats(message.author.id, i);
        return `> 🎙️ **${t.username || t.label || `Hesap #${i + 1}`}** — \`${s.durationMin} dk\`, yeniden bağlanma: \`${s.reconnections}\``;
      });

    const embed = new EmbedBuilder()
      .setColor(0xfaa61a)
      .setAuthor({ name: `${BRAND.name} • Secure Voice Engine ${BRAND.version}` })
      .setTitle('🌙 REXAL — Özel AFK & Ses Sistemi')
      .setThumbnail(message.client.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription([
        UX.header,
        `*${UX.arrow} Kasadaki tüm hesaplar tek tıkla ses kanalına bağlanır*`,
        UX.footerLine,
        '',
        statusLine([['🎙️', 'Hedef', 'Tüm Hesaplar'], ['🔁', 'Deneme', '10/kanal'], ['🔒', 'Şifreleme', 'AES-256-GCM']]),
        '',
        section('Nasıl Çalışır?'),
        `> ${UX.dot2} "Tümünü Bağla" butonuna bas, sunucu + kanal ID gir`,
        `> ${UX.dot2} Kasadaki **tüm hesaplar** sırayla o ses kanalına bağlanır`,
        `> ${UX.dot2} Kanal bulunamazsa **10 kez** arar, yine bulamazsa **ısrar etmez**`,
        `> ${UX.dot2} Koparsa otomatik geri bağlanır (yine 10 deneme limitiyle)`,
        '',
        section('Aktif Oturumlar'),
        stats.length ? stats.join('\n') : '> ⚫ *Şu anda bağlı hesap yok*',
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('voiceafk:hepsi').setLabel('Tümünü Bağla').setEmoji('👥').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('voiceafk:tumukaldır').setLabel('Tümünü Kaldır').setEmoji('🛑').setStyle(ButtonStyle.Danger),
      ),
    ];

    await message.reply({ embeds: [embed], components: rows });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const tokens = getTokens(interaction.user.id);

    if (tokens.length === 0) {
      return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
    }

    if (action === 'hepsi') {
      const modal = new ModalBuilder()
        .setCustomId('voiceafk:hepsi')
        .setTitle('Tüm Hesapları Ses Kanalına Bağla');

      const guildInput = new TextInputBuilder()
        .setCustomId('guild_id')
        .setLabel('Sunucu ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678')
        .setRequired(true);

      const channelInput = new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('Ses Kanalı ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(guildInput),
        new ActionRowBuilder().addComponents(channelInput),
      );
      return interaction.showModal(modal);
    }

    if (action === 'tumukaldır' || action === 'tumukaldir') {
      let stopped = 0;
      tokens.forEach((_, i) => {
        if (stopVoiceAfk(interaction.user.id, i).success) stopped++;
      });
      return interaction.update({
        content: `🛑 **${stopped}** hesap ses kanalından çıkarıldı.`,
        components: [],
      });
    }
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'hepsi') return;

    const guildId = interaction.fields.getTextInputValue('guild_id').trim();
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();

    await interaction.deferReply({ ephemeral: true });

    const tokens = getTokens(interaction.user.id);
    const results = [];

    for (let idx = 0; idx < tokens.length; idx++) {
      const res = await startVoiceAfk(interaction.user.id, idx, guildId, channelId);
      const name = tokens[idx]?.username || tokens[idx]?.label || `Hesap #${idx + 1}`;
      results.push(res.success
        ? `> ✅ **${name}** — ses kanalına bağlandı`
        : `> ❌ **${name}** — \`${res.error}\``);
      if (idx < tokens.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

    const embed = new EmbedBuilder()
      .setTitle('🎙️ Ses AFK İşlem Raporu')
      .setColor(results.some(r => r.includes('✅')) ? COLORS.success : COLORS.danger)
      .setDescription([`\`${THIN_DIVIDER}\``, ...results, `\`${THIN_DIVIDER}\``].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
