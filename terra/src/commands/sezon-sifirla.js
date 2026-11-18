// src/commands/sezon-sifirla.js — Yeni sezon başlat (sadece yetkililer)
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { collections } = require('../firebase');
const { resetSeason } = require('../game/power');
const { generateMapImage } = require('../game/map');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sezon-sifirla')
    .setDescription('Yeni sezon başlat (tüm kareler, güçler sıfırlanır)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guild.id;
    const season = await resetSeason(guildId);
    const guildDoc = (await collections.guilds.doc(guildId).get()).data() || {};

    const embed = new EmbedBuilder()
      .setTitle(`🎉 Sezon ${season} Başladı!`)
      .setDescription('Tüm harita sıfırlandı. Yeni fetheler sizleri bekliyor! İttifakını topla, güç kazan, fethet.')
      .setColor(0xf1c40f)
      .setFooter({ text: 'Daisy © 2026' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guver').setLabel('Güç Ver').setEmoji('🟢').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('saldir').setLabel('Saldır').setEmoji('🔴').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('siralama').setLabel('Sıralama').setEmoji('🏆').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('harita').setLabel('Harita').setEmoji('🗺️').setStyle(ButtonStyle.Secondary),
    );

    // Haritayı da güncelle
    const attachment = await generateMapImage(guildId, guildDoc);
    embed.setImage('attachment://harita.png');
    if (guildDoc.channelId) {
      const channel = await interaction.client.channels.fetch(guildDoc.channelId).catch(() => null);
      if (channel) await channel.send({ embeds: [embed], files: [attachment], components: [row] }).catch(() => {});
    }
    return interaction.editReply({ content: `✅ Sezon **${season}** başlatıldı! Tüm territories ve güçler sıfırlandı.` });
  },
};
