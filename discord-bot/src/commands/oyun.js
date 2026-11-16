// src/commands/oyun.js — 🎮 REXAL Oyun Fake Presence Kontrol Paneli
import { selfbotDenyEmbed } from '../utils/accessGuard.js';
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  isOyunRunning, getOyunStats, listRunningOyun,
  startOyunPresence, stopOyunPresence, stopAllOyun
} from '../utils/oyunPresenceRunner.js';
import { COLORS, THIN_DIVIDER, BRAND, E } from '../utils/embeds.js';
import { markStart, markStop } from '../utils/playtimeHooks.js';

const FOOTER = () => BRAND.footer('Game Presence Engine v2.0');
const MAX_SELECT_OPTIONS = 25;

export default {
  name: 'oyun',
  aliases: ['game', 'oynuyor', 'oyunoyna'],
  description: 'REXAL — Gelişmiş Oyun Fake Presence Kontrol Paneli',

  async execute(message) {
    const _deny = selfbotDenyEmbed(message.author.id, '!oyun');
    if (_deny) return message.reply({ embeds: [_deny] });
    
    const running = listRunningOyun(message.author.id);
    const stats = running.map((s) => {
      const st = getOyunStats(message.author.id, s.tokenIndex);
      return `> 🎮 **${st.username || `Hesap #${s.tokenIndex + 1}`}** — **${st.gameName}**\n> ↳ *${st.details || 'Detay Yok'}* | ${st.playerState || 'Durum Yok'} (⏱️ \`${st.durationMin} dk\`)`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31) // Discord koyu tema rengi
      .setAuthor({ name: `${BRAND.name} • Oyun Oynuyor Gösterme Sistemi`, iconURL: message.client.user.displayAvatarURL() })
      .setTitle('🎮 REXAL — Fake Game Presence')
      .setThumbnail(message.client.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription([
        `\`${THIN_DIVIDER}\``,
        `> 🤖 **Sistem:** Kasadaki hesaplarınız üzerinden profilinizi 7/24 oyun oynuyor gibi gösterir.`,
        `> 🖼️ **Görsellik:** Oyun kapak resmi, detaylar, oyuncu sayısı ve süre sayacı tamamen özelleştirilebilir.`,
        `> ♻️ **Kurtarma:** Bot çökse veya yeniden başlasa bile sistem otomatik kaldığı yerden devam eder.`,
        '',
        `**📜 NASIL KULLANILIR?**`,
        `> 1️⃣ Aşağıdaki **Başlat** butonuna tıklayın.`,
        `> 2️⃣ Hangi kasadaki hesapta oyun göstermek istediğinizi seçin.`,
        `> 3️⃣ Açılan forma oyun bilgilerini girin.`,
        '',
        `\`${THIN_DIVIDER}\``,
        `**🟢 AKTİF OTURUMLAR**`,
        stats.length ? stats.join('\n') : '> ⚫ *Şu anda aktif oyun presence yok*',
      ].join('\n'))
      .setFooter({ text: FOOTER() })
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('oyun:baslat').setLabel('Oyun Başlat').setEmoji('🎮').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('oyun:durdur').setLabel('Durdur').setEmoji('🛑').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('oyun:durum').setLabel('İstatistikler').setEmoji('📊').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('oyun:hepsini-kapat').setLabel('Tümünü Kapat').setEmoji('💀').setStyle(ButtonStyle.Secondary),
      ),
    ];

    await message.reply({ embeds: [embed], components: rows });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'baslat') {
      const tokens = getTokens(userId);
      if (tokens.length === 0) {
        return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', flags: MessageFlags.Ephemeral });
      }
      
      return interaction.reply({
        content: '🎮 **Hangi hesabınızda oyun oynuyor görüneceksiniz?**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('oyun:hesapsec')
            .addOptions(tokens.slice(0, MAX_SELECT_OPTIONS).map((t, i) => ({
              label: `${i + 1}. ${t.username || t.label || `Hesap ${i + 1}`}`.slice(0, 100),
              value: String(i),
              description: isOyunRunning(userId, i) ? '⚡ Şu an oyun oynuyor' : '⭕ Hazır',
              emoji: isOyunRunning(userId, i) ? '🎮' : '⚪',
            })))
            .setPlaceholder('🔍 Hesap seç...'),
        )], flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'durdur') {
      const running = listRunningOyun(userId);
      if (running.length === 0) {
        return interaction.reply({ content: '⚫ Aktif oyun presence yok.', flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({
        content: '🛑 **Hangi oturumu kapatmak istersiniz?**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('oyun:durdursec')
            .addOptions(running.map(s => ({
              label: `Hesap #${s.tokenIndex + 1} — ${s.gameData.gameName}`,
              value: String(s.tokenIndex), emoji: '🛑',
            })))
            .setPlaceholder('🔍 Oturum seç...'),
        )], flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'hepsini-kapat') {
      const running = listRunningOyun(userId);
      const n = stopAllOyun(userId);
      for (const s of running) markStop(userId, 'oyun', s.tokenIndex);
      return interaction.reply({ content: `💀 Tüm oyun presence'ları kapatıldı (**${n}** adet).`, flags: MessageFlags.Ephemeral });
    }

    if (action === 'durum') {
      const running = listRunningOyun(userId);
      if (running.length === 0) return interaction.reply({ content: '⚫ Aktif oturum yok.', flags: MessageFlags.Ephemeral });
      
      const lines = running.map((s) => {
        const st = getOyunStats(userId, s.tokenIndex);
        return [
          `> 🎮 **Hesap #${s.tokenIndex + 1}** — **${st.gameName}**`,
          `> ↳ *${st.details || 'Yok'}* | ${st.playerState || 'Yok'}`,
          `> ⏱️ **Süre:** ${st.durationMin} dakikadır oynuyor`,
        ].join('\n');
      });
      
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('📊 Oyun Presence Detayları')
          .setColor(0x2b2d31)
          .setDescription([`\`${THIN_DIVIDER}\``, ...lines, `\`${THIN_DIVIDER}\``].join('\n'))
          .setFooter({ text: FOOTER() }).setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }
  },

  async onSelect(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'hesapsec') {
      const idx = Number(interaction.values[0]);
      const modal = new ModalBuilder().setCustomId(`oyun:arama:${idx}`).setTitle('🎮 Oyun Bilgilerini Girin');
      
      const gameInput = new TextInputBuilder()
        .setCustomId('oyunadi').setLabel('Oyun Adı (Zorunlu)')
        .setPlaceholder('Örn: Grand Theft Auto VI, Valorant, Minecraft')
        .setStyle(TextInputStyle.Short).setRequired(true);

      const detailInput = new TextInputBuilder()
        .setCustomId('detay').setLabel('Detay (Opsiyonel - Üst Satır)')
        .setPlaceholder('Örn: Ranked Match, Hikaye Modu, 3. Bölüm')
        .setStyle(TextInputStyle.Short).setRequired(false);

      const stateInput = new TextInputBuilder()
        .setCustomId('durum').setLabel('Durum (Opsiyonel - Alt Satır)')
        .setPlaceholder('Örn: 1/5 Oyuncu, Level 10, Chasing')
        .setStyle(TextInputStyle.Short).setRequired(false);

      const imageInput = new TextInputBuilder()
        .setCustomId('resim').setLabel('Kapak Resmi URL (Opsiyonel)')
        .setPlaceholder('Oyunun kapağının resim linki (png/jpg)')
        .setStyle(TextInputStyle.Short).setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(gameInput),
        new ActionRowBuilder().addComponents(detailInput),
        new ActionRowBuilder().addComponents(stateInput),
        new ActionRowBuilder().addComponents(imageInput),
      );
      return interaction.showModal(modal);
    }

    if (action === 'durdursec') {
      const idx = Number(interaction.values[0]);
      const ok = stopOyunPresence(userId, idx);
      if (ok) markStop(userId, 'oyun', idx);
      return interaction.update({
        content: ok ? `🛑 Hesap #${idx + 1} oyun presence kapatıldı.` : '❌ Oturum bulunamadı.',
        components: [],
      });
    }
  },

  async onModalSubmit(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action !== 'arama') return;
    const idx = Number(parts[1]);
    
    const gameName = interaction.fields.getTextInputValue('oyunadi').trim();
    const details = interaction.fields.getTextInputValue('detay').trim() || null;
    const playerState = interaction.fields.getTextInputValue('durum').trim() || null;
    const imageUrl = interaction.fields.getTextInputValue('resim').trim() || null;

    if (!gameName) return interaction.reply({ content: '❌ Oyun adı boş olamaz!', flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameData = { gameName, details, playerState, imageUrl };
    const res = await startOyunPresence(userId, idx, gameData, { statusChoice: 'online' });
    
    if (res.success) markStart(userId, 'oyun', idx);

    const embed = new EmbedBuilder()
      .setTitle(res.success ? '✅ Oyun Presence Başlatıldı!' : '❌ Başlatılamadı')
      .setColor(res.success ? 0x2b2d31 : COLORS.danger)
      .setThumbnail(imageUrl || null)
      .setDescription(res.success
        ? [
          `> 🎮 **${gameName}** başarıyla başlatıldı.`,
          `> 📝 **Detay:** ${details || 'Yok'}`,
          `> 👥 **Durum:** ${playerState || 'Yok'}`,
          '',
          `> ✅ **${res.username ?? 'Hesap'}** artık bu oyunu oynuyor görünüyor.`,
          '> ♻️ Bot yeniden başlasa bile otomatik devam eder.',
        ].join('\n')
        : `> ⚠️ Hata: \`${res.error}\``)
      .setFooter({ text: FOOTER() }).setTimestamp();
      
    return interaction.editReply({ embeds: [embed], components: [] });
  },
};
