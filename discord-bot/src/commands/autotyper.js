// src/commands/autotyper.js ✨ REXAL AutoTyper Modülü
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  startAutoTyper, stopAutoTyper, isAutoTyperRunning,
  getAutoTyperStats, getAllAutoTyperSessions,
} from '../utils/autoTyperRunner.js';
import { COLORS, E, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('AutoTyper Engine');

export default {
  name: 'autotyper',
  aliases: ['ototyper', 'typer', 'oto-typer'],
  description: 'REXAL AutoTyper Modülü Kontrol Paneli',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setAuthor({ name: `${BRAND.name} ⬢ TypeFlow Engine ${BRAND.version}` })
      .setDescription([
        UX.header,
        `## ⌨️ REXAL AutoTyper Modülü`,
        `*${UX.arrow} Kanallarda döngüsel \`Yazıyor...\` simülasyonu — hesaplar kasadan seçilir*`,
        UX.footerLine,
        '',
        statusLine([['📊', 'Sistem', 'Aktif'], ['⏱️', 'Döngü', '8s'], ['🔁', 'Mod', 'Döngüsel']]),
        '',
        section('AutoTyper Nedir?'),
        'Belirtilen kanalda seçilen hesap üzerinden sürekli **"Yazıyor..."** simülasyonu çalıştırır.',
        'Hesaplarını `!hesaplarim` ile merkezi kasaya ekle, buradan tek tıkla seç.',
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('✅', 'Havuzdan Seç', 'Token girmeye gerek yok, kasadan seçilir')}`,
        `> ${UX.dot2} ${bullet('⏱️', '8s Yenileme', 'Discord algoritmasıyla uyumlu akıllı döngü')}`,
        `> ${UX.dot2} ${bullet('🔐', 'AES-256', 'Tokenlar askerî seviyede şifreli')}`,
        `> ${UX.dot2} ${bullet('♻️', 'Reboot Recovery', 'Restart sonrası oturumlar geri yüklenir')}`,
        '',
        section('Kontrol Paneli'),
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('autotyper:sec').setLabel('Havuzdan Hesap Seç').setEmoji('👤').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('autotyper:durdur').setLabel('AutoTyper Durdur').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('autotyper:tumudurdur').setLabel('Tümünü Durdur').setEmoji('🛑').setStyle(ButtonStyle.Secondary),
      ),
    ];

    await message.reply({ embeds: [embed], components: rows });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const tokens = getTokens(interaction.user.id);

    if (action === 'sec') {
      if (tokens.length === 0) {
        return interaction.reply({ content: '📦 Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
      }
      const options = tokens.map((t, i) => ({
        label: t.label || `Hesap ${i + 1}`,
        description: isAutoTyperRunning(interaction.user.id, i) ? '✅ Zaten çalışıyor' : '⭕ Hazır (Durduruldu)',
        value: String(i),
        emoji: isAutoTyperRunning(interaction.user.id, i) ? '▶️' : '💤',
      }));
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('autotyper:kanalmodal')
          .setPlaceholder('AutoTyper için çalıştırmak istediğin hesabı seç...')
          .addOptions(options),
      );
      return interaction.reply({ content: '👤 **Hesap seç:**', components: [row], ephemeral: true });
    }

    if (action === 'durdur') {
      if (tokens.length === 0) {
        return interaction.reply({ content: '📦 Kasanızda hesap yok.', ephemeral: true });
      }
      const options = tokens
        .map((t, i) => ({ t, i }))
        .filter(({ i }) => isAutoTyperRunning(interaction.user.id, i))
        .map(({ t, i }) => ({
          label: t.label || `Hesap ${i + 1}`,
          description: '⏳ Çalışıyor — Durdurmak için seç',
          value: String(i),
          emoji: '🛑',
        }));
      if (options.length === 0) {
        return interaction.reply({ content: '📭 Şu anda çalışan AutoTyper oturumunuz yok.', ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('autotyper:durduronay')
          .setPlaceholder('Durdurmak istediğin hesabı seç...')
          .addOptions(options),
      );
      return interaction.reply({ content: '🛑 **Durdurulacak hesabı seç:**', components: [row], ephemeral: true });
    }

    if (action === 'tumudurdur') {
      await interaction.deferReply({ ephemeral: true });
      const sessions = getAllAutoTyperSessions().filter(s => s.userId === interaction.user.id);
      let stopped = 0;
      for (const s of sessions) {
        if (stopAutoTyper(s.userId, s.tokenIndex, { silent: true })) stopped++;
      }
      return interaction.editReply({ content: `🛑 **${stopped} adet** AutoTyper oturumu durduruldu.` });
    }
  },

  async onSelect(interaction, parts) {
    const action = parts[0];

    if (action === 'kanalmodal') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      const modal = new ModalBuilder()
        .setCustomId(`autotyper:modal:${tokenIndex}`)
        .setTitle('AutoTyper — Kanal Ayarları');

      const channelInput = new TextInputBuilder()
        .setCustomId('channel_ids')
        .setLabel('Kanal ID (virgülle ayırarak birden fazla)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678, 987654321098765432')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(channelInput));
      return interaction.showModal(modal);
    }

    if (action === 'durduronay') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      stopAutoTyper(interaction.user.id, tokenIndex);
      await interaction.update({ content: `✅ Hesap #${tokenIndex + 1} AutoTyper oturumu durduruldu.`, components: [] });
    }
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'modal') return;
    const tokenIndex = parseInt(parts[1], 10);
    const channelIds = interaction.fields.getTextInputValue('channel_ids').split(/[, ]+/).filter(Boolean);

    if (channelIds.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('Geçerli kanal ID girilmedi!')], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const res = await startAutoTyper(interaction.user.id, tokenIndex, channelIds);

    if (!res.success) {
      return interaction.editReply({ embeds: [errorEmbed(`AutoTyper başlatılamadı:\n\`${res.error}\``)] });
    }

    const stats = getAutoTyperStats(interaction.user.id, tokenIndex);
    const embed = new EmbedBuilder()
      .setTitle('⌨️ AutoTyper Başlatıldı!')
      .setColor(COLORS.success)
      .setDescription([
        `\`${THIN_DIVIDER}\``,
        `> 👤 **Hesap:** \`${res.username}\``,
        `> 📺 **Kanallar:** \`${channelIds.join(', ')}\``,
        `> ⏱️ **Döngü:** \`8 saniye\`  🔁 **Mod:** \`Döngüsel 7/24\``,
        `> ♻️ **Reboot Recovery:** \`Aktif\``,
        `\`${THIN_DIVIDER}\``,
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
