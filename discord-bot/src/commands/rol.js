// src/commands/rol.js
import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { setUserSubscription } from '../utils/tokenStore.js';
import { parseDuration } from '../utils/timeParser.js';
import { COLORS, BRAND, E, THIN_DIVIDER , errorEmbed, infoEmbed } from '../utils/embeds.js';
import { PACKAGES } from '../../config/rexal.config.js';

const AUTHORIZED_ADMINS = ['1160564359727173792'];

export default {
  name: 'rol',
  description: 'Butonlu form ile rol ver (Admin)',
  
  async execute(message) {
    if (!AUTHORIZED_ADMINS.includes(message.author.id)) return message.reply({ embeds: [errorEmbed('❌ Yetkin yok!')] });

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('🎭 REXAL — Hızlı Rol Verme')
      .setDescription('Aşağıdaki menüden rolü seç, ardından açılacak formu doldur.');

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('rol:selectrole')
        .setPlaceholder('🎭 Bir Rol Seçin...')
        .addOptions(
          PACKAGES
            .map(p => {
              const r = message.guild.roles.cache.get(p.roleId);
              return r ? ({ label: r.name, value: r.id, emoji: '🎭', description: `Kapasite: ${p.capacity}` }) : null;
            })
            .filter(Boolean)
        )
    );
    await message.reply({ embeds: [embed], components: [row] });
  },

  async onSelect(interaction, actionParts) {
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) return interaction.reply({ content: '❌ Yetkin yok!', ephemeral: true });

    if (actionParts[0] === 'selectrole') {
      const roleId = interaction.values[0];
      const modal = new ModalBuilder()
        .setCustomId(`rol:modal:${roleId}`)
        .setTitle('Rol Verme Formu');

      const userInput = new TextInputBuilder()
        .setCustomId('userId')
        .setLabel('Kullanıcı ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const durationInput = new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Süre (örn: 3 gün 20:00 veya 1 hafta)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(userInput),
        new ActionRowBuilder().addComponents(durationInput)
      );
      await interaction.showModal(modal);
    }
  },

  async onModalSubmit(interaction, actionParts) {
    const roleId = actionParts[1];
    const userId = interaction.fields.getTextInputValue('userId');
    const durationText = interaction.fields.getTextInputValue('duration');

    await interaction.reply({ content: '⏳ İşleniyor...', ephemeral: true });

    try {
      const expiresAt = parseDuration(durationText);
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      const role = interaction.guild.roles.cache.get(roleId);

      if (!member) throw new Error('Kullanıcı sunucuda bulunamadı!');
      if (!role) throw new Error('Rol bulunamadı!');

      await member.roles.add(role.id);

      setUserSubscription(userId, {
        type: role.name,
        expiresAt,
        capacity: (PACKAGES.find(p => p.roleId === roleId)?.capacity) || 4,
        roleId: role.id,
        guildId: interaction.guild.id,
      });

      await interaction.editReply({ content: `✅ <@${userId}> kullanıcısına **${role.name}** rolü verildi. Süre: ${durationText}` });

      // DM Gönder
      const user = await interaction.client.users.fetch(userId);
      const dmEmbed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`${E.crown} REXAL — Rolün Verildi!`)
        .setDescription(`Tebrikler! **${role.name}** rolün başarıyla hesabına tanımlandı.\nSüre: \`${durationText}\``);
      await user.send({ embeds: [dmEmbed] }).catch(() => {});
      
    } catch (err) {
      await interaction.editReply({ content: `❌ Hata: ${err.message}` });
    }
  }
};
