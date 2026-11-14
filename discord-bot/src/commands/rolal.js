// src/commands/rolal.js
import {
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { setUserSubscription, getUserSubscription, scanAndCleanInvalidTokens } from '../utils/tokenStore.js';
import { Client as SelfClient } from 'discord.js-selfbot-v13';
import { decrypt } from '../utils/crypto.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

// ── YETKİLİ ADMİNLER (BURAYA KENDİ ID'LERİNİ YAZ) ──
const AUTHORIZED_ADMINS = [
  '1160564359727173792', // Kendi ID'ni buraya yaz kral!
];

export default {
  name: 'rolal',
  description: 'Kullanıcıdan rolü al, tokenlerini scan et ve kapasiteyi düşür (Admin)',

  async execute(message, args) {
    if (!AUTHORIZED_ADMINS.includes(message.author.id)) {
      return message.reply({ content: '❌ Bu komutu kullanma yetkiniz yok!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.danger)
      .setTitle(`${E.trash} REXAL — Rol Alma Paneli`)
      .setDescription([
        `${THIN_DIVIDER}`,
        `> ${E.gear} **Yönetici:** <@${message.author.id}>`,
        '',
        `${E.info} **NASIL KULLANILIR?**`,
        '> 1️⃣ Aşağıdan kullanıcı seç',
        '> 2️⃣ Rolü al butonuna tıkla',
        '> 3️⃣ Sistem rolü alır, tokenleri tarar ve ücretsize düşürür.',
        '',
        `${THIN_DIVIDER}`,
      ].join('\n'))
      .setFooter(BRAND.footer('Admin Panel'))
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('rolal:selectuser')
        .setPlaceholder('👤 Kullanıcı seç...')
        .addOptions(
          message.guild.members.cache
            .filter(m => !m.user.bot)
            .map(m => ({
              label: m.user.tag,
              value: m.user.id,
              description: `ID: ${m.user.id}`,
              emoji: '👤',
            }))
            .slice(0, 25)
        )
    );

    await message.reply({ embeds: [embed], components: [row] });
  },

  async onSelect(interaction, actionParts) {
    const action = actionParts[0];
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Bu paneli kullanamazsın!', ephemeral: true });
    }

    if (action === 'selectuser') {
      const targetUserId = interaction.values[0];
      const sub = getUserSubscription(targetUserId);

      if (!sub.roleId || sub.type === 'Ücretsiz') {
        const embed = new EmbedBuilder()
          .setColor(COLORS.gray)
          .setTitle(`${E.info} Bilgi`)
          .setDescription(`> 👤 **Kullanıcı:** <@${targetUserId}>\n\n${E.warning} Bu kullanıcının aktif bir rolü yok.\n> Şu anki paket: \`${sub.type}\``)
          .setFooter(BRAND.footer());
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const role = interaction.guild.roles.cache.get(sub.roleId);
      const roleName = role ? role.name : sub.type;

      const embed = new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle(`${E.warning} Rol Alma Onayı`)
        .setDescription([
          `${THIN_DIVIDER}`,
          `> 👤 **Kullanıcı:** <@${targetUserId}>`,
          `> 🎭 **Mevcut Rol:** ${role ? role : `\`${sub.type}\``}`,
          `> 📊 **Mevcut Kapasite:** \`${sub.capacity || 2}\``,
          '',
          `${E.warning} **YAPILACAKLAR:**`,
          `> ⚠️ Rolü Discord'dan alınacak`,
          `> 🔍 Tüm tokenleri scan edilecek`,
          `> 📉 Kapasite 2'ye düşürülecek`,
          `${THIN_DIVIDER}`,
        ].join('\n'))
        .setFooter(BRAND.footer('Dikkatli Ol'));

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rolal:confirm:${targetUserId}`).setLabel('✅ Onayla ve Rolü Al').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`rolal:cancel`).setLabel('❌ İptal').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
  },

  async onButton(interaction, actionParts) {
    const action = actionParts[0];
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Bu işlemi yapamazsın!', ephemeral: true });
    }

    if (action === 'cancel') {
      await interaction.update({ content: '❌ İşlem iptal edildi.', embeds: [], components: [] });
      return;
    }

    if (action === 'confirm') {
      const targetUserId = actionParts[1];
      await interaction.update({ content: '⏳ İşleniyor... Tokenler scan ediliyor...', embeds: [], components: [] });

      try {
        const sub = getUserSubscription(targetUserId);

        const testToken = async (tokenObj) => {
          try {
            const raw = decrypt(tokenObj);
            const testClient = new SelfClient({ checkUpdate: false });
            const isValid = await new Promise((resolve) => {
              const timer = setTimeout(() => resolve(false), 7000);
              testClient.once('ready', () => { clearTimeout(timer); testClient.destroy(); resolve(true); });
              testClient.login(raw).catch(() => { clearTimeout(timer); resolve(false); });
            });
            return isValid;
          } catch { return false; }
        };

        const result = await scanAndCleanInvalidTokens(targetUserId, testToken);

        const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        if (member && sub.roleId) {
          await member.roles.remove(sub.roleId).catch(() => { });
        }

        setUserSubscription(targetUserId, {
          type: 'Ücretsiz',
          expiresAt: null,
          capacity: 2,
          roleId: null,
          guildId: null,
        });

        const embed = new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(`${E.check} Rol Başarıyla Alındı!`)
          .setDescription([
            `${THIN_DIVIDER}`,
            `> 👤 **Kullanıcı:** <@${targetUserId}>`,
            `> 🎭 **Alınan Rol:** \`${sub.type}\``,
            `> ✅ **Geçerli Token:** \`${result.valid}\``,
            `> 🗑️ **Silinen Geçersiz Token:** \`${result.cleaned}\``,
            `> 📊 **Yeni Kapasite:** \`2\``,
            `${THIN_DIVIDER}`,
          ].join('\n'))
          .setFooter(BRAND.footer('Rol Sistemi')).setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });

        // İSTEDİĞİN DM MESAJI (Rol Alınınca)
        try {
          const user = await interaction.client.users.fetch(targetUserId);
          const userEmbed = new EmbedBuilder()
            .setColor(COLORS.danger)
            .setTitle(`${E.warning} REXAL — Paket Süren Doldu!`)
            .setDescription([
              `${THIN_DIVIDER}`,
              `> ${E.info} Üzgünüm, **${sub.type}** rolünün süresi doldu veya kaldırıldı.`,
              '',
              `> 🎭 **Alınan Rol:** ${sub.type}`,
              `> 🏷️ **Yeni Paket:** \`Ücretsiz\``,
              `> 📊 **Yeni Kapasite:** Artık vault'una sadece \`2\` hesap ekleyebilirsin.`,
              '',
              `${E.warning} **TOKEN TEMİZLİĞİ:**`,
              `> Geçersiz tokenlerin temizlendi. (Silinen: ${result.cleaned})`,
              `${THIN_DIVIDER}`,
            ].join('\n'))
            .setFooter(BRAND.footer('Vault Sistemi')).setTimestamp();

          await user.send({ embeds: [userEmbed] }).catch(() => { });
        } catch { }

      } catch (err) {
        await interaction.editReply({ content: `❌ Hata: ${err.message}`, embeds: [] });
      }
    }
  },
};
