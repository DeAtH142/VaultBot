// src/commands/hesaplarim.js
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  ButtonStyle,
  ButtonBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { Client as SelfClient } from 'discord.js-selfbot-v13';
import { getTokens, saveToken, updateTokenStatus, deleteInvalidTokens, deleteToken } from '../utils/tokenStore.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { createVaultEmbed, createVaultComponents, COLORS } from '../utils/embeds.js';
import { stopAccountSession } from '../utils/accountManager.js';

// Panel sahipliği: panel mesajı ID -> paneli açan kullanıcı ID.
// Böylece başka biri senin panelindeki butonlara basamaz, kendi verisine karışamaz.
const panelOwners = new Map();

/**
 * Panel sahibi mi? Kontrol iki katmanlı:
 * 1) Hafıza haritası (panelOwners)
 * 2) Embed içinden kullanıcı mention satırı — restart sonrası hafıza silinse bile
 *    embed'deki "Kullanıcı:" satırından sahibin ID'si okunur, koruma sürer.
 * Sahip DEĞİLSE uyarı gösterir ve false döndürür.
 */
function checkPanelOwner(interaction) {
  let ownerId = panelOwners.get(interaction.message?.id);

  // Hafızada yoksa embed'den oku: `> 👑 **Kullanıcı:** <@ID>` satırı
  if (!ownerId) {
    const desc = interaction.message?.embeds?.[0]?.description || '';
    const m = desc.match(/\*\*Kullanıcı:\*\* <@(\d{17,20})>/);
    if (m) {
      ownerId = m[1];
      panelOwners.set(interaction.message.id, ownerId);
    }
  }

  if (ownerId && interaction.user.id !== ownerId) {
    interaction.reply({
      content: '🚫 Bu panel sana ait değil! Kendi kasanı görmek için `!hesaplarim` yaz.',
      ephemeral: true,
    }).catch(() => {});
    return false;
  }
  return true;
}

export default {
  name: 'hesaplarim',
  aliases: ['hesaplarım', 'vault', 'tokens', 'kasa'],
  description: 'REXAL — Token Kasası (Vault) Paneli',

  async execute(message) {
    const tokens = getTokens(message.author.id);
    const embed = createVaultEmbed(message.author, tokens);
    const components = createVaultComponents(tokens);

    // Panel GİZLİ olmalı: kasadaki hesaplar kanalda görünmesin.
    // Önce DM'ye göndermeyi dene; DM kapalıysa kanala yaz + kısa süre sonra sil.
    try {
      const dm = await message.author.send({ embeds: [embed], components });
      panelOwners.set(dm.id, message.author.id);
      // Kanalda küçük bir bilgi bırak, panel göstermeden silinsin
      const notice = await message.reply({ content: '📬 Kasanın DM' + "'" + 'ine gönderdim — oradan yönetebilirsin.' });
      setTimeout(() => notice.delete().catch(() => {}), 8000);
    } catch {
      // DM kapalı → kanala yaz ama 30 sn sonra otomatik sil (paylaşım riskini azalt)
      try {
        const reply = await message.reply({ embeds: [embed], components });
        panelOwners.set(reply.id, message.author.id);
        setTimeout(() => reply.delete().catch(() => {}), 30 * 1000);
      } catch {}
    }
  },

  // ── Buton Etkileşimleri ──────────────────────────────────────────────────
  async onButton(interaction, actionParts) {
    const action = actionParts[0];

    // Panel sahibi değilse hiçbir buton işlemesin
    if (!checkPanelOwner(interaction)) return;

    // 1. Token Ekle Modal Aç (Screenshot 2)
    if (action === 'tokenekle_modal') {
      const modal = new ModalBuilder()
        .setCustomId('hesaplarim:modal_ekle')
        .setTitle('Havuza Token Ekle');

      const tokenInput = new TextInputBuilder()
        .setCustomId('tokens_raw')
        .setLabel('Selfbot Token(lar) - Bu alan gerekli.')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('token1\ntoken2\ntoken3')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
      await interaction.showModal(modal);
    }

    // 2. Yedek İndir (TXT)
    else if (action === 'yedek') {
      const tokens = getTokens(interaction.user.id);
      if (tokens.length === 0) {
        return interaction.reply({ content: '❌ Kasada hiç token bulunmuyor.', ephemeral: true });
      }

      let fileContent = `=== REXAL TOKEN KASASI YEDEK ===\nKullanıcı: ${interaction.user.tag} (${interaction.user.id})\nTarih: ${new Date().toLocaleString('tr-TR')}\nToplam Hesap: ${tokens.length}\n\n`;

      tokens.forEach((t, i) => {
        try {
          const raw = decrypt(t);
          fileContent += `[${i + 1}] ${t.username || t.label} (${t.accountUserId || 'ID Yok'}) -> ${raw}\n`;
        } catch {
          fileContent += `[${i + 1}] ${t.username || t.label} -> [Şifre Çözülemedi]\n`;
        }
      });

      const buffer = Buffer.from(fileContent, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: 'rexal_token_yedek.txt' });

      await interaction.reply({
        content: '🔒 **Token yedeğiniz hazırlandı.** Dosyayı kimseyle paylaşmayın!',
        files: [attachment],
        ephemeral: true,
      });
    }

    // 3. Geçersizleri Sil
    else if (action === 'gecersizlerisil') {
      const deletedCount = deleteInvalidTokens(interaction.user.id);
      const updatedTokens = getTokens(interaction.user.id);
      const embed = createVaultEmbed(interaction.user, updatedTokens);
      const components = createVaultComponents(updatedTokens);

      await interaction.update({ embeds: [embed], components });
      await interaction.followUp({
        content: `🗑️ **${deletedCount}** adet geçersiz token kasadan temizlendi.`,
        ephemeral: true,
      });
    }

    // 4. Tümünü Durdur
    else if (action === 'tumunudurdur') {
      const tokens = getTokens(interaction.user.id);
      tokens.forEach((_, i) => {
        stopAccountSession(interaction.user.id, i);
        updateTokenStatus(interaction.user.id, i, 'pasif');
      });

      const updatedTokens = getTokens(interaction.user.id);
      const embed = createVaultEmbed(interaction.user, updatedTokens);
      const components = createVaultComponents(updatedTokens);

      await interaction.update({ embeds: [embed], components });
      await interaction.followUp({
        content: '🛑 Tüm hesap oturumları durduruldu ve pasife alındı.',
        ephemeral: true,
      });
    }

    // 5. Token Denetle
    else if (action === 'denetle') {
      await interaction.reply({ content: '⏳ Kasadaki tokenler denetleniyor...', ephemeral: true });
      const tokens = getTokens(interaction.user.id);
      let valid = 0, invalid = 0;

      for (let i = 0; i < tokens.length; i++) {
        try {
          const raw = decrypt(tokens[i]);
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

          if (isValid) {
            valid++;
          } else {
            invalid++;
            updateTokenStatus(interaction.user.id, i, 'gecersiz');
          }
        } catch {
          invalid++;
          updateTokenStatus(interaction.user.id, i, 'gecersiz');
        }
      }

      const updatedTokens = getTokens(interaction.user.id);
      const embed = createVaultEmbed(interaction.user, updatedTokens);
      const components = createVaultComponents(updatedTokens);

      await interaction.message.edit({ embeds: [embed], components }).catch(() => {});
      await interaction.editReply({
        content: `✅ Denetim Tamamlandı! **${valid}** geçerli, **${invalid}** geçersiz token tespit edildi.`,
      });
    }

    // 6. Tekil Hesap Sil
    else if (action === 'tekilsil') {
      const index = parseInt(actionParts[1], 10);
      deleteToken(interaction.user.id, index);
      await interaction.update({
        content: '🗑️ Hesap kasadan başarıyla silindi.',
        components: [],
      });
    }
  },

  // ── Modal Yanıtı: Token Ekleme (Screenshots 3 & 4) ────────────────────────
  async onModalSubmit(interaction, actionParts) {
    const rawInput = interaction.fields.getTextInputValue('tokens_raw');
    const tokenLines = rawInput.split('\n').map(l => l.trim()).filter(Boolean);

    if (tokenLines.length === 0) {
      return interaction.reply({ content: '❌ Hiç token girilmedi!', ephemeral: true });
    }

    // Screenshot 3: "1 token doğrulanıyor..."
    await interaction.reply({
      content: `🕒 **${tokenLines.length}** token doğrulanıyor...`,
      ephemeral: true,
    });

    let successCount = 0;
    let failCount = 0;
    const addedList = [];

    for (const token of tokenLines) {
      try {
        const testClient = new SelfClient({ checkUpdate: false });

        const accountData = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Giriş zaman aşımı')), 10000);

          testClient.once('ready', () => {
            clearTimeout(timer);
            const data = {
              username: testClient.user.tag,
              id: testClient.user.id,
            };
            testClient.destroy();
            resolve(data);
          });

          testClient.login(token).catch((err) => {
            clearTimeout(timer);
            reject(err);
          });
        });

        // Şifrele ve kaydet
        const encrypted = encrypt(token);
        encrypted.username = accountData.username;
        encrypted.accountUserId = accountData.id;
        encrypted.label = accountData.username;
        encrypted.status = 'pasif';

        saveToken(interaction.user.id, encrypted);
        successCount++;
        addedList.push(`🟢 | « **${accountData.username}** » | ( \`${accountData.id}\` ) havuza eklendi`);
      } catch (err) {
        failCount++;
      }
    }

    const currentTokens = getTokens(interaction.user.id);

    // Screenshot 4: Vault Güncellendi Embed
    const resultEmbed = new EmbedBuilder()
      .setColor(COLORS.vault)
      .setDescription([
        '📦 **Vault Güncellendi** ⬜ `Ücretsiz`',
        `🟢 **Eklenen:** \`${successCount}\` • 🔴 **Başarısız:** \`${failCount}\` • 📊 **Toplam:** \`${currentTokens.length}/5\``,
        '',
        addedList.join('\n') || '⚠️ Yeni hesap eklenemedi.',
      ].join('\n'))
      .setFooter({ text: 'REXAL SYSTEMS' });

    await interaction.editReply({
      content: null,
      embeds: [resultEmbed],
    });

    // Ana paneli de güncelle
    try {
      const updatedEmbed = createVaultEmbed(interaction.user, currentTokens);
      const updatedComp = createVaultComponents(currentTokens);
      await interaction.message.edit({ embeds: [updatedEmbed], components: updatedComp });
    } catch {}
  },

  // ── Hesap Seçim Menüsü ──────────────────────────────────────────────────
  async onSelect(interaction, actionParts) {
    // Panel sahibi değilse hesap seçemesin
    if (!checkPanelOwner(interaction)) return;

    const index = parseInt(interaction.values[0], 10);
    const tokens = getTokens(interaction.user.id);
    const token = tokens[index];

    if (!token) {
      return interaction.reply({ content: '❌ Hesap bulunamadı.', ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`aktif:durumsec:${index}:online`).setLabel('🟢 Online Yap').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`aktif:durumsec:${index}:idle`).setLabel('🟡 Boşta').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`aktif:durumsec:${index}:dnd`).setLabel('🔴 Rahatsız Etme').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`aktif:durumsec:${index}:invisible`).setLabel('⚪ Görünmez').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`aktif:kapat:${index}`).setLabel('⛔ Oturumu Kapat').setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
      content: `⚙️ **${token.username || token.label}** için işlem seçin:`,
      components: [row],
      ephemeral: true,
    });
  },
};
