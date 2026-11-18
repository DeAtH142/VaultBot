// src/commands/saldir.js — /saldir komutu ile koordinatlı saldırı
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { collections } = require('../firebase');
const { attack } = require('../game/combat');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('saldir')
    .setDescription('Komşu bir kareye saldır')
    .addIntegerOption(o => o.setName('x').setDescription('X koordinatı').setRequired(true).setMinValue(0).setMaxValue(19))
    .addIntegerOption(o => o.setName('y').setDescription('Y koordinatı').setRequired(true).setMinValue(0).setMaxValue(19)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const x = interaction.options.getInteger('x');
    const y = interaction.options.getInteger('y');
    const result = await attack({
      guildId: interaction.guild.id,
      playerId: interaction.user.id,
      targetX: x, targetY: y,
    });

    const embed = new EmbedBuilder()
      .setColor(result.ok && result.won ? 0x2ecc71 : result.ok ? 0xe74c3c : 0x95a5a6)
      .setFooter({ text: 'Daisy © 2026' });

    if (!result.ok) {
      embed.setTitle('❌ Saldırı Gerçekleşmedi').setDescription(result.reason);
    } else if (result.won) {
      embed.setTitle('⚔️ Zafer!')
        .setDescription(`**(${x}, ${y})** karesi ittifakının oldu!\n\nSaldırı Gücü: **${result.attackerPower}**\nSavunma Gücü: **${result.defenderPower}**\n\nGücün saldırıda yarıya düştü.`);
    } else {
      embed.setTitle('🛡️ Saldırı Başarısız')
        .setDescription(`**(${x}, ${y})** karesi savunuldu!\n\nSaldırı Gücü: **${result.attackerPower}**\nSavunma Gücü: **${result.defenderPower}**\n\nKaybedilen güç: **-${result.lost}**`);
    }
    return interaction.editReply({ embeds: [embed] });
  },
};
