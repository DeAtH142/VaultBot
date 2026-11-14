// src/commands/otobump.js — 🚀 REXAL OTO BUMP (Premium)
//
//   !otobump          → panel
//   !otobump rapor    → detaylı istatistik
//   !otobump bots     → desteklenen bump botları
//   !otobump durdur   → tüm işleri durdur
import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  startBumpJob,
  stopBumpJob,
  getUserBumpJobs,
  getBumpStats,
  forceBumpNow,
  isBumpRunning,
  BUMP_BOTS,
} from '../utils/bumpRunner.js';
import {
  createBumpEmbed,
  createBumpDetailEmbed,
  createBumpBotsEmbed,
  createBumpStartedEmbed,
  createBumpComponents,
} from '../utils/embeds.js';
import { COLORS, E, BRAND, UX, THIN_DIVIDER, errorEmbed } from '../utils/embeds.js';
import { markStart, markStop } from '../utils/playtimeHooks.js';

export default {
  name: 'otobump',
  aliases: ['bump', 'autobump', 'bumpoto'],
  description: 'Disboard/MEE6 otomatik bump sistemi',

  async execute(message, args = []) {
    const sub = (args[0] || '').toLowerCase();
    const user = message.author;
    const jobs = getUserBumpJobs(user.id);

    if (sub === 'bots' || sub === 'botlar') {
      return message.reply({ embeds: [createBumpBotsEmbed()] });
    }

    if (sub === 'rapor' || sub === 'stats') {
      if (jobs.length === 0) {
        return message.reply({ embeds: [createBumpDetailEmbed(user, null)] });
      }
      return message.reply({ embeds: [createBumpDetailEmbed(user, jobs[0])] });
    }

    if (sub === 'durdur' || sub === 'stop') {
      let stopped = 0;
      for (const j of jobs) {
        const [, idx] = j.key.split(':');
        if (stopBumpJob(user.id, Number(idx))) {
          stopped++;
          markStop(user.id, 'otobump', Number(idx));
        }
      }
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.danger)
          .setTitle(`${E.cross} Bump işleri durduruldu`)
          .setDescription(`> \`${stopped}\` iş durduruldu.`)
          .setFooter(BRAND.footer('Bump Engine'))],
      });
    }

    const embed = createBumpEmbed(user, jobs);
    await message.reply({ embeds: [embed], components: createBumpComponents(jobs.length > 0) });
  },

  // ── Butonlar ────────────────────────────────────────────────────────────
  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;
    const tokens = getTokens(userId);

    if (action === 'refresh') {
      const jobs = getUserBumpJobs(userId);
      return interaction.update({
        embeds: [createBumpEmbed(interaction.user, jobs)],
        components: createBumpComponents(jobs.length > 0),
      });
    }

    if (action === 'bots') {
      return interaction.reply({ embeds: [createBumpBotsEmbed()], ephemeral: true });
    }

    if (action === 'rapor') {
      const jobs = getUserBumpJobs(userId);
      if (jobs.length === 0) {
        return interaction.reply({ embeds: [createBumpDetailEmbed(interaction.user, null)], ephemeral: true });
      }
      return interaction.reply({ embeds: [createBumpDetailEmbed(interaction.user, jobs[0])], ephemeral: true });
    }

    if (action === 'force') {
      const jobs = getUserBumpJobs(userId);
      if (jobs.length === 0) {
        return interaction.reply({ content: '❌ Çalışan iş yok.', ephemeral: true });
      }
      const [, idx] = jobs[0].key.split(':');
      await forceBumpNow(userId, Number(idx));
      return interaction.reply({
        content: `⚡ **${(BUMP_BOTS[jobs[0].botKey] || BUMP_BOTS.disboard).name}** için hemen bump denemesi planlandı. Cevabı panelden takip et.`,
        ephemeral: true,
      });
    }

    if (action === 'stop') {
      const jobs = getUserBumpJobs(userId);
      if (jobs.length === 0) {
        return interaction.reply({ content: '❌ Çalışan iş yok.', ephemeral: true });
      }

      const options = jobs.map(j => {
        const bot = BUMP_BOTS[j.botKey] || BUMP_BOTS.disboard;
        return {
          label: `${bot.name} — ${j.guildId}`,
          description: `${j.totalBumps || 0} bump · ${j.nextInSec > 0 ? `${Math.ceil(j.nextInSec / 60)} dk sonra` : 'şimdi'}`,
          value: j.key,
          emoji: '🛑',
        };
      });

      return interaction.reply({
        content: '🛑 **Durdurulacak işi seç:**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('otobump:stopconfirm')
            .setPlaceholder('Bump işi seç...')
            .addOptions(options),
        )],
        ephemeral: true,
      });
    }

    if (action === 'start') {
      if (tokens.length === 0) {
        return interaction.reply({
          content: '📦 Kasanızda hesap yok! Önce `!hesaplarim` ile hesap ekleyin.',
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setAuthor({ name: `${BRAND.name} • Bump Engine`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
        .setColor(COLORS.primary)
        .setTitle(`${E.rocket}  Bump İçin Hesap Seç`)
        .setDescription([
          `> ${E.check} **Çalışan hesaplar** menüde işaretli`,
          '> Bir hesap seçince **ayar formu** açılacak.',
          '',
          THIN_DIVIDER,
          '',
          `${E.info} *Güvenlik ipucu:* birden fazla hesabınız varsa, aynı sunucuda farklı hesap kullanmak ban riskini düşürür.`,
        ].join('\n'));

      const options = tokens.map((t, i) => {
        const running = isBumpRunning(userId, i);
        return {
          label: (t.username || t.label || `Hesap ${i + 1}`).slice(0, 100),
          description: running ? '⚡ Bump aktif' : '⭕ Hazır',
          value: String(i),
          emoji: running ? '🚀' : '💤',
        };
      });

      return interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('otobump:hesapsec')
            .setPlaceholder('Bump yapacak hesabı seç...')
            .addOptions(options),
        )],
        ephemeral: true,
      });
    }
  },

  // ── Select ──────────────────────────────────────────────────────────────
  async onSelect(interaction, parts) {
    const action = parts[0];

    if (action === 'stopconfirm') {
      const key = interaction.values[0];
      const [uid, idx] = key.split(':');
      if (uid !== interaction.user.id) {
        return interaction.reply({ content: '❌ Bu iş size ait değil.', ephemeral: true });
      }
      stopBumpJob(uid, Number(idx));
      markStop(uid, 'otobump', Number(idx));
      return interaction.update({
        content: `🛑 **${key}** işi durduruldu.`,
        components: [],
      });
    }

    if (action === 'hesapsec') {
      const tokenIndex = parseInt(interaction.values[0], 10);

      // Modal içine select konulamaz → önce bot seçimi, sonra modal
      const botOptions = Object.entries(BUMP_BOTS).map(([key, b]) => ({
        label: b.name,
        description: `ID: ${b.id}`,
        value: key,
        emoji: b.emoji,
      }));

      return interaction.reply({
        content: '🤖 **Hangi bump botunu kullanacaksın?**\n> Seçtikten sonra ayar formu açılacak.',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`otobump:botsec:${tokenIndex}`)
            .setPlaceholder('Bump botu seç...')
            .addOptions(botOptions),
        )],
        ephemeral: true,
      });
    }

    if (action === 'botsec') {
      const tokenIndex = parseInt(parts[1], 10);
      const botKey = interaction.values[0];
      const bot = BUMP_BOTS[botKey];

      const modal = new ModalBuilder()
        .setCustomId(`otobump:modal:${tokenIndex}:${botKey}`)
        .setTitle(`🚀 ${bot.name} — Bump Ayarları`.slice(0, 45));

      const guildInput = new TextInputBuilder()
        .setCustomId('guild_id')
        .setLabel('Sunucu ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678')
        .setRequired(true);

      const channelInput = new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('Bump Kanal ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Bump komutunun çalıştığı kanal')
        .setRequired(true);

      const fallbackInput = new TextInputBuilder()
        .setCustomId('fallback_channel')
        .setLabel('Yedek Kanal ID (opsiyonel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Kanal silinirse buraya geçer')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(guildInput),
        new ActionRowBuilder().addComponents(channelInput),
        new ActionRowBuilder().addComponents(fallbackInput),
      );

      return interaction.showModal(modal);
    }
  },

  // ── Modal ───────────────────────────────────────────────────────────────
  async onModalSubmit(interaction, parts) {
    const tokenIndex = parseInt(parts[1], 10);
    const botKey = parts[2] || 'disboard';
    const userId = interaction.user.id;

    const guildId = interaction.fields.getTextInputValue('guild_id').trim();
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();
    let fallbackChannelId = '';
    try { fallbackChannelId = interaction.fields.getTextInputValue('fallback_channel')?.trim() || ''; } catch { }

    if (!/^\d{15,20}$/.test(guildId)) {
      return interaction.reply({ embeds: [errorEmbed('Sunucu ID geçersiz — 15-20 haneli sayı olmalı.')], ephemeral: true });
    }
    if (!/^\d{15,20}$/.test(channelId)) {
      return interaction.reply({ embeds: [errorEmbed('Kanal ID geçersiz — 15-20 haneli sayı olmalı.')], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const allTokens = getTokens(userId);
    const accounts = allTokens.map((_, i) => i).filter(i => i !== tokenIndex);

    const res = await startBumpJob(userId, tokenIndex, {
      guildId,
      channelId,
      fallbackChannelId,
      botKey,
      accounts: [tokenIndex, ...accounts],
    });

    if (!res.success) {
      return interaction.editReply({ embeds: [errorEmbed(`Bump başlatılamadı:\n\`${res.error}\``)] });
    }

    markStart(userId, 'otobump', tokenIndex);

    const stats = getBumpStats(userId, tokenIndex);
    const bot = BUMP_BOTS[botKey] || BUMP_BOTS.disboard;
    return interaction.editReply({ embeds: [createBumpStartedEmbed(interaction.user, stats, `${bot.emoji} ${bot.name}`)] });
  },
};
