
// src/commands/vaultsettings.js
import {
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { getAllUsers, deleteToken, setUserSubscription, saveToken, getUserSubscription } from '../utils/tokenStore.js';
import { stopAccountSession } from '../utils/accountManager.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { COLORS, BRAND, E, THIN_DIVIDER , errorEmbed, infoEmbed } from '../utils/embeds.js';

// Yetkili admin ID'leri
const AUTHORIZED_ADMINS = [
  '1160564359727173792', // ID 1
  '1067480716159496192', // ID 2
];

// Geçici session storage (admin → seçili kullanıcı → seçili hesap)
const adminSessions = new Map();

export default {
  name: 'vaultsettings',
  description: 'Admin vault kontrol paneli - tüm kullanıcıları yönet (Admin)',

  async execute(message, args) {
    // Yetki kontrolü
    if (!AUTHORIZED_ADMINS.includes(message.author.id)) {
      return message.reply({ embeds: [errorEmbed('❌ Bu komutu kullanma yetkiniz yok!')], ephemeral: true });
    }

    const allUsers = getAllUsers().filter(u => u.tokenCount > 0);

    if (allUsers.length === 0) {
      return message.reply({ embeds: [errorEmbed('❌ Sistemde hiç vault hesabı olan kullanıcı yok!')], ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.darkPurple)
      .setTitle(`${E.crown} REXAL — VAULT ADMIN PANEL`)
      .setDescription([
        `${THIN_DIVIDER}`,
        `> ${E.gear} **Yönetici:** <@${message.author.id}>`,
        `> ${E.chart} **Toplam Kullanıcı:** \`${allUsers.length}\``,
        `> ${E.vault} **Toplam Token:** \`${allUsers.reduce((a, u) => a + u.tokenCount, 0)}\``,
        '',
        `${E.info} **PANEL ÖZELLİKLERİ**`,
        '> 🔍 Kullanıcı seç → Hesap seç → İşlem yap',
        '> 🗑️ Vault\'tan hesap sil',
        '> ⛔ Çalışan sistemi durdur',
        '> ➕ Manuel token ekle',
        '> 🔄 Başka sisteme aktar',
        '> 📊 Detaylı bilgi görüntüle',
        '',
        `${THIN_DIVIDER}`,
        `${E.warning} **Aşağıdaki listeden bir kullanıcı seç:**`,
      ].join('\n'))
      .setFooter(BRAND.footer('Admin Kontrol Paneli'))
      .setTimestamp();

    const userOptions = allUsers.slice(0, 25).map(u => ({
      label: `${u.subscription?.type || 'Ücretsiz'} | ${u.tokenCount} token`,
      value: u.userId,
      description: `ID: ${u.userId}`,
      emoji: u.subscription?.type !== 'Ücretsiz' ? '👑' : '👤',
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('vaultsettings:selectuser')
        .setPlaceholder('👤 Kullanıcı seç...')
        .addOptions(userOptions)
    );

    await message.reply({ embeds: [embed], components: [row] });
  },

  async onSelect(interaction, actionParts) {
    const action = actionParts[0];

    // Yetki kontrolü
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Bu paneli kullanamazsın!',
        ephemeral: true
      });
    }

    if (action === 'selectuser') {
      const targetUserId = interaction.values[0];
      const allUsers = getAllUsers();
      const userData = allUsers.find(u => u.userId === targetUserId);

      if (!userData || userData.tokens.length === 0) {
        return interaction.reply({
          content: '❌ Bu kullanıcıda hiç token yok!',
          ephemeral: true,
        });
      }

      // Session'a kaydet
      adminSessions.set(interaction.user.id, { targetUserId, selectedAccount: null });

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`${E.gear} Kullanıcı Vault'u`)
        .setDescription([
          `${THIN_DIVIDER}`,
          `> 👤 **Kullanıcı:** <@${targetUserId}>`,
          `> 🏷️ **Paket:** \`${userData.subscription?.type || 'Ücretsiz'}\``,
          `> 📊 **Kapasite:** \`${userData.tokens.length}/${userData.subscription?.capacity || 2}\``,
          `> ${E.clock} **Süre:** ${userData.subscription?.expiresAt === 'infinite' ? '`Sınırsız`' : userData.subscription?.expiresAt ? `<t:${Math.floor(new Date(userData.subscription.expiresAt).getTime() / 1000)}:R>` : '`—`'}`,
          '',
          `${E.info} **HESAPLAR (${userData.tokens.length})**`,
          ...userData.tokens.map((t, i) => {
            const statusEmoji = t.status === 'gecersiz' ? '💔' : t.status === 'pasif' ? '🤍' : '💚';
            return `> ${statusEmoji} \`#${i + 1}\` **${t.username || t.label}** — \`${t.status}\``;
          }),
          '',
          `${THIN_DIVIDER}`,
          `${E.warning} **Aşağıdan bir hesap seç:**`,
        ].join('\n'))
        .setFooter(BRAND.footer());

      const accountOptions = userData.tokens.map((t, i) => ({
        label: `#${i + 1} - ${t.username || t.label}`,
        value: String(i),
        description: `Durum: ${t.status} | ID: ${t.accountUserId || 'Yok'}`,
        emoji: t.status === 'gecersiz' ? '💔' : t.status === 'pasif' ? '🤍' : '💚',
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('vaultsettings:selectaccount')
          .setPlaceholder('🔍 Hesap seç...')
          .addOptions(accountOptions)
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    else if (action === 'selectaccount') {
      const accountIndex = parseInt(interaction.values[0], 10);
      const session = adminSessions.get(interaction.user.id);

      if (!session) {
        return interaction.reply({
          content: '❌ Session bulunamadı! Lütfen tekrar başla.',
          ephemeral: true,
        });
      }

      const targetUserId = session.targetUserId;
      const allUsers = getAllUsers();
      const userData = allUsers.find(u => u.userId === targetUserId);
      const account = userData?.tokens[accountIndex];

      if (!account) {
        return interaction.reply({
          content: '❌ Hesap bulunamadı!',
          ephemeral: true,
        });
      }

      // Session'a hesabı kaydet
      adminSessions.set(interaction.user.id, { targetUserId, selectedAccount: accountIndex });

      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`${E.vault} Hesap Detayları`)
        .setDescription([
          `${THIN_DIVIDER}`,
          `> 👤 **Kullanıcı:** <@${targetUserId}>`,
          `> 🔢 **Hesap:** \`#${accountIndex + 1}\``,
          '',
          `${E.info} **BİLGİLER**`,
          `> 📛 **Kullanıcı Adı:** \`${account.username || account.label}\``,
          `> 🆔 **Discord ID:** \`${account.accountUserId || 'Bilinmiyor'}\``,
          `> 📊 **Durum:** \`${account.status}\``,
          `> ${E.clock} **Eklenme:** ${account.addedAt ? `<t:${Math.floor(new Date(account.addedAt).getTime() / 1000)}:R>` : '`—`'}`,
          '',
          `${THIN_DIVIDER}`,
          `${E.gear} **İŞLEMLER:**`,
          `> Aşağıdaki butonlardan birini seç`,
        ].join('\n'))
        .setFooter(BRAND.footer());

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('vaultsettings:delete')
          .setLabel('Vault\'tan Sil')
          .setEmoji('🗑️')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('vaultsettings:stop')
       .setLabel('Sistemleri Durdur')
          .setEmoji('⛔')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('vaultsettings:addtoken')
          .setLabel('Manuel Token Ekle')
          .setEmoji('➕')
          .setStyle(ButtonStyle.Success),
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('vaultsettings:showtoken')
        .setLabel('Token Göster')
          .setEmoji('🔐')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('vaultsettings:scantoken')
          .setLabel('Token Scan Et')
          .setEmoji('🔍')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.update({ embeds: [embed], components: [row, row2] });
    }
  },

  async onButton(interaction, actionParts) {
    const action = actionParts[0];

    // Yetki kontrolü
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Bu işlemi yapamazsın!',
        ephemeral: true
      });
    }

    const session = adminSessions.get(interaction.user.id);
    if (!session) {
      return interaction.reply({
        content: '❌ Session bulunamadı! Lütfen !vaultsettings ile tekrar başla.',
        ephemeral: true,
      });
    }

    const { targetUserId, selectedAccount } = session;

    if (action === 'delete') {
      await interaction.reply({
        content: '⏳ Hesap vault\'tan siliniyor...',
        ephemeral: true,
      });

      try {
        const allUsers = getAllUsers();
        const userData = allUsers.find(u => u.userId === targetUserId);
        const account = userData?.tokens[selectedAccount];

        if (!account) {
          return interaction.editReply({ content: '❌ Hesap bulunamadı!' });
        }

        // Hesabı sil
        deleteToken(targetUserId, selectedAccount);

        const embed = new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(`${E.check} Hesap Silindi!`)
          .setDescription([
            `${THIN_DIVIDER}`,
            `> 👤 **Kullanıcı:** <@${targetUserId}>`,
            `> 🗑️ **Silinen:** \`${account.username || account.label}\``,
            `> 🆔 **ID:** \`${account.accountUserId || 'Yok'}\``,
            '',
            `${E.check} Hesap vault\'tan başarıyla kaldırıldı!`,
            `${THIN_DIVIDER}`,
          ].join('\n'))
          .setFooter(BRAND.footer())
          .setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });

        // Session temizle
        adminSessions.delete(interaction.user.id);

      } catch (err) {
        console.error('Hesap silme hatası:', err);
        await interaction.editReply({ content: `❌ Hata: ${err.message}` });
      }
    }

    else if (action === 'stop') {
      await interaction.reply({
        content: '⏳ Sistemler durduruluyor...',
        ephemeral: true,
      });

      try {
        // Tüm çalışan sistemleri durdur
        stopAccountSession(targetUserId, selectedAccount);

        const embed = new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(`${E.check} Sistemler Durduruldu!`)
          .setDescription([
            `${THIN_DIVIDER}`,
            `> 👤 **Kullanıcı:** <@${targetUserId}>`,
            `> 🔢 **Hesap:** \`#${selectedAccount + 1}\``,
            '',
            `${E.check} Bu hesaptaki tüm çalışan sistemler durduruldu!`,
            `> (Online, OwO, AFK, vb.)`,
            `${THIN_DIVIDER}`,
          ].join('\n'))
          .setFooter(BRAND.footer())
          .setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });

      } catch (err) {
        console.error('Sistem durdurma hatası:', err);
        await interaction.editReply({ content: `❌ Hata: ${err.message}` });
      }
    }

    else if (action === 'addtoken') {
      // Modal aç - token ekle
      const modal = new ModalBuilder()
        .setCustomId('vaultsettings:addmodal')
        .setTitle('Kullanıcıya Token Ekle');

      const tokenInput = new TextInputBuilder()
        .setCustomId('token')
        .setLabel('Discord Selfbot Token')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Token buraya...')
        .setRequired(true);

      const labelInput = new TextInputBuilder()
        .setCustomId('label')
        .setLabel('Etiket (opsiyonel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Hesap adı')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(tokenInput),
        new ActionRowBuilder().addComponents(labelInput)
      );

      await interaction.showModal(modal);
    }

    else if (action === 'showtoken') {
      await interaction.reply({
        content: '⏳ Token şifresi çözülüyor...',
        ephemeral: true,
      });

      try {
        const allUsers = getAllUsers();
        const userData = allUsers.find(u => u.userId === targetUserId);
        const account = userData?.tokens[selectedAccount];

        if (!account) {
          return interaction.editReply({ content: '❌ Hesap bulunamadı!' });
        }

        // Token'ı decrypt et
        const rawToken = decrypt(account);

        const embed = new EmbedBuilder()
          .setColor(COLORS.danger)
          .setTitle(`${E.vault} Token Gösteriliyor`)
          .setDescription([
            `${THIN_DIVIDER}`,
            `> 👤 **Kullanıcı:** <@${targetUserId}>`,
            `> 🔢 **Hesap:** \`#${selectedAccount + 1}\``,
            `> 📛 **Kullanıcı Adı:** \`${account.username || account.label}\``,
            '',
            `${E.warning} **TOKEN (GİZLİ):**`,
            `\`\`\`${rawToken}\`\`\``,
            '',
            `${E.cross} **Bu bilgiyi kimseyle paylaşma!**`,
          `${THIN_DIVIDER}`,
          ].join('\n'))
          .setFooter(BRAND.footer('Admin Panel'));

        await interaction.editReply({ content: null, embeds: [embed] });

      } catch (err) {
        console.error('Token gösterme hatası:', err);
        await interaction.editReply({ content: `❌ Hata: ${err.message}` });
      }
    }

    else if (action === 'scantoken') {
      await interaction.reply({
        content: '⏳ Token scan ediliyor...',
        ephemeral: true,
      });

      try {
        const selfbotModule = await import('discord.js-selfbot-v13');
        const SelfClient = selfbotModule.Client;
        const allUsers = getAllUsers();
        const userData = allUsers.find(u => u.userId === targetUserId);
        const account = userData?.tokens[selectedAccount];

        if (!account) {
          return interaction.editReply({ content: '❌ Hesap bulunamadı!' });
        }

        // Token'ı test et
        const testToken = async (tokenObj) => {
          try {
            const raw = decrypt(tokenObj);
            const testClient = new SelfClient({ checkUpdate: false });

            const isValid = await new Promise((resolve) => {
              const timer = setTimeout(() => resolve(false), 7000);
              testClient.once('ready', () => {
                clearTimeout(timer);
                testClient.destroy();
                resolve(true);
              });
              testClient.login(raw).catch(() => {
                clearTimeout(timer);
                resolve(false);
              });
            });

            return isValid;
          } catch {
            return false;
          }
        };

        const isValid = await testToken(account);

        const embed = new EmbedBuilder()
          .setColor(isValid ? COLORS.success : COLORS.danger)
          .setTitle(`${isValid ? E.check : E.cross} Scan Sonucu`)
          .setDescription([
            `${THIN_DIVIDER}`,
            `> 👤 **Kullanıcı:** <@${targetUserId}>`,
            `> 🔢 **Hesap:** \`#${selectedAccount + 1}\``,
            `> 📛 **Kullanıcı Adı:** \`${account.username || account.label}\``,
            '',
            `> 📊 **Durum:** ${isValid ? '\`✅ GEÇERLİ\`' : '\`❌ GEÇERSİZ\`'}`,
            '',
            isValid ? `${E.check} Token çalışıyor!` : `${E.warning} Token geçersiz, silinmesi önerilir.`,
            `${THIN_DIVIDER}`,
          ].join('\n'))
          .setFooter(BRAND.footer());

        await interaction.editReply({ content: null, embeds: [embed] });

      } catch (err) {
        console.error('Token scan hatası:', err);
        await interaction.editReply({ content: `❌ Hata: ${err.message}` });
      }
    }
  },

  async onModalSubmit(interaction, actionParts) {
    const action = actionParts[0];

    // Yetki kontrolü
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Bu işlemi yapamazsın!',
        ephemeral: true
      });
    }

    if (action === 'addmodal') {
      const token = interaction.fields.getTextInputValue('token').trim();
      const label = interaction.fields.getTextInputValue('label').trim() || 'Admin Ekledi';

      const session = adminSessions.get(interaction.user.id);
      if (!session) {
        return interaction.reply({
          content: '❌ Session bulunamadı!',
          ephemeral: true,
        });
      }

      await interaction.reply({
        content: '⏳ Token doğrulanıyor ve ekleniyor...',
        ephemeral: true,
      });

      try {
        // Şifrele ve kaydet
        const encrypted = encrypt(token);
        encrypted.username = label;
        encrypted.label = label;
        encrypted.status = 'pasif';

        saveToken(session.targetUserId, encrypted);

        const embed = new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(`${E.check} Token Eklendi!`)
          .setDescription([
            `${THIN_DIVIDER}`,
            `> 👤 **Kullanıcı:** <@${session.targetUserId}>`,
            `> 🏷️ **Etiket:** \`${label}\``,
            '',
            `${E.check} Token başarıyla vault'a eklendi!`,
            `${THIN_DIVIDER}`,
          ].join('\n'))
          .setFooter(BRAND.footer())
          .setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });

      } catch (err) {
        console.error('Token ekleme hatası:', err);
        await interaction.editReply({ content: `❌ Hata: ${err.message}` });
      }
    }
  },
};
