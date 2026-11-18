// src/commands/kurulum.js — Sunucu sahibi harita kanalını seçer ve oyunu kurar
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { collections, FieldValue } = require('../firebase');
const { initTerritories, MAP_SIZES } = require('../utils/schemas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kurulum')
    .setDescription('Haritanın atılacağı kanalı seç ve oyunu kur')
    .addChannelOption(o => o.setName('kanal').setDescription('Harita kanalı').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('boyut').setDescription('Harita boyutu').addChoices(
      { name: 'Küçük (10x10)', value: 'kucuk' },
      { name: 'Orta (15x15)', value: 'orta' },
      { name: 'Büyük (20x20)', value: 'buyuk' }))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (interaction.guild.ownerId !== interaction.user.id && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Bu komut sadece sunucu sahibi/yetkili içindir.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('kanal');
    const size = interaction.options.getString('boyut') || 'orta';
    const guildId = interaction.guild.id;

    await collections.guilds.doc(guildId).set({
      channelId: channel.id,
      mapSize: MAP_SIZES[size],
      gameEnabled: true,
      season: FieldValue.increment(0), // mevcut sezonu koru
    }, { merge: true });
    await initTerritories(guildId, MAP_SIZES[size]);

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Sezon 1 — Terra Strateji')
      .setDescription(
        '**Kurallar:**\n' +
        '🟢 **Güç Ver** → Güç toplama (5 dakikada +1)\n' +
        '🔴 **Saldır** → Komşu kareye saldır (15 sn cooldown)\n' +
        '🏆 **Sıralama** → Liderlik tablosu\n' +
        '🗺️ **Harita** → Haritayı yenile\n' +
        '🏰 **Klan Kur** → Kendi klanını kur (kategori + 3 kanal + 2 rol)\n\n' +
        'Bir ittifaka katıl, güç topla, kareler fethet!'
      )
      .setColor(0x2b2d31)
      .setImage('attachment://harita.png')
      .setFooter({ text: 'Daisy © 2026' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guver').setLabel('Güç Ver').setEmoji('🟢').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('saldir').setLabel('Saldır').setEmoji('🔴').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('siralama').setLabel('Sıralama').setEmoji('🏆').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('harita').setLabel('Harita').setEmoji('🗺️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('klankur').setLabel('Klan Kur').setEmoji('🏰').setStyle(ButtonStyle.Secondary),
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    await collections.guilds.doc(guildId).update({ 'messageIds.map': msg.id });
    return interaction.reply({ content: `✅ Kurulum tamam! Harita ${channel} kanalına gönderildi.`, ephemeral: true });
  },
};
