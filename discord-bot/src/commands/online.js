// src/commands/online.js
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getTokens, updateTokenStatus } from '../utils/tokenStore.js';
import { setAccountPresence, stopAccountSession, isAccountSessionActive } from '../utils/accountManager.js';
import { createOnlineSystemEmbed, createOnlineSystemComponents, COLORS } from '../utils/embeds.js';
import { markStart, markStop } from '../utils/playtimeHooks.js';

export default {
  name: 'online',
  aliases: ['aktif', 'onlinetut', 'presence'],
  description: 'REXAL Online Tutma Sistemi Kontrol Paneli',

  async execute(message) {
    const embed = createOnlineSystemEmbed();
    const components = createOnlineSystemComponents();
    await message.reply({ embeds: [embed], components });
  },

  // ── Buton Etkileşimleri ──────────────────────────────────────────────────
  async onButton(interaction, actionParts) {
    let action = actionParts[0];

    // Vault panelinden gelen hızlı durum/kapat butonları:
    // aktif:durumsec:<index>:<status>  ve  aktif:kapat:<index>
    if (action === 'durumsec') {
      // aktif:durumsec:<index>:<status> — direkt durumu ayarla (buton variant)
      const tokenIndex = parseInt(actionParts[1], 10);
      const status = actionParts[2] || 'online';
      const tokens = getTokens(interaction.user.id);
      const token = tokens[tokenIndex];

      if (!token) {
        return interaction.reply({ content: '❌ Hesap bulunamadı.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const res = await setAccountPresence(interaction.user.id, tokenIndex, token, status, '');

      if (res.success) {
        updateTokenStatus(interaction.user.id, tokenIndex, status);
        // ⏱️ Süre motoru: yalnızca gerçek başarı sonrası oturum açılır
        markStart(interaction.user.id, 'online', tokenIndex);
        await interaction.editReply({
          content: `🟢 **${token.username || token.label || 'Hesap'}** — durum \`${status}\` olarak ayarlandı.`,
        });
      } else {
        await interaction.editReply({
          content: `❌ Durum değiştirilemedi: \`${res.error}\``,
        });
      }
      return;
    }

    if (action === 'kapat') {
      const tokenIndex = parseInt(actionParts[1], 10);
      const tokens = getTokens(interaction.user.id);
      const token = tokens[tokenIndex];

      stopAccountSession(interaction.user.id, tokenIndex);
      updateTokenStatus(interaction.user.id, tokenIndex, 'pasif');
      markStop(interaction.user.id, 'online', tokenIndex); // ⏱️

      await interaction.reply({
        content: `🛑 **${token?.username || token?.label || 'Hesap'}** oturumu kapatıldı.`,
        ephemeral: true,
      });
      return;
    }

    // 1. Hesap Ekle & Online Yap -> Screenshot 1 (Dropdown ile hesap seçtir)
    if (action === 'ekle') {
      const tokens = getTokens(interaction.user.id);
      if (tokens.length === 0) {
        return interaction.reply({
          content: '❌ Havuzda kayıtlı hesap bulunamadı! Önce `!hesaplarim` panelinden **Token Ekle** butonuna basarak hesabınızı ekleyin.',
          ephemeral: true,
        });
      }

      const options = tokens.map((t, i) => {
        const isRunning = isAccountSessionActive(interaction.user.id, i);
        return {
          label: t.username || t.label || `Hesap ${i + 1}`,
          description: `Durum: ${t.status || 'pasif'} • ID: ${t.accountUserId || 'Bilinmiyor'}`,
          value: String(i),
          emoji: isRunning ? '⚡' : '⚪',
        };
      });

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('online:secim_yapildi')
          .setPlaceholder('Online tutulacak hesabı seç...')
          .addOptions(options),
      );

      // Screenshot 1 Tasarımı
      await interaction.reply({
        content: '🟢 **Online Sistemi** — Hangi hesapları online tutacaksın?',
        components: [row],
        ephemeral: true,
      });
    }

    // 2. Hesap Çıkar
    else if (action === 'cikar') {
      const tokens = getTokens(interaction.user.id);
      const activeTokens = tokens
        .map((t, i) => ({ ...t, index: i }))
        .filter(t => t.status && t.status !== 'pasif');

      if (activeTokens.length === 0) {
        return interaction.reply({
          content: 'ℹ️ Şu anda aktif olan hiçbir hesap oturumu yok.',
          ephemeral: true,
        });
      }

      const options = activeTokens.map((t) => ({
        label: t.username || t.label,
        description: `Şu anki durum: ${t.status}`,
        value: String(t.index),
        emoji: '⛔',
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('online:hesap_cikar_secildi')
          .setPlaceholder('Oturumunu kapatmak istediğin hesabı seç...')
          .addOptions(options),
      );

      await interaction.reply({
        content: '🛑 **Durdurmak istediğin hesabı seçin:**',
        components: [row],
        ephemeral: true,
      });
    }

    // 3. Aktif Hesaplar Raporu
    else if (action === 'aktifler') {
      const tokens = getTokens(interaction.user.id);
      const activeTokens = tokens.filter(t => t.status && t.status !== 'pasif');

      if (activeTokens.length === 0) {
        return interaction.reply({
          content: 'ℹ️ Havuzunuzda şu anda çalışan aktif hesap bulunmuyor.',
          ephemeral: true,
        });
      }

      const desc = activeTokens.map(t => {
        return `> 🟢 **${t.username || t.label}** (\`${t.accountUserId || 'ID Yok'}\`) — \`${t.status.toUpperCase()}\``;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('📋 7/24 Aktif Tutulan Hesaplar')
        .setColor(COLORS.online)
        .setDescription(desc)
        .setFooter({ text: 'REXAL Online Tutma Sistemi' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  // ── Select Menu Etkileşimleri ───────────────────────────────────────────
  async onSelect(interaction, actionParts) {
    const action = actionParts[0];

    // Hesap seçildi -> Durum seçim menüsünü göster
    // NOT: Discord API'sinde modal içine select menu konulamaz; bu yüzden
    // durum önce select menüyle, custom status ise sonraki modalda alınıyor.
    if (action === 'secim_yapildi') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      const tokens = getTokens(interaction.user.id);
      const token = tokens[tokenIndex];

      if (!token) {
        return interaction.reply({ content: '❌ Hesap bulunamadı.', ephemeral: true });
      }

      const statusSelect = new StringSelectMenuBuilder()
        .setCustomId(`online:durumsec:${tokenIndex}`)
        .setPlaceholder('Durum (online, idle, dnd, invisible) seç...')
        .addOptions([
          { label: '🟢 online', value: 'online', description: 'Çevrimiçi (Aktif)' },
          { label: '🟡 idle', value: 'idle', description: 'Boşta' },
          { label: '🔴 dnd', value: 'dnd', description: 'Rahatsız Etmeyin' },
          { label: '⚪ invisible', value: 'invisible', description: 'Görünmez (Çevrimdışı)' },
        ]);

      const row = new ActionRowBuilder().addComponents(statusSelect);

      await interaction.reply({
        content: `⚙️ **${token.username || token.label || 'Hesap'}** için durumu seç:`,
        components: [row],
        ephemeral: true,
      });
    }

    // Durum seçildi -> Custom Status modalını aç (seçilen durum customId'a gömülür)
    else if (action === 'durumsec') {
      const tokenIndex = parseInt(actionParts[1], 10);
      const selectedStatus = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`online:modal_ayar:${tokenIndex}:${selectedStatus}`)
        .setTitle('Online Tutma Ayarları');

      const customStatusInput = new TextInputBuilder()
        .setCustomId('custom_status')
        .setLabel('Custom Status (opsiyonel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('/REXAL goated')
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder().addComponents(customStatusInput));

      await interaction.showModal(modal);
    }

    // Hesap Çıkar Onay
    else if (action === 'hesap_cikar_secildi') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      stopAccountSession(interaction.user.id, tokenIndex);
      updateTokenStatus(interaction.user.id, tokenIndex, 'pasif');
      markStop(interaction.user.id, 'online', tokenIndex); // ⏱️

      const tokens = getTokens(interaction.user.id);
      const token = tokens[tokenIndex];

      await interaction.update({
        content: `🛑 **${token?.username || token?.label || 'Hesap'}** oturumu kapatıldı ve sistemden çıkarıldı.`,
        components: [],
      });
    }
  },

  // ── Modal Yanıtı (Screenshot 3 Tasarımı) ─────────────────────────────────
  async onModalSubmit(interaction, actionParts) {
    // customId formatı: online:modal_ayar:<tokenIndex>:<status>
    const tokenIndex = parseInt(actionParts[1], 10);
    const selectedStatus = actionParts[2] || 'online';
    const tokens = getTokens(interaction.user.id);
    const token = tokens[tokenIndex];

    if (!token) {
      return interaction.reply({ content: '❌ Hesap bulunamadı.', ephemeral: true });
    }

    // Custom Status metni
    let customStatus = '';
    try {
      customStatus = interaction.fields.getTextInputValue('custom_status') || '';
    } catch {}

    await interaction.deferReply({ ephemeral: true });

    // Hesaba bağlan ve durumu ayarla
    const res = await setAccountPresence(interaction.user.id, tokenIndex, token, selectedStatus, customStatus);

    if (!res.success) {
      // Screenshot 3 Başarısız Formatı
      const failEmbed = new EmbedBuilder()
        .setAuthor({ name: 'REXAL SYSTEMS' })
        .setColor(0xed4245)
        .setDescription([
          `❌ **Online Sistemi Başlatılamadı**`,
          '',
          `| **Durum:** \`${selectedStatus}\``,
          `| **Başarılı:** \`0\` | **Hatalı:** \`1\``,
          `| **Sebep:** \`${res.error}\``,
        ].join('\n'));

      return interaction.editReply({ embeds: [failEmbed] });
    }

    // Token verisini ve durumunu güncelle
    updateTokenStatus(interaction.user.id, tokenIndex, selectedStatus);
    markStart(interaction.user.id, 'online', tokenIndex); // ⏱️ süre gerçek başarıyla açılır

    // Screenshot 3 Tasarımı:
    // 🟢 Online Sistemi Başlatıldı
    // | Durum: dnd
    // | Başarılı: 1 | Hatalı: 0
    const successEmbed = new EmbedBuilder()
      .setAuthor({ name: 'REXAL SYSTEMS' })
      .setColor(0x2f3136)
      .setDescription([
        `🟢 **Online Sistemi Başlatıldı**`,
        '',
        `| **Durum:** \`${selectedStatus}\``,
        `| **Başarılı:** \`1\` | **Hatalı:** \`0\``,
        customStatus ? `| **Custom Status:** \`${customStatus}\`` : '',
      ].filter(Boolean).join('\n'));

    await interaction.editReply({ embeds: [successEmbed] });
  },
};
