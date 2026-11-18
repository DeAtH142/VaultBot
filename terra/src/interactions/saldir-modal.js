// src/interactions/saldir-modal.js — Saldırı modalı gönderimi
const { EmbedBuilder } = require('discord.js');
const { attack } = require('../game/combat');

module.exports = {
  customId: 'saldir_modal',
  type: 'modal',
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const x = parseInt(interaction.fields.getTextInputValue('x'), 10);
    const y = parseInt(interaction.fields.getTextInputValue('y'), 10);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      return interaction.editReply({ content: '❌ Geçersiz koordinat.' });
    }
    const result = await attack({ guildId: interaction.guild.id, playerId: interaction.user.id, targetX: x, targetY: y });

    const embed = new EmbedBuilder()
      .setColor(result.ok && result.won ? 0x2ecc71 : result.ok ? 0xe74c3c : 0x95a5a6)
      .setFooter({ text: 'Daisy © 2026' });
    if (!result.ok) embed.setTitle('❌ Saldırı Gerçekleşmedi').setDescription(result.reason);
    else if (result.won) embed.setTitle('⚔️ Zafer!').setDescription(`**(${x}, ${y})** karesi ittifakının oldu!\nGücün: **${result.attackerPower}** → savunma **${result.defenderPower}** karşısında kazandı. Gücün yarıya düştü.`);
    else embed.setTitle('🛡️ Saldırı Başarısız').setDescription(`**(${x}, ${y})** karesi savunuldu! Kaybedilen güç: **-${result.lost}**`);
    return interaction.editReply({ embeds: [embed] });
  },
};
