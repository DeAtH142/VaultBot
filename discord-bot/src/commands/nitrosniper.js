// src/commands/nitrosniper.js — 🪙 Nitro Sniper Modülü
// Kasadaki hesaplar, DM/guild mesajlarında geçen nitro kodlarını otomatik claim eder.
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { COLORS, THIN_DIVIDER, BRAND, UX, section, bullet, statusLine, errorEmbed } from '../utils/embeds.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  ensureListener, stopListener, getListenerInfo, getListenersByRole, isListening,
} from '../utils/eventListenerRunner.js';

const FOOTER = () => BRAND.footer('Nitro Sniper Engine');

export default {
  name: 'nitrosniper',
  aliases: ['sniper', 'nitro'],
  description: 'REXAL — Otomatik Nitro Claim Sistemi',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setAuthor({ name: `${BRAND.name} • Nitro Sniper Engine ${BRAND.version}` })
      .setTitle('🪙 REXAL — Nitro Sniper')
      .setDescription([
        UX.header, UX.footerLine, '',
        statusLine([['🌐', 'Sistem', 'Hazır'], ['⚡', 'Mod', 'Anlık Claim']]),
        '',
        section('Ne Yapar?'),
        'Hesaplar açık oturum ile bekler; DM veya bulundukları kanallarda **discord.gift / discord.com/gifts** kodu geçtiği anda otomatik redeem dener.',
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('⚡', 'Anlık Tepki', 'Mesaj gelir gelmez claim denemesi')}`,
        `> ${UX.dot2} ${bullet('📊', 'Deneme/Kazanç', 'Kaç kod denendi, kaç tanesi alındı — diskte')}`,
        `> ${UX.dot2} ${bullet('🔁', 'Reboot Recovery', 'Dinleyiciler restart sonrası geri gelir')}`,
        '',
        section('Kontrol Paneli'),
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('nitrosniper:baslat').setLabel('Sniper Başlat').setEmoji('🪙').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('nitrosniper:rapor').setLabel('Rapor').setEmoji('📊').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('nitrosniper:durdur').setLabel('Durdur').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
      )],
    });
  },

  async onButton(interaction, action) {
    const userId = interaction.user.id;
    const tokens = getTokens(userId);

    if (action[0] === 'rapor') {
      const running = getListenersByRole(userId, 'nitro');
      if (running.length === 0) return interaction.reply({ content: '📭 Aktif sniper yok.', ephemeral: true });
      const lines = running.map(r => {
        const info = getListenerInfo(userId, r.tokenIndex);
        return `> 🟢 **Hesap #${r.tokenIndex + 1}** — 🎯 \`${info?.stats?.nitroTried ?? 0}\` deneme, ✅ \`${info?.stats?.nitroClaimed ?? 0}\` claim`;
      }).join('\n');
      const embed = new EmbedBuilder().setTitle('🪙 Sniper Raporu').setColor(COLORS.success)
        .setDescription(lines).setFooter(FOOTER()).setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action[0] === 'durdur') {
      const running = getListenersByRole(userId, 'nitro');
      if (running.length === 0) return interaction.reply({ content: '📭 Aktif sniper yok.', ephemeral: true });
      return interaction.reply({
        content: 'Durdurulacak hesabı seç:',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('nitrosniper:durdursec')
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
        emoji: isListening(userId, i, 'nitro') ? '🟢' : (t.status === 'gecersiz' ? '💔' : '⚪'),
      }));
      return interaction.reply({
        content: 'Hangi hesaplar nitro avlayacak?',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('nitrosniper:sec')
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
          const r = await ensureListener(interaction.user.id, idx, { nitro: true });
          results.push(`> ${r.alreadyRunning ? 'ℹ️' : '✅'} **Hesap #${idx + 1}** — ${r.alreadyRunning ? 'zaten aktif, rol eklendi' : 'dinleme başladı'}`);
        } catch (err) {
          results.push(`> 💔 **Hesap #${idx + 1}** — ${err.message}`);
        }
      }
      const embed = new EmbedBuilder().setTitle('🪙 Sniper Başlatıldı').setColor(COLORS.success)
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
