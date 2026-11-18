// src/commands/ayarlar.js — Admin yönetim komutu (Administrator yetkisi gerekir)
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { collections, db } = require('../firebase');
const { MAP_SIZES, initTerritories } = require('../utils/schemas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ayarlar')
    .setDescription('Oyun ayarlarını yönet (Yetkili)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('baslat').setDescription('Oyunu başlat'))
    .addSubcommand(s => s.setName('durdur').setDescription('Oyunu durdur'))
    .addSubcommand(s => s.setName('boyut').setDescription('Harita boyutunu değiştir')
      .addStringOption(o => o.setName('secim').setDescription('Boyut').setRequired(true).addChoices(
        { name: 'Küçük (10x10)', value: 'kucuk' },
        { name: 'Orta (15x15)', value: 'orta' },
        { name: 'Büyük (20x20)', value: 'buyuk' })))
    .addSubcommand(s => s.setName('arkaplan').setDescription('Oyun logosu / arka plan resmi URL tanımla')
      .addStringOption(o => o.setName('url').setDescription('Resim URL (boş bırak = kaldır)'))),

  async execute(interaction) {
    const guildRef = collections.guilds.doc(interaction.guild.id);
    const sub = interaction.options.getSubcommand();

    if (sub === 'baslat') {
      await guildRef.set({ gameEnabled: true }, { merge: true });
      return interaction.reply({ content: '▶️ Oyun başlatıldı!', ephemeral: true });
    }
    if (sub === 'durdur') {
      await guildRef.set({ gameEnabled: false }, { merge: true });
      return interaction.reply({ content: '⏸️ Oyun durduruldu.', ephemeral: true });
    }
    if (sub === 'boyut') {
      const v = interaction.options.getString('secim');
      await guildRef.set({ mapSize: MAP_SIZES[v] }, { merge: true });
      await initTerritories(interaction.guild.id, MAP_SIZES[v]);
      return interaction.reply({ content: `📐 Harita boyutu **${MAP_SIZES[v]}x${MAP_SIZES[v]}** olarak ayarlandı ve harita sıfırlandı.`, ephemeral: true });
    }
    if (sub === 'arkaplan') {
      const url = interaction.options.getString('url');
      await guildRef.set({ bgUrl: url || null }, { merge: true });
      return interaction.reply({ content: url ? '🖼️ Arka plan resmi kaydedildi. Harita yenilendiğinde görünecek.' : '🧹 Arka plan resmi kaldırıldı.', ephemeral: true });
    }
  },
};
