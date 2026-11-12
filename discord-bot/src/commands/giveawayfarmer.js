// src/commands/giveawayfarmer.js — 🎁 Giveaway Farmer Modülü
// Kasadaki hesaplar, bulundukları sunuculardaki 🎉 reaksiyonlu giveaway mesajlarına otomatik katılır.
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine } from '../utils/embeds.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  ensureListener, stopListener, getListenerInfo, getListenersByRole, isListening,
} from '../utils/eventListenerRunner.js';

const FOOTER = () => BRAND.footer('Giveaway Hunter Engine');

export default {
  name: 'giveawayfarmer',
  aliases: ['giveaway', 'gafarmer', 'gaw'],
  description: 'REXAL — Otomatik Giveaway Katılımcısı',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setAuthor({ name: `${BRAND.name} • Giveaway Hunter Engine ${BRAND.version}` })
      .setTitle('🎁 REXAL — Giveaway Farmer')
      .setDescription([
        UX.header, UX.footerLine, '',
        statusLine([['🌐', 'Sistem', 'Hazır'], ['🎉', 'Mod', 'Oto Katılım']]),
        '',
        section('Ne Yapar?'),
        'Seçili hesaplar **sürekli açık oturum** ile bekler; bulundukları sunucularda 🎉 reaksiyonlu bir giveaway mesajı geçtiği anda otomatik katılır.',
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('👁️', 'Canlı Dinleme', 'Hesaplar açık kalır, mesaj akışını gerçek zamanlı izler')}`,
        `> ${UX.dot2} ${bullet('🛡️', 'Tek Katılım', 'Aynı mesaja ikinci kez react atmaz (dup guard)')}`,
        `> ${UX.dot2} ${bullet('📊', 'Kalıcı İstatistik', 'Kaç giveaway\'e katıldı, diskte saklanır')}`,
        `> ${UX.dot2} ${bullet('🔁', 'Reboot Recovery', 'Bot kapansa da dinleyiciler geri gelir')}`,
        '',
        section('Kontrol Paneli'),
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('giveawayfarmer:baslat').setLabel('Farmer Başlat').setEmoji('🎁').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('giveawayfarmer:rapor').setLabel('Rapor').setEmoji('📊').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('giveawayfarmer:durdur').setLabel('Durdur').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
      )],
    });
  },

  async onButton(interaction, action) {
    const userId = interaction.user.id;
    const tokens = getTokens(userId);

    if (action[0] === 'rapor') {
      const running = getListenersByRole(userId, 'giveaway');
      if (running.length === 0) return interaction.reply({ content: '📭 Aktif giveaway farmer yok.', ephemeral: true });
      const lines = running.map(r => {
        const info = getListenerInfo(userId, r.tokenIndex);
        return `> 🟢 **Hesap #${r.tokenIndex + 1}** — 🎉 \`${info?.stats?.giveawaysJoined ?? 0}\` katılım`;
      }).join('\n');
      const embed = new EmbedBuilder().setTitle('🎁 Giveaway Farmer Raporu').setColor(COLORS.success)
        .setDescription(lines).setFooter(FOOTER()).setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action[0] === 'durdur') {
      const running = getListenersByRole(userId, 'giveaway');
      if (running.length === 0) return interaction.reply({ content: '📭 Aktif farmer yok.', ephemeral: true });
      return interaction.reply({
        content: 'Durdurulacak hesabı seç:',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('giveawayfarmer:durdursec')
            .addOptions(running.map(r => ({ label: `Hesap #${r.tokenIndex + 1}`, value: String(r.tokenIndex), emoji: '🟢' })))
            .setPlaceholder('🔍 Hesap seç...'),
        )], ephemeral: true,
      });
    }

    if (action[0] === 'baslat') {
      if (tokens.length === 0) return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
      const options = tokens.map((t, i) => ({
        label: `${i + 1}. ${t.username || t.label || `Hesap ${i + 1}`}`,
        value: String(i),
        emoji: isListening(userId, i, 'giveaway') ? '🟢' : (t.status === 'gecersiz' ? '💔' : '⚪'),
      }));
      return interaction.reply({
        content: 'Hangi hesaplar giveaway avlayacak?',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('giveawayfarmer:sec')
            .addOptions(options).setPlaceholder('🔍 Hesaplar (çoklu seçim)').setMinValues(1).setMaxValues(options.length),
        )], ephemeral: true,
      });
    }
  },

  async onSelect(interaction, action) {
    await interaction.deferReply({ ephemeral: true });
    if (action[0] === 'sec') {
      const results = [];
      for (const v of interaction.values) {
        const idx = Number(v);
        try {
          const r = await ensureListener(interaction.user.id, idx, { giveaway: true });
          results.push(`> ${r.alreadyRunning ? 'ℹ️' : '✅'} **Hesap #${idx + 1}** — ${r.alreadyRunning ? 'zaten aktif, rol eklendi' : 'dinleme başladı'}`);
        } catch (err) {
          results.push(`> 💔 **Hesap #${idx + 1}** — ${err.message}`);
        }
      }
      const embed = new EmbedBuilder().setTitle('🎁 Farmer Başlatıldı').setColor(COLORS.success)
        .setDescription(results.join('\n')).setFooter(FOOTER()).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }
    if (action[0] === 'durdursec') {
      const lines = interaction.values.map(v => {
        const idx = Number(v);
        const ok = stopListener(interaction.user.id, idx);
        return `> ${ok ? '⏹️' : '❌'} **Hesap #${idx + 1}** — ${ok ? 'durduruldu' : 'aktif değildi'}`;
      }).join('\n');
      return interaction.editReply({ content: lines, embeds: [] });
    }
  },
};
