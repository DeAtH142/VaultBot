// src/commands/rolver.js
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder
} from 'discord.js';
import { setUserSubscription } from '../utils/tokenStore.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

// ── YETKİLİ ADMİNLER (BURAYA KENDİ ID'LERİNİ YAZ) ──
const AUTHORIZED_ADMINS = [
  '1160564359727173792' // Kendi ID'ni buraya yaz kral!
];

// ── 6 ÖZEL PAKET AYARI (ROL ID'LERİNİ VE TOKEN LİMİTLERİNİ BURAYA YAZ) ──
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
  description: 'Kullanıcıya özel rol paketi ver ve vault kapasitesini artır (Admin)',

  async execute(message, args) {
    if (!AUTHORIZED_ADMINS.includes(message.author.id)) {
      return message.reply({ content: '❌ Bu komutu kullanma yetkiniz yok kral!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`${E.crown} REXAL — Premium Paket Verme Paneli`)
      .setDescription([
        `${THIN_DIVIDER}`,
        `> ${E.gear} **Yönetici:** <@${message.author.id}>`,
        '',
        `${E.info} **NASIL KULLANILIR?**`,
        '> 1️⃣ Aşağıdan kullanıcı seç',
        '> 2️⃣ Sunucudaki 6 özel paketten birini seç',
        '> 3️⃣ Süre belirle (örn: `1 hafta`, `infinite`)',
        '> 4️⃣ Sistem otomatik rol verir, kapasiteyi ayarlar ve DM atar!',
        '',
        `${THIN_DIVIDER}`,
      ].join('\n'))
      .setFooter(BRAND.footer('Admin Panel'))
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('rolver:selectuser')
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
      const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      
      if (!member) {
        return interaction.reply({ content: '❌ Bu kullanıcı sunucuda değil!', ephemeral: true });
      }

      // Rastgele roller yerine senin 6 paketini listeliyoruz
      const packageOptions = PACKAGES.map(p => ({
        label: p.name,
        value: p.id,
        description: `Kapasite: ${p.capacity} Token`,
        emoji: '🎁',
      }));

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`rolver:selectpackage:${targetUserId}`)
          .setPlaceholder('🎁 Paket seç...')
          .addOptions(packageOptions)
      );

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`${E.star} Kullanıcı Seçildi`)
        .setDescription(`> 👤 **Hedef:** <@${targetUserId}>\n\n📋 **Şimdi aşağıdan bir paket seç:**`)
        .setFooter(BRAND.footer());

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    else if (action === 'selectpackage') {
      const targetUserId = actionParts[1];
      const packageId = interaction.values[0];
      const selectedPackage = PACKAGES.find(p => p.id === packageId);

      if (!selectedPackage) {
        return interaction.reply({ content: '❌ Paket bulunamadı!', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId(`rolver:duration:${targetUserId}:${selectedPackage.id}`)
        .setTitle(`${selectedPackage.name} - Süre Belirle`);

      const durationInput = new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Ne kadar süre? (örn: 1 hafta, 3 gün, infinite)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1 hafta')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(durationInput));
      await interaction.showModal(modal);
    }
  },

  async onModalSubmit(interaction, actionParts) {
    const action = actionParts[0];
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Bu işlemi yapamazsın!', ephemeral: true });
    }

    if (action === 'duration') {
      const targetUserId = actionParts[1];
      const packageId = actionParts[2];
      const durationText = interaction.fields.getTextInputValue('duration').trim().toLowerCase();
      const selectedPackage = PACKAGES.find(p => p.id === packageId);

      await interaction.reply({ content: '⏳ İşleniyor...', ephemeral: true });

      try {
        let expiresAt = null;
        if (durationText === 'infinite' || durationText === 'sınırsız') {
          expiresAt = 'infinite';
        } else {
          const match = durationText.match(/(\d+)\s*(hafta|gün|ay|yıl|saat)/i);
          if (!match) {
            return interaction.editReply({ content: '❌ Geçersiz süre formatı! Örnek: `1 hafta`, `3 gün`' });
          }
          const amount = parseInt(match[1]);
          const unit = match[2].toLowerCase();
          let ms = 0;
          switch (unit) {
            case 'saat': ms = amount * 60 * 60 * 1000; break;
            case 'gün': ms = amount * 24 * 60 * 60 * 1000; break;
            case 'hafta': ms = amount * 7 * 24 * 60 * 60 * 1000; break;
            case 'ay': ms = amount * 30 * 24 * 60 * 60 * 1000; break;
            case 'yıl': ms = amount * 365 * 24 * 60 * 60 * 1000; break;
          }
          expiresAt = new Date(Date.now() + ms).toISOString();
        }

        const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        if (!member) return interaction.editReply({ content: '❌ Kullanıcı sunucuda bulunamadı!' });
        
        const role = interaction.guild.roles.cache.get(selectedPackage.roleId);
        if (!role) return interaction.editReply({ content: `❌ Rol ID'si (${selectedPackage.roleId}) sunucuda bulunamadı! Lütfen koddan kontrol et.` });

        // Rolü ver
        await member.roles.add(role.id).catch((err) => {
          throw new Error(`Rol verilemedi (Botun rolü bu rolün altında mı?): ${err.message}`);
        });

        // Aboneliği kaydet
        setUserSubscription(targetUserId, {
          type: selectedPackage.name,
          expiresAt,
          capacity: selectedPackage.capacity,
          roleId: role.id,
          guildId: interaction.guild.id,
        });

        const embed = new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(`${E.check} Paket Başarıyla Verildi!`)
          .setDescription([
            `${THIN_DIVIDER}`,
            `> 👤 **Kullanıcı:** <@${targetUserId}>`,
            `> 🎭 **Rol:** ${role}`,
            `> 📊 **Yeni Kapasite:** \`${selectedPackage.capacity} Token\``,
            `> ${E.clock} **Süre:** ${expiresAt === 'infinite' ? '`Sınırsız ∞`' : `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:R>`}`,
            `${THIN_DIVIDER}`,
          ].join('\n'))
          .setFooter(BRAND.footer('Rol Sistemi'))
          .setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });

        // İSTEDİĞİN DM MESAJI
        try {
          const user = await interaction.client.users.fetch(targetUserId);
          const userEmbed = new EmbedBuilder()
            .setColor(COLORS.gold)
            .setTitle(`${E.crown} REXAL — Premium Paket Aktif!`)
            .setDescription([
              `${THIN_DIVIDER}`,
              `> ${E.star} **Tebrikler!** **${role.name}** rolünü aldın!`,
              '',
              `> 🎭 **Paket:** ${selectedPackage.name}`,
              `> 📊 **Kapasite:** Artık vault'una \`${selectedPackage.capacity}\` adet hesap ekleyebilirsin!`,
              `> ${E.clock} **Geçerlilik:** ${expiresAt === 'infinite' ? '`Sınırsız ∞`' : `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:R>`}`,
              '',
              `${E.info} Vault sistemine giderek hesaplarını eklemeye başlayabilirsin. İyi kullanımlar!`,
              `${THIN_DIVIDER}`,
            ].join('\n'))
            .setFooter(BRAND.footer('Vault Sistemi'))
            .setTimestamp();

          await user.send({ embeds: [userEmbed] }).catch(() => console.log('Kullanıcıya DM atılamadı.'));
        } catch { }

      } catch (err) {
        await interaction.editReply({ content: `❌ Hata: ${err.message}` });
      }
    }
  },
};
