// src/commands/mcafk.js — ⛏️ Minecraft AFK Kontrol Paneli
// Kasadaki hesapların MINECRAFT AFK botlarını yönetir.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import {
  startMcAfk, stopMcAfk, stopAllMcAfk, sendMcChat,
  getMcAccounts, saveMcAccounts, getMcStats,
} from '../utils/mcAfkRunner.js';
import { COLORS, THIN_DIVIDER, BRAND, UX, section, statusLine } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('MineCraft AFK Engine');

export default {
  name: 'mcafk',
  aliases: ['mc', 'minecraft', 'mcaf'],
  description: 'REXAL — Minecraft AFK Bot Kontrol Paneli',

  async execute(message) {
    const accounts = getMcAccounts(message.author.id);
    const stats = accounts
      .map((acc, i) => ({ acc, i }))
      .filter(({ i }) => getMcStats(message.author.id, i))
      .map(({ acc, i }) => {
        const s = getMcStats(message.author.id, i);
        const icon = s.running ? '🟢' : '⚫';
        return `> ${icon} **${s.username}** — \`${acc.host}:${acc.port}\`, uptime: \`${s.uptimeMin ?? 0} dk\`, reconnect: \`${s.reconnections ?? 0}\``;
      });

    const embed = new EmbedBuilder()
      .setColor(0x8ec045)
      .setAuthor({ name: `${BRAND.name} • MineCraft AFK Engine ${BRAND.version}` })
      .setTitle('⛏️ REXAL — Minecraft AFK Kontrol Paneli')
      .setThumbnail(message.client.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription([
        UX.header,
        `*${UX.arrow} Kasadaki hesaplarını Minecraft sunucusuna AFK bot olarak bağla*`,
        UX.footerLine,
        '',
        statusLine([['🎮', 'Motor', 'Mineflayer'], ['🔄', 'Oto-Reconnect', 'Aktif'], ['🛡️', 'Anti-AFK', 'Aktif']]),
        '',
        section('Nasıl Çalışır?'),
        `> ${UX.dot2} "Bot Ekle" ile MC hesabı tanımla (sunucu + kullanıcı adı)`,
        `> ${UX.dot2} "Başlat" ile AFK botunu sunucuya sokar`,
        `> ${UX.dot2} Bot **45 saniyede bir** kol sallar — AFK kick yer`,
        `> ${UX.dot2} Koparsa **8 saniye sonra** otomatik yeniden bağlanır`,
        `> ${UX.dot2} Bot kapansa bile **Reboot Recovery** kaldığı yerden devam eder`,
        '',
        section('Kayıtlı Hesaplar'),
        accounts.length
          ? accounts.map((a, i) => `> ${i + 1}. **${a.username}** — \`${a.host}:${a.port}\` *(v${a.version || 'auto'})*`).join('\n')
          : '> ⚫ *Henüz hesap eklenmemiş*',
        '',
        section('Aktif Botlar'),
        stats.length ? stats.join('\n') : '> ⚫ *Şu anda çalışan bot yok*',
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mcafk:ekle').setLabel('Bot Ekle').setEmoji('➕').setStyle(ButtonStyle.Primary),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('mcafk:baslat').setLabel('Başlat').setEmoji('▶️').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('mcafk:durdur').setLabel('Durdur').setEmoji('🛑').setStyle(ButtonStyle.Danger),
        ),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mcafk:konsol').setLabel('Komut Gönder').setEmoji('💬').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mcafk:hepsini-kapat').setLabel('Tümünü Kapat').setEmoji('💀').setStyle(ButtonStyle.Danger),
      ),
    ];

    await message.reply({ embeds: [embed], components: rows });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'ekle') {
      const modal = new ModalBuilder().setCustomId('mcafk:ekle').setTitle('Minecraft Bot Ekle');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('host').setLabel('Sunucu Adresi').setStyle(TextInputStyle.Short)
            .setPlaceholder('mc.sunucum.com').setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('port').setLabel('Port (varsayılan 25565)').setStyle(TextInputStyle.Short)
            .setPlaceholder('25565').setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('username').setLabel('MC Kullanıcı Adı').setStyle(TextInputStyle.Short)
            .setPlaceholder('SteavJobs').setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('version').setLabel('MC Sürümü (boş = otomatik)').setStyle(TextInputStyle.Short)
            .setPlaceholder('1.20.4').setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('authmode').setLabel('Yetki Tipi (offline/microsoft)').setStyle(TextInputStyle.Short)
            .setPlaceholder('offline').setValue('offline').setRequired(false),
        ),
      );
      return interaction.showModal(modal);
    }

    if (action === 'baslat') {
      const accounts = getMcAccounts(userId);
      if (!accounts.length) {
        return interaction.reply({ content: '❌ Kayıtlı MC hesabı yok! Önce **Bot Ekle** ile hesap tanımla.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const results = [];
      for (let i = 0; i < accounts.length; i++) {
        const a = accounts[i];
        const res = await startMcAfk(userId, i, a);
        results.push(res.success
          ? `> ✅ **${a.username}** → \`${a.host}:${a.port}\` başlatıldı`
          : `> ❌ **${a.username}** — \`${res.error}\``);
      }
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('⛏️ Minecraft Bot Başlatma Raporu')
          .setColor(COLORS.success)
          .setDescription([`\`${THIN_DIVIDER}\``, ...results, `\`${THIN_DIVIDER}\``].join('\n'))
          .setFooter(FOOTER()).setTimestamp()],
      });
    }

    if (action === 'durdur') {
      const accounts = getMcAccounts(userId);
      let stopped = 0;
      accounts.forEach((_, i) => {
        if (stopMcAfk(userId, i, { silent: true }).success) stopped++;
      });
      return interaction.reply({ content: `🛑 **${stopped}** Minecraft botu durduruldu.`, ephemeral: true });
    }

    if (action === 'hepsini-kapat' || action === 'hepsini_kapat') {
      const stopped = stopAllMcAfk(userId);
      return interaction.reply({ content: `💀 Tüm Minecraft botları kapatıldı (**${stopped}** adet).`, ephemeral: true });
    }

    if (action === 'konsol') {
      const accounts = getMcAccounts(userId);
      if (!accounts.length) {
        return interaction.reply({ content: '❌ Kayıtlı MC hesabı yok!', ephemeral: true });
      }
      const modal = new ModalBuilder().setCustomId('mcafk:konsol').setTitle('MC Konsol — Komut Gönder');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('index').setLabel(`Hesap No (1-${accounts.length})`).setStyle(TextInputStyle.Short)
            .setPlaceholder('1').setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('komut').setLabel('Komut / Mesaj').setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('/spawn veya merhaba').setRequired(true),
        ),
      );
      return interaction.showModal(modal);
    }
  },

  async onModalSubmit(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'ekle') {
      const host = interaction.fields.getTextInputValue('host').trim();
      const port = interaction.fields.getTextInputValue('port').trim() || '25565';
      const username = interaction.fields.getTextInputValue('username').trim();
      const version = interaction.fields.getTextInputValue('version').trim();
      const authMode = (interaction.fields.getTextInputValue('authmode').trim() || 'offline').toLowerCase();

      const accounts = getMcAccounts(userId);
      accounts.push({ host, port, username, version, authMode });
      saveMcAccounts(userId, accounts);

      return interaction.reply({
        content: `✅ **${username}** → \`${host}:${port}\` kaydedildi! **Başlat** ile çalıştır.`,
        ephemeral: true,
      });
    }

    if (action === 'konsol') {
      const index = Math.max(0, parseInt(interaction.fields.getTextInputValue('index'), 10) - 1);
      const komut = interaction.fields.getTextInputValue('komut').trim();
      const accounts = getMcAccounts(userId);
      if (!accounts[index]) return interaction.reply({ content: '❌ Geçersiz hesap numarası.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      const res = sendMcChat(userId, index, komut);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('💬 MC Konsol')
          .setColor(res.success ? COLORS.success : COLORS.danger)
          .setDescription(`> **${accounts[index].username}** ➜ \`${komut}\`\n${res.success ? '✅ Gönderildi' : `❌ ${res.error}`}`)
          .setFooter(FOOTER()).setTimestamp()],
      });
    }
  },
};
