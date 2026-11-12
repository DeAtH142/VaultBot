// src/commands/mcafk.js — ⛏️ Minecraft AFK Kontrol Paneli (v2 — Per-Account)
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import {
  startMcAfk, stopMcAfk, stopAllMcAfk, sendMcChat,
  getMcAccounts, saveMcAccounts, getMcStats,
} from '../utils/mcAfkRunner.js';
import { COLORS, THIN_DIVIDER, BRAND, UX, section, statusLine, errorEmbed } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('MineCraft AFK Engine');

function statsFor(userId, i) {
  try { return getMcStats(userId, i); } catch { return null; }
}
function isRunning(userId, i) {
  return !!statsFor(userId, i)?.running;
}

export default {
  name: 'mcafk',
  aliases: ['mc', 'minecraft', 'mcaf'],
  description: 'REXAL — Minecraft AFK Bot Kontrol Paneli',

  async execute(message) {
    const userId = message.author.id;
    const accounts = getMcAccounts(userId);

    const activeLines = accounts
      .map((acc, i) => ({ acc, i }))
      .filter(({ i }) => isRunning(userId, i))
      .map(({ acc, i }) => {
        const s = statsFor(userId, i);
        return `> 🟢 **${s.username}** — \`${acc.host}:${acc.port}\`, uptime: \`${s.uptimeMin ?? 0} dk\`, reconnect: \`${s.reconnections ?? 0}\``;
      });

    const embed = new EmbedBuilder()
      .setColor(0x8ec045)
      .setAuthor({ name: `${BRAND.name} • MineCraft AFK Engine ${BRAND.version}` })
      .setTitle('⛏️ REXAL — Minecraft AFK Kontrol Paneli')
      .setThumbnail(message.client.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription([
        UX.header,
        `*${UX.arrow} Herkes kendi MC hesaplarını yönetir — panel paylaşımlı, kontrol kişisel*`,
        UX.footerLine,
        '',
        statusLine([['🎮', 'Motor', 'Mineflayer'], ['🔄', 'Oto-Reconnect', 'Aktif'], ['🛡️', 'Anti-AFK', 'Aktif']]),
        '',
        section('Nasıl Çalışır?'),
        `> ${UX.dot2} ➕ **Bot Ekle** ile MC hesabı tanımla (sunucu + kullanıcı adı)`,
        `> ${UX.dot2} ▶️ **Başlat** ile menüden hesap seç, sadece o hesap AFK'a girer`,
        `> ${UX.dot2} 🛑 **Durdur** ile menüden hesap seç, sadece o durur`,
        `> ${UX.dot2} Bot **45 saniyede bir** kol sallar — AFK kick yemez`,
        `> ${UX.dot2} Koparsa **8 saniye sonra** otomatik yeniden bağlanır`,
        '',
        section('Kayıtlı Hesaplar'),
        accounts.length
          ? accounts.map((a, i) => `> ${i + 1}. **${a.username}** — \`${a.host}:${a.port}\` *(v${a.version || 'auto'})*`).join('\n')
          : '> ⚫ *Henüz hesap eklenmemiş*',
        '',
        section('Aktif Botlar'),
        activeLines.length ? activeLines.join('\n') : '> ⚫ *Şu anda çalışan bot yok*',
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    // ✅ FIX: Artık nested ActionRow YOK — düzgün satırlar
    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mcafk:ekle').setLabel('Bot Ekle').setEmoji('➕').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mcafk:baslat').setLabel('Başlat').setEmoji('▶️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('mcafk:durdur').setLabel('Durdur').setEmoji('🛑').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('mcafk:konsol').setLabel('Konsol').setEmoji('💬').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mcafk:rapor').setLabel('Durum Raporu').setEmoji('📊').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mcafk:sil').setLabel('Hesap Sil').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('mcafk:hepsini-kapat').setLabel('Tümünü Kapat').setEmoji('💀').setStyle(ButtonStyle.Secondary),
      ),
    ];

    await message.reply({ embeds: [embed], components: rows });
  },

  // ══════════════════════════════════════════════════════════════════
  // BUTONLAR
  // ══════════════════════════════════════════════════════════════════
  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;
    const accounts = getMcAccounts(userId);

    // ➕ BOT EKLE — modal
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

    // ▶️ BAŞLAT — hesap seçimi menüsü
    if (action === 'baslat') {
      if (!accounts.length) {
        return interaction.reply({ content: '❌ Kayıtlı MC hesabı yok! Önce **Bot Ekle** ile hesap tanımla.', ephemeral: true });
      }
      const options = accounts.map((a, i) => {
        const running = isRunning(userId, i);
        return {
          label: `${i + 1}. ${a.username}`.slice(0, 100),
          description: (running ? '✅ Zaten çalışıyor' : `${a.host}:${a.port}`).slice(0, 100),
          value: String(i),
          emoji: running ? '🟢' : '💤',
        };
      });
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mcafk:baslatsec')
          .setPlaceholder('Başlatılacak hesabı seç...')
          .addOptions(options),
      );
      return interaction.reply({
        content: '▶️ **Başlatmak istediğin hesabı seç:**',
        components: [row],
        ephemeral: true,
      });
    }

    // 🛑 DURDUR — hesap seçimi menüsü (sadece çalışanlar)
    if (action === 'durdur') {
      const running = accounts
        .map((a, i) => ({ a, i }))
        .filter(({ i }) => isRunning(userId, i));

      if (!running.length) {
        return interaction.reply({ content: '📭 Şu anda çalışan Minecraft botu yok.', ephemeral: true });
      }

      const options = running.map(({ a, i }) => ({
        label: `${i + 1}. ${a.username}`.slice(0, 100),
        description: `🟢 Çalışıyor — ${a.host}:${a.port}`.slice(0, 100),
        value: String(i),
        emoji: '🛑',
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mcafk:durdursec')
          .setPlaceholder('Durdurulacak hesabı seç...')
          .addOptions(options),
      );
      return interaction.reply({
        content: '🛑 **Durdurmak istediğin hesabı seç:**',
        components: [row],
        ephemeral: true,
      });
    }

    // 🗑️ HESAP SİL — menü
    if (action === 'sil') {
      if (!accounts.length) {
        return interaction.reply({ content: '❌ Silinecek hesap yok.', ephemeral: true });
      }
      const options = accounts.map((a, i) => {
        const running = isRunning(userId, i);
        return {
          label: `${i + 1}. ${a.username}`.slice(0, 100),
          description: `${running ? '🟢 Çalışıyor | ' : ''}${a.host}:${a.port}`.slice(0, 100),
          value: String(i),
          emoji: '🗑️',
        };
      });
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mcafk:silsec')
          .setPlaceholder('Silinecek hesabı seç...')
          .addOptions(options),
      );
      return interaction.reply({
        content: '🗑️ **Silmek istediğin hesabı seç** (çalışıyorsa önce durdurulur):',
        components: [row],
        ephemeral: true,
      });
    }

    // 💬 KONSOL — hesap seçimi → modal
    if (action === 'konsol') {
      if (!accounts.length) {
        return interaction.reply({ content: '❌ Kayıtlı MC hesabı yok!', ephemeral: true });
      }
      const options = accounts.map((a, i) => {
        const running = isRunning(userId, i);
        return {
          label: `${i + 1}. ${a.username}`.slice(0, 100),
          description: `${running ? '🟢 Çalışıyor' : '⚫ Çevrimdışı'} — ${a.host}`.slice(0, 100),
          value: String(i),
          emoji: '💬',
        };
      });
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mcafk:konsolsec')
          .setPlaceholder('Komut gönderilecek hesabı seç...')
          .addOptions(options),
      );
      return interaction.reply({
        content: '💬 **Komut göndermek istediğin hesabı seç:**',
        components: [row],
        ephemeral: true,
      });
    }

    // 📊 DURUM RAPORU
    if (action === 'rapor') {
      if (!accounts.length) {
        return interaction.reply({ content: '📭 Henüz hesap yok.', ephemeral: true });
      }
      const lines = accounts.map((a, i) => {
        const s = statsFor(userId, i);
        if (s?.running) {
          return [
            `> 🟢 **${a.username}** — \`${a.host}:${a.port}\``,
            `> ⏱️ Uptime: \`${s.uptimeMin ?? 0} dk\` | 🔁 Reconnect: \`${s.reconnections ?? 0}\``,
          ].join('\n');
        }
        return `> ⚫ **${a.username}** — \`${a.host}:${a.port}\` *(çevrimdışı)*`;
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('📊 Minecraft AFK Durum Raporu')
        .setColor(COLORS.vault ?? 0x5865f2)
        .setDescription(lines)
        .setFooter(FOOTER())
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 💀 TÜMÜNÜ KAPAT — sadece bu kullanıcı
    if (action === 'hepsini-kapat' || action === 'hepsini_kapat') {
      const stopped = stopAllMcAfk(userId);
      return interaction.reply({
        content: [
          `💀 **${stopped}** Minecraft botu kapatıldı.`,
          `> 🔒 Diğer kullanıcılara dokunulmadı.`,
        ].join('\n'),
        ephemeral: true,
      });
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // MENÜ SEÇİMLERİ
  // ══════════════════════════════════════════════════════════════════
  async onSelect(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;
    const accounts = getMcAccounts(userId);

    // ▶️ Başlatma seçimi
    if (action === 'baslatsec') {
      const idx = parseInt(interaction.values[0], 10);
      const acc = accounts[idx];
      if (!acc) {
        return interaction.update({ content: '❌ Geçersiz hesap.', components: [] });
      }
      if (isRunning(userId, idx)) {
        return interaction.update({ content: `⚠️ **${acc.username}** zaten çalışıyor.`, components: [] });
      }

      await interaction.deferReply({ ephemeral: true });
      const res = await startMcAfk(userId, idx, acc);
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle(res.success ? '⛏️ Bot Başlatıldı' : '❌ Başlatılamadı')
          .setColor(res.success ? (COLORS.success ?? 0x2ecc71) : (COLORS.danger ?? 0xed4245))
          .setDescription(res.success
            ? `> ✅ **${acc.username}** → \`${acc.host}:${acc.port}\` bağlandı`
            : `> ❌ **${acc.username}** — \`${res.error}\``)
          .setFooter(FOOTER()).setTimestamp()],
      });
    }

    // 🛑 Durdurma seçimi
    if (action === 'durdursec') {
      const idx = parseInt(interaction.values[0], 10);
      const acc = accounts[idx];
      if (!acc) {
        return interaction.update({ content: '❌ Geçersiz hesap.', components: [] });
      }
      const res = stopMcAfk(userId, idx, { silent: false });
      return interaction.update({
        content: res.success
          ? `🛑 **${acc.username}** durduruldu.`
          : `⚠️ **${acc.username}** durdurulamadı: \`${res.error ?? 'bilinmeyen'}\``,
        components: [],
      });
    }

    // 🗑️ Silme seçimi
    if (action === 'silsec') {
      const idx = parseInt(interaction.values[0], 10);
      const acc = accounts[idx];
      if (!acc) {
        return interaction.update({ content: '❌ Geçersiz hesap.', components: [] });
      }

      // Çalışıyorsa önce durdur
      if (isRunning(userId, idx)) {
        try { stopMcAfk(userId, idx, { silent: true }); } catch {}
      }
      // Diziden çıkar ve kaydet
      const updated = accounts.filter((_, i) => i !== idx);
      saveMcAccounts(userId, updated);

      return interaction.update({
        content: `🗑️ **${acc.username}** (\`${acc.host}:${acc.port}\`) silindi${isRunning(userId, idx) ? ' ve durduruldu' : ''}.`,
        components: [],
      });
    }

    // 💬 Konsol seçimi → modal aç
    if (action === 'konsolsec') {
      const idx = parseInt(interaction.values[0], 10);
      const acc = accounts[idx];
      if (!acc) {
        return interaction.update({ content: '❌ Geçersiz hesap.', components: [] });
      }

      const modal = new ModalBuilder()
        .setCustomId(`mcafk:konsolmodal:${idx}`)
        .setTitle(`Konsol — ${acc.username}`.slice(0, 45));

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('komut')
            .setLabel('Komut / Mesaj')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('/spawn veya merhaba')
            .setRequired(true),
        ),
      );
      return interaction.showModal(modal);
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // MODAL YANITLARI
  // ══════════════════════════════════════════════════════════════════
  async onModalSubmit(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    // ➕ Bot ekleme
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

    // 💬 Konsol komut gönderme
    if (action === 'konsolmodal') {
      const idx = parseInt(parts[1], 10);
      const komut = interaction.fields.getTextInputValue('komut').trim();
      const accounts = getMcAccounts(userId);
      const acc = accounts[idx];
      if (!acc) {
        return interaction.reply({ content: '❌ Geçersiz hesap.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const res = sendMcChat(userId, idx, komut);

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('💬 MC Konsol')
          .setColor(res.success ? (COLORS.success ?? 0x2ecc71) : (COLORS.danger ?? 0xed4245))
          .setDescription(`> **${acc.username}** ➜ \`${komut}\`\n${res.success ? '✅ Gönderildi' : `❌ ${res.error}`}`)
          .setFooter(FOOTER()).setTimestamp()],
      });
    }
  },
};
