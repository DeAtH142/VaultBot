
// src/commands/rolver.js
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { setUserSubscription } from '../utils/tokenStore.js';
import { parseDuration } from '../utils/timeParser.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

const AUTHORIZED_ADMINS = ['1160564359727173792'];

const PACKAGES = [
  { id: 'paket1', name: '1. Paket Mina 🏮', roleId: '1571141362076622912', capacity: 3 },
  { id: 'paket2', name: '2. Paket Sueda 🌲', roleId: '1571141360986234960', capacity: 7 },
  { id: 'paket3', name: '3. Paket Lidya 🌷', roleId: '1571141359258181652', capacity: 14 },
  { id: 'paket4', name: '4. Paket Hilal 💜', roleId: '1571141344418594951', capacity: 20 },
  { id: 'paket5', name: '5. Paket Zoktay ☄️', roleId: '1571141342845739159', capacity: 25 },
  { id: 'paket6', name: '6. Paket Esin 💛', roleId: '1571141341797290004', capacity: 50 }
];

export default {
  name: 'rolver',
  description: 'Kullanıcıya özel paket ver',
  async execute(message) {
    if (!AUTHORIZED_ADMINS.includes(message.author.id)) return message.reply('❌ Yetkiniz yok!');
    
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('rolver:selectuser').setPlaceholder('👤 Kullanıcı seç...')
        .addOptions(message.guild.members.cache.filter(m => !m.user.bot).map(m => ({ label: m.user.tag, value: m.user.id })).slice(0, 25))
    );
    await message.reply({ content: 'Lütfen rol vermek istediğiniz kullanıcıyı seçin.', components: [row] });
  },
  async onSelect(interaction, actionParts) {
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) return interaction.reply({ content: '❌ Yetkiniz yok!', ephemeral: true });
    if (actionParts[0] === 'selectuser') {
      const targetUserId = interaction.values[0];
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`rolver:selectpackage:${targetUserId}`).setPlaceholder('🎁 Paket seç...')
          .addOptions(PACKAGES.map(p => ({ label: p.name, value: p.id, description: `Kapasite: ${p.capacity}` })))
      );
      await interaction.reply({ content: `Hedef: <@${targetUserId}>\nŞimdi bir paket seçin.`, components: [row], ephemeral: true });
    } else if (actionParts[0] === 'selectpackage') {
      const targetUserId = actionParts[1];
      const pkg = PACKAGES.find(p => p.id === interaction.values[0]);
      const modal = new ModalBuilder().setCustomId(`rolver:duration:${targetUserId}:${pkg.id}`).setTitle('Süre Belirle');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('duration').setLabel('Süre (örn: 3 gün 20:00, 1 hafta)').setStyle(TextInputStyle.Short).setRequired(true)
      ));
      await interaction.showModal(modal);
    }
  },
  async onModalSubmit(interaction, actionParts) {
    const targetUserId = actionParts[1];
    const pkg = PACKAGES.find(p => p.id === actionParts[2]);
    const durationText = interaction.fields.getTextInputValue('duration');
    await interaction.reply({ content: '⏳ İşleniyor...', ephemeral: true });

    try {
      const expiresAt = parseDuration(durationText);
      const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      const role = interaction.guild.roles.cache.get(pkg.roleId);
      
      if (!member || !role) throw new Error('Kullanıcı veya Rol bulunamadı! (ID Kontrol Edin)');

      await member.roles.add(role.id);
      setUserSubscription(targetUserId, { type: pkg.name, expiresAt, capacity: pkg.capacity, roleId: role.id, guildId: interaction.guild.id });

      await interaction.editReply({ content: `✅ <@${targetUserId}> kullanıcısına **${pkg.name}** verildi.` });

      const user = await interaction.client.users.fetch(targetUserId);
      const dmEmbed = new EmbedBuilder().setColor(COLORS.gold).setTitle(`${E.crown} REXAL — Paket Aktif!`)
        .setDescription(`Tebrikler! **${role.name}** paketini aldın.\n> Kapasite: \`${pkg.capacity} Token\`\n> Süre: \`${durationText}\``);
      await user.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch (err) {
      await interaction.editReply({ content: `❌ Hata: ${err.message}` });
    }
  }
};
