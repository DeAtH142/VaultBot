// src/commands/oyun.js — 🎮 REXAL Oyun Fake Presence (Otomatik Arama)
import { selfbotDenyEmbed } from '../utils/accessGuard.js';
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  isOyunRunning, getOyunStats, listRunningOyun,
  startOyunPresence, stopOyunPresence, stopAllOyun, searchGame
} from '../utils/oyunPresenceRunner.js';
import { COLORS, THIN_DIVIDER, BRAND, E } from '../utils/embeds.js';
import { markStart, markStop } from '../utils/playtimeHooks.js';

const FOOTER = () => BRAND.footer('Game Presence Engine');
const MAX_SELECT_OPTIONS = 25;
const pendingSearch = new Map();
const PENDING_TTL_MS = 5 * 60 * 1000;

export default {
  name: 'oyun',
  aliases: ['game', 'oynuyor'],
  description: 'REXAL — Otomatik Oyun Arama ve Fake Presence',

  async execute(message) {
    const _deny = selfbotDenyEmbed(message.author.id, '!oyun');
    if (_deny) return message.reply({ embeds: [_deny] });
    
    const running = listRunningOyun(message.author.id);
    const stats = running.map((s) => {
      const st = getOyunStats(message.author.id, s.tokenIndex);
      return `> 🎮 **${st.username || `Hesap #${s.tokenIndex + 1}`}** — **${st.gameName}** (⏱️ \`${st.durationMin} dk\`)`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: `${BRAND.name} • Oyun Oynuyor Gösterme`, iconURL: message.client.user.displayAvatarURL() })
      .setTitle('🎮 REXAL — Fake Game Presence')
      .setThumbnail(message.client.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription([
        `\`${THIN_DIVIDER}\``,
        `> 🤖 **Sistem:** Oyun adını yazın, bot otomatik bulsun!`,
        `> 🖼️ **Görsellik:** Oyunun gerçek kapak resmi ve süre sayacı profile yansır.`,
        '',
        `**📜 NASIL KULLANILIR?**`,
        `> 1️⃣ Aşağıdaki **Başlat** butonuna tıklayın.`,
        `> 2️⃣ Hangi kasadaki hesapta göstereceğinizi seçin.`,
        `> 3️⃣ Oyunun adını yazın (örn: \`GTA VI\`, \`Valorant\`).`,
        `> 4️⃣ Botun bulduğu sonuçlardan doğru olanı seçip onaylayın.`,
        '',
        `\`${THIN_DIVIDER}\``,
        `**🟢 AKTİF OTURUMLAR**`,
        stats.length ? stats.join('\n') : '> ⚫ *Şu anda aktif oyun presence yok*',
      ].join('\n'))
      .setFooter(FOOTER()) // 🚨 DÜZELTİLDİ: Süslü parantezler kaldırıldı
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('oyun:baslat').setLabel('Oyun Ara & Başlat').setEmoji('🎮').setStyle(ButtonStyle.Success),
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
        return `> 🎮 **Hesap #${s.tokenIndex + 1}** — **${st.gameName}**\n> ⏱️ ${st.durationMin} dakikadır oynuyor`;
      });
      
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('📊 Oyun Presence Detayları')
          .setColor(0x2b2d31)
          .setDescription([`\`${THIN_DIVIDER}\``, ...lines, `\`${THIN_DIVIDER}\``].join('\n'))
          .setFooter(FOOTER()) // 🚨 DÜZELTİLDİ
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'onayla') {
      const idx = Number(parts[1]);
      const pending = pendingSearch.get(userId);
      if (pending && Date.now() - pending.at > PENDING_TTL_MS) pendingSearch.delete(userId);
      
      const game = pending?.games[Number(parts[2])];
      if (!game) return interaction.update({ content: '❌ Arama süresi doldu, yeniden arayın.', components: [], embeds: [] });

      await interaction.deferUpdate();
      const res = await startOyunPresence(userId, idx, { 
        gameName: game.name, 
        imageUrl: game.coverUrl 
      }, { statusChoice: 'online' });
      
      if (res.success) markStart(userId, 'oyun', idx);

      const embed = new EmbedBuilder()
        .setTitle(res.success ? '🎮 Oyun Presence Aktif!' : '❌ Başlatılamadı')
        .setColor(res.success ? 0x2b2d31 : COLORS.danger)
        .setThumbnail(game.coverUrl)
        .setDescription(res.success
          ? [
            `> 🎮 **${game.name}**`,
            `> ✅ **${res.username ?? 'Hesap'}** profilinde artık bu oyunu oynuyor görünüyorsun.`,
            '> ♻️ Bot yeniden başlasa bile otomatik devam eder.',
          ].join('\n')
          : `> ⚠️ Hata: \`${res.error}\``)
        .setFooter(FOOTER()) // 🚨 DÜZELTİLDİ
        .setTimestamp();
        
      return interaction.editReply({ embeds: [embed], components: [] });
    }

    if (action === 'vazgec') {
      return interaction.update({ content: '❌ Vazgeçildi.', embeds: [], components: [] });
    }
  },

  async onSelect(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'hesapsec') {
      const idx = Number(interaction.values[0]);
      const modal = new ModalBuilder().setCustomId(`oyun:arama:${idx}`).setTitle('🎮 Oyun Ara');
      
      const gameInput = new TextInputBuilder()
        .setCustomId('oyunadi').setLabel('Hangi oyunu oynuyor görüneceksin?')
        .setPlaceholder('Örn: GTA VI, Valorant, Minecraft, CS2')
        .setStyle(TextInputStyle.Short).setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(gameInput));
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

    if (action === 'parcasec') {
      const idx = Number(parts[1]);
      const pending = pendingSearch.get(userId);
      if (pending && Date.now() - pending.at > PENDING_TTL_MS) {
        pendingSearch.delete(userId);
        return interaction.update({ content: '⌛ Arama süresi doldu (5 dk).', embeds: [], components: [] });
      }
      
      const games = pending?.games ?? [];
      const game = games[Number(interaction.values[0])];
      if (!game) return interaction.update({ content: '❌ Oyun bulunamadı.', components: [] });

      const embed = new EmbedBuilder()
        .setTitle('🎮 Bu oyun mu?')
        .setColor(0x2b2d31)
        .setThumbnail(game.coverUrl)
        .setDescription([
          `> 🎮 **${game.name}**`,
          '',
          '*Onaylırsan profilinde 7/24 bu oyunu oynuyor görünürsün.*',
        ].join('\n'))
        .setFooter(FOOTER()); // 🚨 DÜZELTİLDİ

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`oyun:onayla:${idx}:${interaction.values[0]}`).setLabel('Evet, Bunu!').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('oyun:vazgec').setLabel('Vazgeç').setEmoji('❌').setStyle(ButtonStyle.Danger),
      );
      return interaction.update({ content: '', embeds: [embed], components: [row] });
    }
  },

  async onModalSubmit(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action !== 'arama') return;
    const idx = Number(parts[1]);
    const sorgu = interaction.fields.getTextInputValue('oyunadi').trim();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const games = await searchGame(sorgu);

    if (games.length === 0) {
      return interaction.editReply({ content: `❌ \`${sorgu}\` için sonuç bulunamadı. Farklı bir isim dene.` });
    }

    pendingSearch.set(userId, { games, at: Date.now() });

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Arama Sonuçları: "${sorgu}"`)
      .setColor(0x2b2d31)
      .setDescription(games.map((g, i) => `> **${i + 1}.** 🎮 **${g.name}**`).join('\n'))
      .setFooter(FOOTER()); // 🚨 DÜZELTİLDİ

    return interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`oyun:parcasec:${idx}`)
          .addOptions(games.map((g, i) => ({
            label: `${i + 1}. ${g.name}`.slice(0, 100),
            value: String(i),
            emoji: '🎮',
          })))
          .setPlaceholder('🔍 Oyun seç...'),
      )],
    });
  },
};
