// src/commands/otobump.js — 🚀 REXAL OTO BUMP (OwO tarzı panel)
//
// Tek panel, herkes kendi hesabını yönetir:
//   !otobump          → panel (panel mesajı paylaşılır, buton cevapları EPHEMERAL)
//   !otobump rapor    → detaylı istatistik (sadece sana)
//   !otobump botlar   → desteklenen bump botları
//   !otobump durdur   → tüm işlerini durdur
import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
  createBumpPanelEmbed,
  createBumpPanelComponents,
  createBumpDetailEmbed,
  createBumpBotsEmbed,
  createBumpStartedEmbed,
} from '../utils/embeds.js';
import { COLORS, E, BRAND, UX, THIN_DIVIDER, DIVIDER, errorEmbed } from '../utils/embeds.js';
import { markStart, markStop } from '../utils/playtimeHooks.js';

const FOOTER = () => BRAND.footer('Bump Engine');

/** Panel mesajını üret (kullanıcıya özel veriler) */
function panelFor(user) {
  const jobs = getUserBumpJobs(user.id);
  const tokens = getTokens(user.id);
  return {
    embeds: [createBumpPanelEmbed(user, jobs, tokens)],
    components: createBumpPanelComponents(jobs.length > 0, tokens.length > 0),
  };
}

export default {
  name: 'otobump',
  aliases: ['bump', 'autobump', 'bumpoto'],
  description: 'Disboard/MEE6 otomatik bump — panel',

  async execute(message, args = []) {
    const sub = (args[0] || '').toLowerCase();
    const user = message.author;
    const jobs = getUserBumpJobs(user.id);

    // Alt komutlar — sadece istekte bulunan kişiye (ephemeral değil ama kısa mesaj)
    if (sub === 'botlar' || sub === 'bots') {
      return message.reply({ embeds: [createBumpBotsEmbed()] });
    }

    if (sub === 'rapor' || sub === 'stats' || sub === 'istatistik') {
      return message.reply({
        embeds: [jobs.length === 0
          ? createBumpDetailEmbed(user, null)
          : createBumpDetailEmbed(user, jobs[0])],
      });
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
          .setFooter(FOOTER())],
      });
    }

    if (sub === 'yardim' || sub === 'help') {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setAuthor({ name: `${BRAND.name} • Oto Bump Yardım`, iconURL: message.client.user.displayAvatarURL({ dynamic: true }) })
          .setColor(COLORS.info)
          .setTitle(`${E.rocket}  OTO BUMP — Komutlar`)
          .setDescription([
            `> ${UX.arrow} \`!otobump\` — Kontrol paneli`,
            `> ${UX.arrow} \`!otobump rapor\` — Detaylı istatistik`,
            `> ${UX.arrow} \`!otobump botlar\` — Desteklenen bump botları`,
            `> ${UX.arrow} \`!otobump durdur\` — Tüm işlerini durdur`,
            THIN_DIVIDER,
            `**Panel akışı (OwO gibi):**`,
            `> 1. **➕ Hesap Seç & Başlat**`,
            `> 2. Kasadan hesap seç`,
            `> 3. Bump botu seç (DISBOARD / MEE6 / BLMP)`,
            `> 4. Sunucu ID + Kanal ID gir`,
            `> 5. Motor bump botunun cevabını okuyup **gerçek cooldown**'u öğrenir`,
            '',
            `*Tüm buton cevapları sadece sana görünür.*`,
          ].join('\n'))
          .setFooter(FOOTER())
          .setTimestamp()],
      });
    }

    // ── ANA PANEL ────────────────────────────────────────────────────────
    await message.reply(panelFor(user));
  },

  // ── Butonlar (hepsi ephemeral / kişiye özel) ────────────────────────────
  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;
    const tokens = getTokens(userId);
    const jobs = getUserBumpJobs(userId);

    // 🔄 Yenile → panel mesajını güncelle
    if (action === 'yenile' || action === 'refresh') {
      const data = panelFor(interaction.user);
      return interaction.update(data);
    }

    // 📊 Rapor → kişiye özel
    if (action === 'rapor') {
      if (jobs.length === 0) {
        return interaction.reply({ embeds: [createBumpDetailEmbed(interaction.user, null)], ephemeral: true });
      }
      return interaction.reply({ embeds: [createBumpDetailEmbed(interaction.user, jobs[0])], ephemeral: true });
    }

    // 🤖 Bump botları
    if (action === 'botlar' || action === 'bots') {
      return interaction.reply({ embeds: [createBumpBotsEmbed()], ephemeral: true });
    }

    // ⚡ Şimdi dene
    if (action === 'force') {
      if (jobs.length === 0) {
        return interaction.reply({ content: '❌ Çalışan iş yok.', ephemeral: true });
      }
      const [, idx] = jobs[0].key.split(':');
      await forceBumpNow(userId, Number(idx));
      const bot = BUMP_BOTS[jobs[0].botKey] || BUMP_BOTS.disboard;
      return interaction.reply({
        content: `⚡ **${bot.name}** için hemen bump denemesi planlandı.\n> Sonucu panelden veya \`!otobump rapor\` ile gör.`,
        ephemeral: true,
      });
    }

    // ➕ Hesap Seç & Başlat
    if (action === 'ekle' || action === 'start') {
      if (tokens.length === 0) {
        return interaction.reply({
          content: '📦 Kasanızda hesap yok! Önce `!hesaplarim` panelinden **Token Ekle** butonuna bas.',
          ephemeral: true,
        });
      }

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
        embeds: [new EmbedBuilder()
          .setAuthor({ name: `${BRAND.name} • Bump Engine`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
          .setColor(COLORS.primary)
          .setTitle(`${E.rocket} Hesap Seçimi (${tokens.length} hesap)`)
          .setDescription([
            `> ${E.check} **Çalışan hesaplar menüde işaretli**`,
            '> Bir hesap seçince **bump botu** seçimi açılacak.',
            '',
            DIVIDER,
          ].join('\n'))
          .setFooter(FOOTER())],
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('otobump:hesapsec')
            .setPlaceholder('Bump yapacak hesabı seç...')
            .addOptions(options),
        )],
        ephemeral: true,
      });
    }

    // 🛑 Durdur / Kaldır
    if (action === 'kaldir' || action === 'stop') {
      if (jobs.length === 0) {
        return interaction.reply({ content: '📭 Durdurulacak iş yok.', ephemeral: true });
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
        content: '🛑 **Durdurmak istediğin işi seç:**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('otobump:durdursec')
            .setPlaceholder('Bump işi seç...')
            .addOptions(options),
        )],
        ephemeral: true,
      });
    }

    // ⛔ Tümünü durdur
    if (action === 'tumunudurdur') {
      let stopped = 0;
      for (const j of jobs) {
        const [, idx] = j.key.split(':');
        if (stopBumpJob(userId, Number(idx))) {
          stopped++;
          markStop(userId, 'otobump', Number(idx));
        }
      }
      // Panel mesajını güncelle (paylaşılan panel bozulmasın diye update yerine reply)
      try {
        await interaction.update(panelFor(interaction.user));
      } catch { }
      return interaction.followUp({
        content: `⛔ **${stopped}** iş durduruldu.`,
        ephemeral: true,
      }).catch(() => { });
    }
  },

  // ── Select menüleri ─────────────────────────────────────────────────────
  async onSelect(interaction, parts) {
    const action = parts[0];

    // Durdurma onayı
    if (action === 'durdursec' || action === 'stopconfirm') {
      const key = interaction.values[0];
      const [uid, idx] = key.split(':');
      if (uid !== interaction.user.id) {
        return interaction.reply({ content: '❌ Bu iş size ait değil.', ephemeral: true });
      }
      const bot = (() => {
        const j = getUserBumpJobs(uid).find(x => x.key === key);
        return BUMP_BOTS[j?.botKey] || BUMP_BOTS.disboard;
      })();
      stopBumpJob(uid, Number(idx));
      markStop(uid, 'otobump', Number(idx));
      return interaction.update({
        content: `🛑 **${bot.name}** işi durduruldu.`,
        components: [],
      });
    }

    // Hesap seçildi → bot seçimi
    if (action === 'hesapsec') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      const t = getTokens(interaction.user.id)[tokenIndex];
      const name = t?.username || t?.label || `Hesap ${tokenIndex + 1}`;

      const botOptions = Object.entries(BUMP_BOTS).map(([key, b]) => ({
        label: b.name,
        description: b.command.type === 'slash' ? `/${b.command.name} (slash)` : b.command.text,
        value: key,
        emoji: b.emoji,
      }));

      return interaction.update({
        embeds: [new EmbedBuilder()
          .setAuthor({ name: `${BRAND.name} • Bump Engine`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
          .setColor(COLORS.primary)
          .setTitle(`${E.brain} Bump Botu Seç`)
          .setDescription([
            `> ${E.crown} **Hesap:** \`${name}\``,
            `> ${E.info} Hangi bump botunu otomatik çağıracaksın?`,
            '',
            DIVIDER,
            `> ${E.warning} *Yanlış kanalda çalışan bot "yanlış kanal" hatası verirse*`,
            `> *yedek kanal seçeneğini doldur — motor otomatik oraya geçer.*`,
          ].join('\n'))
          .setFooter(FOOTER())],
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`otobump:botsec:${tokenIndex}`)
            .setPlaceholder('Bump botu seç...')
            .addOptions(botOptions),
        )],
      });
    }

    // Bot seçildi → ayar formu
    if (action === 'botsec') {
      const tokenIndex = parseInt(parts[1], 10);
      const botKey = interaction.values[0];
      const bot = BUMP_BOTS[botKey];

      const modal = new ModalBuilder()
        .setCustomId(`otobump:modal:${tokenIndex}:${botKey}`)
        .setTitle(`${bot.name} — Bump Ayarları`.slice(0, 45));

      const guildInput = new TextInputBuilder()
        .setCustomId('guild_id')
        .setLabel('Sunucu ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1561042181169479791')
        .setRequired(true);

      const channelInput = new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('Bump Kanal ID (bump komutunun çalıştığı kanal)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1570472861322186915')
        .setRequired(true);

      const fallbackInput = new TextInputBuilder()
        .setCustomId('fallback_channel')
        .setLabel('Yedek Kanal ID (opsiyonel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ana kanal çalışmazsa buraya geçer')
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
    if (fallbackChannelId && !/^\d{15,20}$/.test(fallbackChannelId)) {
      return interaction.reply({ embeds: [errorEmbed('Yedek kanal ID geçersiz — boş bırak veya 15-20 haneli sayı gir.')], ephemeral: true });
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

    return interaction.editReply({
      embeds: [createBumpStartedEmbed(interaction.user, stats, `${bot.emoji} ${bot.name}`)],
    });
  },
};