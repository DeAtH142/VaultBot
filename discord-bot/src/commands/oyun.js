// src/commands/oyun.js — 🎮 REXAL Oyun Fake Presence (Herkese Açık Panel)
import { selfbotDenyEmbed } from '../utils/accessGuard.js';
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, MessageFlags
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  isOyunRunning, getOyunStats, listRunningOyun,
  startOyunPresence, stopOyunPresence, stopAllOyun
} from '../utils/oyunPresenceRunner.js';
import { COLORS, THIN_DIVIDER, BRAND, E } from '../utils/embeds.js';
import { markStart, markStop } from '../utils/playtimeHooks.js';
import { searchGame } from '../utils/oyunPresenceRunner.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';

const FOOTER = () => BRAND.footer('Game Presence Engine');

// 🚨 OYUN LİSTESİ 🚨
// Buraya istediğin oyunları ekleyebilirsin. assetKey, Discord Developer Portal'daki isimle aynı olmalı.
const GAME_LIST = [
  { name: 'Grand Theft Auto VI', assetKey: 'gta6' },
  { name: 'Grand Theft Auto V', assetKey: 'gta5' },
  { name: 'Valorant', assetKey: 'valorant' },
  { name: 'Counter-Strike 2', assetKey: 'cs2' },
  { name: 'League of Legends', assetKey: 'lol' },
  { name: 'Minecraft', assetKey: 'minecraft' },
  { name: 'Roblox', assetKey: 'roblox' },
  { name: 'Fortnite', assetKey: 'fortnite' },
  { name: 'PUBG', assetKey: 'pubg' },
  { name: 'Among Us', assetKey: 'amongus' },
  { name: 'Apex Legends', assetKey: 'apex' },
  { name: 'Dota 2', assetKey: 'dota2' },
  { name: 'Overwatch 2', assetKey: 'overwatch' },
  { name: 'Sea of Thieves', assetKey: 'seaofthieves' },
];

const ITEMS_PER_PAGE = 20;

export default {
  name: 'oyun',
  aliases: ['game', 'oynuyor'],
  description: 'REXAL — Herkese Açık Oyun Fake Presence Sistemi',

  async execute(message) {
    // Yetki kontrolü (İsteğe bağlı: Burayı silersen herkes !oyun yazıp panel atabilir)
    const _deny = selfbotDenyEmbed(message.author.id, '!oyun');
    if (_deny) return message.reply({ embeds: [_deny] });
    
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: `${BRAND.name} • Oyun Oynuyor Gösterme Sistemi`, iconURL: message.client.user.displayAvatarURL() })
      .setTitle('🎮 REXAL — Fake Game Presence Paneli')
      .setThumbnail(message.client.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription([
        `\`${THIN_DIVIDER}\``,
        `> 🤖 **Sistem:** Hazır oyun listesinden seçim yapın, profiliniz anında güncellensin!`,
        `> 🔒 **Gizlilik:** Bu panel herkese açıktır, butonlara basan herkes sadece kendi kasasındaki hesapları görür.`,
        '',
        `**📜 NASIL KULLANILIR?**`,
        `> 1️⃣ Aşağıdaki **Oyun Menüsünü Aç** butonuna tıklayın.`,
        `> 2️⃣ Karşınıza çıkan menüden kendi hesabınızı seçin.`,
        `> 3️⃣ Sayfalar arası gezinerek istediğiniz oyunu bulun ve seçin.`,
        `> 4️⃣ Profiliniz anında o oyunu oynuyor olarak güncellenecek!`,
        '',
        `\`${THIN_DIVIDER}\``,
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('oyun:baslat').setLabel('Oyun Menüsünü Aç').setEmoji('🎮').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('oyun:ara').setLabel('Oyun Ara (GTA 6, Valorant...)').setEmoji('🔍').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('oyun:durdur').setLabel('Kendi Oyununu Durdur').setEmoji('🛑').setStyle(ButtonStyle.Danger),
      ),
    ];

    // Paneli sunucuya atar
    await message.reply({ embeds: [embed], components: rows });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id; // Butona basan kişinin ID'si

    if (action === 'baslat') {
      const tokens = getTokens(userId);
      if (tokens.length === 0) {
        return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', flags: MessageFlags.Ephemeral });
      }
      
      return interaction.reply({
        content: '🎮 **Hangi hesabınızda oyun oynuyor görüneceksiniz?**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('oyun:hesapsec')
            .addOptions(tokens.slice(0, 25).map((t, i) => ({
              label: `${i + 1}. ${t.username || t.label || `Hesap ${i + 1}`}`.slice(0, 100),
              value: String(i),
              description: isOyunRunning(userId, i) ? '⚡ Şu an oyun oynuyor' : '⭕ Hazır',
              emoji: isOyunRunning(userId, i) ? '🎮' : '⚪',
            })))
            .setPlaceholder('🔍 Hesap seç...'),
        )], flags: MessageFlags.Ephemeral,
      });
    }

    // 🔍 Oyun arama modalı aç
    if (action === 'ara') {
      const tokens = getTokens(userId);
      if (tokens.length === 0) {
        return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', flags: MessageFlags.Ephemeral });
      }
      const modal = new ModalBuilder()
        .setCustomId('oyun:aramodal')
        .setTitle('Oyun Ara')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('hesap_idx').setLabel('Hesap numarası (1, 2, 3...)')
              .setStyle(TextInputStyle.Short).setPlaceholder('1').setRequired(true).setMaxLength(3)),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('game_query').setLabel('Oyun adı')
              .setStyle(TextInputStyle.Short).setPlaceholder('Grand Theft Auto VI').setRequired(true).setMaxLength(60)),
        );
      return interaction.showModal(modal);
    }

    if (action === 'durdur') {
      const running = listRunningOyun(userId);
      if (running.length === 0) return interaction.reply({ content: '⚫ Aktif oyun presence yok.', flags: MessageFlags.Ephemeral });
      
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

    // Sayfa değiştirme butonları
    if (action === 'sayfa') {
      const page = Number(parts[1]);
      const idx = Number(parts[2]);
      
      const start = (page - 1) * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const pageGames = GAME_LIST.slice(start, end);
      const totalPages = Math.ceil(GAME_LIST.length / ITEMS_PER_PAGE);

      const options = pageGames.map((g, i) => ({
        label: g.name.slice(0, 100),
        value: `${start + i}`, 
        emoji: '🎮',
      }));

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`oyun:oyunsec:${idx}`)
          .addOptions(options)
          .setPlaceholder(`Sayfa ${page}/${totalPages} — Oyun Seç...`)
      );

      const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`oyun:sayfa:${page - 1}:${idx}`).setLabel('⬅️ Önceki').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
        new ButtonBuilder().setCustomId(`oyun:sayfa:${page + 1}:${idx}`).setLabel('Sonraki ➡️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages),
      );

      return interaction.update({
        content: `🎮 **Hesap #${idx + 1}** için oyun seçin:`,
        components: [selectRow, btnRow]
      });
    }
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'aramodal') return;
    const userId = interaction.user.id;
    try {
      const idx = Number(interaction.fields.getTextInputValue('hesap_idx').trim()) - 1;
      const query = interaction.fields.getTextInputValue('game_query').trim();
      const tokens = getTokens(userId);
      if (isNaN(idx) || idx < 0 || idx >= tokens.length) {
        return interaction.reply({ content: '❌ Geçersiz hesap numarası — kasada ' + tokens.length + ' hesap var.', flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // 🌐 Gerçek oyun arama: NEXARDA (free) → Steam fallback
      const results = await searchGame(query);
      if (results.length === 0) {
        return interaction.editReply({ content: `❌ "${query}" için sonuç bulunamadı. Tam adını yazmayı dene.` });
      }

      const options = results.slice(0, 25).map((g, i) => ({
        label: g.name.slice(0, 100),
        description: '🎮 Bu oyunu profilinde göster',
        value: String(i),
        emoji: '🎮',
      }));

      // Arama sonucu + seçim menüsü — seçilince arama sonuç cache'i gerekli
      globalThis.__oyunAramaCache = globalThis.__oyunAramaCache || new Map();
      globalThis.__oyunAramaCache.set(`${userId}:${idx}`, results);
      // 10 dk sonra temizle
      setTimeout(() => globalThis.__oyunAramaCache?.delete(`${userId}:${idx}`), 10 * 60 * 1000);

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`oyun:arasec:${idx}`)
          .addOptions(options).setPlaceholder('🔍 Bulunan oyundan birini seç...')
      );

      return interaction.editReply({
        content: `🔍 **"${query}"** için ${results.length} sonuç bulundu — hesap #${idx + 1} için birini seç:`,
        components: [selectRow],
      });
    } catch (err) {
      console.error('🎮 Oyun arama modal hatası:', err);
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ content: '❌ Arama sırasında hata oluştu.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  },

  async onSelect(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'hesapsec') {
      const idx = Number(interaction.values[0]);
      const page = 1;
      const start = (page - 1) * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const pageGames = GAME_LIST.slice(start, end);
      const totalPages = Math.ceil(GAME_LIST.length / ITEMS_PER_PAGE);

      const options = pageGames.map((g, i) => ({
        label: g.name.slice(0, 100),
        value: `${start + i}`,
        emoji: '🎮',
      }));

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`oyun:oyunsec:${idx}`)
          .addOptions(options)
          .setPlaceholder(`Sayfa 1/${totalPages} — Oyun Seç...`)
      );

      const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`oyun:sayfa:${page - 1}:${idx}`).setLabel('⬅️ Önceki').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
        new ButtonBuilder().setCustomId(`oyun:sayfa:${page + 1}:${idx}`).setLabel('Sonraki ➡️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages),
      );

      return interaction.update({
        content: `🎮 **Hesap #${idx + 1}** için oyun seçin:`,
        components: [selectRow, btnRow]
      });
    }

    if (action === 'oyunsec') {
      const idx = Number(parts[1]);
      const globalIndex = Number(interaction.values[0]);
      const game = GAME_LIST[globalIndex];

      await interaction.deferUpdate();

      const res = await startOyunPresence(userId, idx, { 
        gameName: game.name, 
        details: null, 
        playerState: null,
        imageUrl: game.coverUrl || null,
        assetKey: game.assetKey || null,
      }, { statusChoice: 'online' });
      
      if (res.success) markStart(userId, 'oyun', idx);

      const embed = new EmbedBuilder()
        .setTitle(res.success ? '🎮 Oyun Presence Aktif!' : '❌ Başlatılamadı')
        .setColor(res.success ? 0x2b2d31 : COLORS.danger)
        .setDescription(res.success
          ? [
            `> 🎮 **${game.name}**`,
            `> ✅ **${res.username ?? 'Hesap'}** profilinde artık bu oyunu oynuyor görünüyorsun.`,
            '> ♻️ Bot yeniden başlasa bile otomatik devam eder.',
          ].join('\n')
          : `> ⚠️ Hata: \`${res.error}\``)
        .setFooter(FOOTER())
        .setTimestamp();
        
      return interaction.editReply({ content: null, embeds: [embed], components: [] });
    }

    // 🔍 Arama sonucu seçildi → gerçek kapak resmiyle başlat
    if (action === 'arasec') {
      const idx = Number(parts[1]);
      const cache = globalThis.__oyunAramaCache;
      const results = cache?.get(`${userId}:${idx}`);
      if (!results) return interaction.update({ content: '❌ Arama sonuçları süresi doldu — tekrar arayın.', components: [] });

      const game = results[Number(interaction.values[0])];
      if (!game) return interaction.update({ content: '❌ Oyun bulunamadı.', components: [] });

      await interaction.deferUpdate();

      const res = await startOyunPresence(userId, idx, {
        gameName: game.name,
        details: null,
        playerState: null,
        imageUrl: game.coverUrl || null, // 🖼 gerçek oyun logosu (Discord free external API ile)
      }, { statusChoice: 'online' });

      if (res.success) markStart(userId, 'oyun', idx);
      cache?.delete(`${userId}:${idx}`);

      const embed = new EmbedBuilder()
        .setTitle(res.success ? '🎮 Oyun Presence Aktif!' : '❌ Başlatılamadı')
        .setColor(res.success ? 0x2b2d31 : COLORS.danger)
        .setDescription(res.success
          ? [
            `> 🎮 **${game.name}**`,
            game.coverUrl ? `> 🖼 Kapak resmi gerçek logoyla ayarlandı.` : '',
            `> ✅ **${res.username ?? 'Hesap'}** profilinde artık bu oyunu oynuyor görünüyorsun.`,
            '> ♻️ Bot yeniden başlasa bile otomatik devam eder.',
          ].filter(Boolean).join('\n')
          : `> ⚠️ Hata: \`${res.error}\``)
        .setThumbnail(game.coverUrl || null)
        .setFooter(FOOTER())
        .setTimestamp();

      return interaction.editReply({ content: null, embeds: [embed], components: [] });
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
  }
};
