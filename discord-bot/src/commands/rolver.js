// src/commands/rolver.js
import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { setUserSubscription, getUserSubscription } from '../utils/tokenStore.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

// Yetkili admin ID'leri (istediğin 2 ID'yi buraya gir)
const AUTHORIZED_ADMINS = [
  '123456789012345678', // ID 1
  '876543210987654321', // ID 2
];

export default {
  name: 'rolver',
  description: 'Kullanıcıya özel rol paketi ver ve vault kapasitesini artır (Admin)',

  async execute(message, args) {
    // Yetki kontrolü
    if (!AUTHORIZED_ADMINS.includes(message.author.id)) {
      return message.reply({
        content: '❌ Bu komutu kullanma yetkiniz yok!',
        ephemeral: true
      });
    }

    // Kullanım: !rolver
    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`${E.crown} REXAL — Rol Verme Paneli`)
      .setDescription([
        `${THIN_DIVIDER}`,
        `> ${E.gear} **Yönetici:** <@${message.author.id}>`,
        '',
        `${E.info} **NASIL KULLANILIR?**`,
        '> 1️⃣ Aşağıdaki butona tıkla',
        '> 2️⃣ Kullanıcı seç',
        '> 3️⃣ Rol seç (sunucundaki roller)',
        '> 4️⃣ Süre belirle (örn: `1 hafta`, `3 gün`, `infinite`)',
        '> 5️⃣ Sistem otomatik rol verir ve kapasiteyi artırır',
        '',
        `${E.star} **ÖZELLİKLER**`,
        `> • Her rol +2 kapasite verir (varsayılan 2 → 4'e çıkar)`,
        `> • Rol otomatik olarak sunucuda verilir`,
        `> • Kullanıcı sunucuda olmalı (auto-register)`,
        `> • Süre dolunca otomatik ücretsiz'e döner`,
        `> • \`infinite\` yazarsan sınırsız olur`,
        `> • Rol silinirse otomatik scan olur`,
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
            .slice(0, 25) // Max 25 seçenek
        )
    );

    await message.reply({ embeds: [embed], components: [row] });
  },

  async onSelect(interaction, actionParts) {
    const action = actionParts[0];

    // Yetki kontrolü
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Bu paneli kullanamazsın!',
        ephemeral: true
      });
    }

    if (action === 'selectuser') {
      const targetUserId = interaction.values[0];

      // Kullanıcının sunucuda olup olmadığını kontrol et
      const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      if (!member) {
        return interaction.reply({
          content: '❌ Bu kullanıcı sunucuda değil! Rol verebilmek için kullanıcı sunucuda olmalı.',
          ephemeral: true,
        });
      }

      // Sunucudaki rolleri getir (everyone hariç)
      const roles = interaction.guild.roles.cache
        .filter(r => r.id !== interaction.guild.id && !r.managed)
        .sort((a, b) => b.position - a.position)
        .map(r => ({
          label: r.name,
          value: r.id,
          description: `Pozisyon: ${r.position}`,
          emoji: '🎭',
        }))
        .slice(0, 25);

      if (roles.length === 0) {
        return interaction.reply({
          content: '❌ Bu sunucuda verilecek rol bulunamadı!',
          ephemeral: true,
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`rolver:selectrole:${targetUserId}`)
          .setPlaceholder('🎭 Rol seç...')
          .addOptions(roles)
      );

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`${E.star} Kullanıcı Seçildi`)
        .setDescription([
          `> 👤 **Hedef:** <@${targetUserId}>`,
          '',
          '📋 **Şimdi aşağıdan bir rol seç:**',
        ].join('\n'))
        .setFooter(BRAND.footer());

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    else if (action === 'selectrole') {
      const targetUserId = actionParts[1];
      const roleId = interaction.values[0];
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          content: '❌ Rol bulunamadı!',
          ephemeral: true,
        });
      }

      // Modal aç - süre gir
      const modal = new ModalBuilder()
        .setCustomId(`rolver:duration:${targetUserId}:${roleId}`)
        .setTitle('Süre Belirle');

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

    // Yetki kontrolü
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Bu işlemi yapamazsın!',
        ephemeral: true
      });
    }

    if (action === 'duration') {
      const targetUserId = actionParts[1];
      const roleId = actionParts[2];
      const durationText = interaction.fields.getTextInputValue('duration').trim().toLowerCase();

      await interaction.reply({
        content: '⏳ İşleniyor...',
        ephemeral: true
      });

      try {
        // Süreyi hesapla
        let expiresAt = null;
        if (durationText === 'infinite' || durationText === 'sınırsız') {
          expiresAt = 'infinite';
        } else {
          const match = durationText.match(/(\d+)\s*(hafta|gün|ay|yıl|saat)/i);
          if (!match) {
            return interaction.editReply({
              content: '❌ Geçersiz süre formatı! Örnek: `1 hafta`, `3 gün`, `infinite`',
            });
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

        // Rol adını al
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
          return interaction.editReply({ content: '❌ Rol bulunamadı!' });
        }

        // Kullanıcıya rolü ver (auto-register)
        const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        if (!member) {
          return interaction.editReply({ 
            content: '❌ Kullanıcı sunucuda bulunamadı! Rol verilemedi.' 
          });
        }
        
        await member.roles.add(roleId).catch((err) => {
          throw new Error(`Rol verilemedi: ${err.message}`);
        });

        // Abonelik bilgisini güncelle
        setUserSubscription(targetUserId, {
          type: role.name,
          expiresAt,
          capacity: 4, // Her rol +2 kapasite (varsayılan 2 + 2 = 4)
          roleId,
          guildId: interaction.guild.id,
        });

        console.log(`👑 [RolVer] Kullanıcı ${targetUserId} → Rol: ${role.name} → Kapasite: 4 → Süre: ${expiresAt === 'infinite' ? 'Sınırsız' : expiresAt}`);

        const embed = new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(`${E.check} Rol Başarıyla Verildi!`)
          .setDescription([
            `${THIN_DIVIDER}`,
            `> 👤 **Kullanıcı:** <@${targetUserId}>`,
            `> 🎭 **Rol:** ${role}`,
            `> 📊 **Yeni Kapasite:** \`4 token\` (2 → 4)`,
            `> ${E.clock} **Süre:** ${expiresAt === 'infinite' ? '`Sınırsız ∞`' : `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:R>`}`,
            '',
            `${E.star} Kullanıcı artık kasasına 4'e kadar token ekleyebilir!`,
            `${THIN_DIVIDER}`,
          ].join('\n'))
          .setFooter(BRAND.footer('Rol Sistemi'))
          .setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });

        // Kullanıcıya bildirim gönder
        try {
          const user = await interaction.client.users.fetch(targetUserId);
          const userEmbed = new EmbedBuilder()
            .setColor(COLORS.gold)
            .setTitle(`${E.crown} REXAL — Premium Paket Aktif!`)
            .setDescription([
              `${THIN_DIVIDER}`,
              `> ${E.star} **Tebrikler!** Sana özel bir paket verildi.`,
              '',
              `> 🎭 **Paket:** ${role.name}`,
              `> 📊 **Kapasite:** \`4 token\` (eskiden 2)`,
              `> ${E.clock} **Geçerlilik:** ${expiresAt === 'infinite' ? '`Sınırsız ∞`' : `<t:${Math.floor(new Date(expiresAt).getTime() / 1000)}:R>`}`,
              '',
              `${E.info} Artık kasana 4'e kadar token ekleyebilirsin!`,
              `${THIN_DIVIDER}`,
            ].join('\n'))
            .setFooter(BRAND.footer('Premium Sistem'))
            .setTimestamp();

          await user.send({ embeds: [userEmbed] }).catch(() => { });
        } catch { }

      } catch (err) {
        console.error('Rol verme hatası:', err);
        await interaction.editReply({
          content: `❌ Hata: ${err.message}`
        });
      }
    }
  },
};
