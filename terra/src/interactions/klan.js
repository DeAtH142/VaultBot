// src/interactions/klan.js — 🏰 Klan Kur butonu + klan adı modalı
const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { collections, FieldValue } = require('../firebase');
const { createKlan } = require('../utils/klan');

// 🏰 Klan Kur butonu → modal aç
const klanKur = {
  customId: 'klankur',
  type: 'button',
  async execute(interaction) {
    // Kontrol paneli mesajının atıldığı guild içi herkes kullanabilir
    const guildDoc = await collections.guilds.doc(interaction.guild.id).get();
    if (!guildDoc.exists || !guildDoc.data().gameEnabled) {
      return interaction.reply({ content: '⏸️ Oyun şu anda kapalı. Yetkililer `/ayarlar baslat` ile açabilir.', ephemeral: true });
    }
    const modal = new ModalBuilder().setCustomId('klankur_modal').setTitle('🏰 Klan Kur');
    const nameInput = new TextInputBuilder()
      .setCustomId('klan_adi')
      .setLabel('Klanının adı ne olsun?')
      .setStyle(TextInputStyle.Short)
      .setMinLength(2)
      .setMaxLength(30)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    return interaction.showModal(modal);
  },
};

// Klan adı modalı gönderimi → klanı kur
const klanKurModal = {
  customId: 'klankur_modal',
  type: 'modal',
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.fields.getTextInputValue('klan_adi').trim();
    const result = await createKlan({
      guild: interaction.guild,
      name,
      ownerId: interaction.user.id,
    });
    if (!result.ok) {
      return interaction.editReply({ content: `❌ ${result.reason}` });
    }
    const embed = new EmbedBuilder()
      .setTitle('🏰 Klanın Kuruldu!')
      .setDescription(`**${name}** klanı kuruldu kral! 👑\nKategori en altta — sohbet, sesli ve haberler kanalları orada.`)
      .setColor(0x5865f2)
      .setFooter({ text: 'Daisy © 2026' });
    return interaction.editReply({ embeds: [embed] });
  },
};

module.exports = [klanKur, klanKurModal];
