// src/commands/otomesaj.js — 🕐 Oto Mesaj/Post Modülü
// Belirlenen kanala, dakika bazlı interval ile reklam/davet mesajı atar (rastgele havuzdan).
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine } from '../utils/embeds.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  startScheduledJob, stopScheduledJob, getScheduledJobs, getJobState, isJobRunning,
} from '../utils/scheduledMessenger.js';

const FOOTER = () => BRAND.footer('Scheduled Post Engine');

function fmtState(s) {
  if (!s) return '> ⚪ *Bu hesap için çalışan görev yok.*';
  return [
    `> 🎯 **Kanal:** <#${s.channel}>`,
    `> ⏱️ **Aralık:** \`${s.intervalMinutes} dk\` (rastgele jitter ile)`,
    `> 📨 **Gönderilen:** \`${s.sentCount}\` adet`,
    `> 🕒 **Son gönderim:** ${s.lastSentAt ? `\`${s.lastSentAt}\`` : '*henüz yok*'}`,
    `> 📝 **Mesaj havuzu:**`,
    s.messages.map((m, i) => `>    ${i + 1}. ${m.slice(0, 80)}${m.length > 80 ? '…' : ''}`).join('\n'),
  ].join('\n');
}

export default {
  name: 'otomesaj',
  aliases: ['scheduledmessage', 'otopost', 'autopost', 'otoreklam'],
  description: 'REXAL — Zamanlanmış Kanal Mesaj Motoru Kontrol Paneli',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setAuthor({ name: `${BRAND.name} • Scheduled Post Engine ${BRAND.version}` })
      .setTitle('🕐 REXAL — Oto Mesaj / Post Modülü')
      .setDescription([
        UX.header, UX.footerLine, '',
        statusLine([['🌐', 'Sistem', 'Hazır'], ['⏰', 'Mod', 'Zamanlanmış'], ['🎲', 'Havuz', 'Rastgele']]),
        '',
        section('Ne Yapar?'),
        'Seçtiğin hesap üzerinden, belirlediğin kanala **dakika bazlı aralıklarla** mesaj atar.',
        'Mesaj havuzu birden fazla satırdan oluşur — her seferinde **rastgele biri** gönderilir (bot görünümü).',
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('⏱️', 'Akıllı Interval', 'Dakika bazlı + rastgele jitter (0-15sn) — makine ritmi görünmez')}`,
        `> ${UX.dot2} ${bullet('🎲', 'Mesaj Havuzu', 'Her satır ayrı şablon — rotasyonla gönderilir')}`,
        `> ${UX.dot2} ${bullet('🔁', 'Reboot Recovery', 'Bot yeniden başlasa da görevler geri gelir')}`,
        `> ${UX.dot2} ${bullet('♾️', 'Sıfır İz', 'Durdurunca oturum tamamen kapanır')}`,
        '',
        section('Kontrol Paneli'),
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('otomesaj:baslat').setLabel('Görev Başlat').setEmoji('🕐').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('otomesaj:durum').setLabel('Durum').setEmoji('📋').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('otomesaj:durdur').setLabel('Durdur').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
      )],
    });
  },

  async onButton(interaction, action) {
    const userId = interaction.user.id;
    const tokens = getTokens(userId);

    // hesap seçici (ortak akış)
    const showAccountSelect = async (prefill) => {
      const options = tokens.map((t, i) => ({
        label: `${i + 1}. ${t.username || t.label || `Hesap ${i + 1}`}`,
        value: String(i),
        emoji: isJobRunning(userId, i) ? '🟢' : (t.status === 'gecersiz' ? '💔' : '⚪'),
      }));
      return interaction.reply({
        embeds: [errorEmbed(prefill)],
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('otomesaj:hesapsec').setPlaceholder('🔍 Hesap seç...').addOptions(options),
        )],
        ephemeral: true,
      });
    };

    if (action[0] === 'hesapsec') {
      const idx = Number(interaction.values[0]);
      const modal = new ModalBuilder().setCustomId(`otomesaj:modal:${idx}`).setTitle('Oto Mesaj Görevi Kur');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('channel_id').setLabel('Kanal ID (hedef kanal)')
            .setPlaceholder('Örn: 1234567890123456789').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('interval').setLabel('Aralık (dakika)')
            .setPlaceholder('Örn: 30').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('messages').setLabel('Mesaj havuzu (her satır ayrı şablon)')
            .setPlaceholder('Satır 1: davet mesajı\nSatır 2: başka mesaj').setStyle(TextInputStyle.Paragraph).setRequired(true)),
      );
      return interaction.showModal(modal);
    }

    if (action[0] === 'baslat') {
      if (tokens.length === 0) return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
      return showAccountSelect('Hangi hesapla görev başlatılsın?');
    }

    if (action[0] === 'durum') {
      const jobs = getScheduledJobs(userId);
      if (jobs.length === 0) return interaction.reply({ content: '📭 Aktif görev yok.', ephemeral: true });
      const lines = jobs.map(j => `**Hesap #${j.tokenIndex + 1}**\n${fmtState(getJobState(userId, j.tokenIndex))}`).join('\n\n');
      const embed = new EmbedBuilder().setTitle('📋 Oto Mesaj Görevleri').setColor(COLORS.info)
        .setDescription(lines.slice(0, 4000)).setFooter(FOOTER()).setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action[0] === 'durdur') {
      const running = tokens.map((t, i) => i).filter(i => isJobRunning(userId, i));
      if (running.length === 0) return interaction.reply({ content: '📭 Aktif görev yok.', ephemeral: true });
      await interaction.reply({
        content: 'Durdurulacak hesabı seç:',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('otomesaj:durdursec')
            .setPlaceholder('🔍 Görev seç...')
            .addOptions(running.map(i => ({
              label: `${i + 1}. ${tokens[i].username || tokens[i].label || `Hesap ${i + 1}`}`,
              value: String(i), emoji: '🟢',
            })))),
        ], ephemeral: true,
      });
    }
  },

  async onSelect(interaction, action) {
    if (action[0] === 'durdursec') {
      const idx = Number(interaction.values[0]);
      const ok = stopScheduledJob(interaction.user.id, idx);
      return interaction.update({ content: ok ? `⏹️ Hesap #${idx + 1} görevi durduruldu.` : '❌ Görev bulunamadı.', components: [] });
    }
  },

  async onModalSubmit(interaction, action) {
    const idx = Number(action[0]);
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();
    const intervalRaw = interaction.fields.getTextInputValue('interval').trim();
    const messages = interaction.fields.getTextInputValue('messages').split('\n').map(s => s.trim()).filter(Boolean);

    if (!/^\d{5,}$/.test(channelId)) return interaction.reply({ embeds: [errorEmbed('Kanal ID formatı hatalı!')], ephemeral: true });
    const intervalMinutes = parseInt(intervalRaw, 10);
    if (isNaN(intervalMinutes) || intervalMinutes < 1) return interaction.reply({ embeds: [errorEmbed('Aralık en az `1` dakika olmalı!')], ephemeral: true });
    if (messages.length === 0) return interaction.reply({ embeds: [errorEmbed('En az bir mesaj şablonu gerekli!')], ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    try {
      await startScheduledJob(interaction.user.id, idx, { channelId, intervalMinutes, messages });
      const state = getJobState(interaction.user.id, idx);
      const embed = new EmbedBuilder()
        .setTitle('🕐 Oto Mesaj Görevi Başlatıldı')
        .setColor(COLORS.success)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          fmtState(state),
          '',
          `> ♾️ *Reboot sonrası otomatik geri gelir.*`,
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(`Görev başlatılamadı: ${err.message}`)] });
    }
  },
};
