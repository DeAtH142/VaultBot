// src/commands/tokensil.js
import { deleteToken, getTokens } from '../utils/tokenStore.js';
import { tokenDeletedEmbed, errorEmbed } from '../utils/embeds.js';
import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';

export default {
  name: 'tokensil',
  aliases: ['deltoken', 'removetoken'],
  description: 'Kayıtlı bir tokeni siler.',

  async execute(message) {
    const tokens = getTokens(message.author.id);
    if (tokens.length === 0) {
      return message.reply({ embeds: [errorEmbed('Kayıtlı tokeniniz bulunmuyor.')] });
    }

    const options = tokens.map((t, i) => ({
      label: t.label,
      description: `Eklenme: ${new Date(t.addedAt).toLocaleDateString('tr-TR')} • ${t.status}`,
      value: String(i),
      emoji: t.status === 'aktif' ? '🟢' : '⚫',
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('tokensil:select')
        .setPlaceholder('🗑️ Silmek istediğin hesabı seç...')
        .addOptions(options),
    );

    await message.reply({ content: '**Silmek istediğin hesabı seç:**', components: [row] });
  },

  async onSelect(interaction) {
    const index = parseInt(interaction.values[0], 10);
    const tokens = getTokens(interaction.user.id);
    const token = tokens[index];

    if (!token) {
      return interaction.update({ content: '❌ Token bulunamadı.', components: [] });
    }

    const label = token.label;
    deleteToken(interaction.user.id, index);

    await interaction.update({
      content: null,
      embeds: [tokenDeletedEmbed(interaction.user, label)],
      components: [],
    });
  },
};
