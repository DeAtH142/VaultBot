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

// Yetkili admin ID'leri
const AUTHORIZED_ADMINS = [
  '123456789012345678', // ID 1
  '876543210987654321', // ID 2
];

export default {
  name: 'rolal',
  description: 'Kullanıcıdan rolü al, tokenlerini scan et ve kapasiteyi düşür (Admin)',

  async execute(message, args) {
    // Yetki kontrolü
    if (!AUTHORIZED_ADMINS.includes(message.author.id)) {
      return message.reply({
        content: '❌ Bu komutu kullanma yetkiniz yok!',
        ephemeral: true
      });
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
        '> 2️⃣ Eğer kullanıcının rolü varsa gösterilir',
        '> 3️⃣ Rolü al butonuna tıkla',
        '> 4️⃣ Sistem otomatik:',
        '>     • Rolü Discord\'dan alır',
        '>     • Tüm tokenlerini scan eder',
        '>     • Geçersizleri siler',
        '>     • Kapasiteyi 2\'ye düşürür',
        '',
        `${E.warning} **DİKKAT**`,
        `> Bu işlem geri alınamaz!`,
        `> Geçersiz tokenler silinecek!`,
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

    // Yetki kontrolü
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Bu paneli kullanamazsın!',
        ephemeral: true
      });
    }

    if (action === 'selectuser') {
      const targetUserId = interaction.values[0];
      const sub = getUserSubscription(targetUserId);

      // Eğer rolü yoksa
      if (!sub.roleId || sub.type === 'Ücretsiz') {
        const embed = new EmbedBuilder()
          .setColor(COLORS.gray)
          .setTitle(`${E.info} Bilgi`)
          .setDescription([
            `> 👤 **Kullanıcı:** <@${targetUserId}>`,
            '',
            `${E.warning} Bu kullanıcının aktif rolü yok.`,
            `> Şu anki paket: \`${sub.type}\``,
            `> Kapasite: \`${sub.capacity || 2}\``,
          ].join('\n'))
          .setFooter(BRAND.footer());

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // Rolü varsa göster ve onay iste
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
          `> ${E.clock} **Süre:** ${sub.expiresAt === 'infinite' ? '`Sınırsız`' : sub.expiresAt ? `<t:${Math.floor(new Date(sub.expiresAt).getTime() / 1000)}:R>` : '`—`'}`,
          '',
          `${E.warning} **YAPILACAKLAR:**`,
          `> ⚠️ Rolü Discord'dan alınacak`,
          `> 🔍 Tüm tokenleri scan edilecek`,
          `> 🗑️ Geçersiz tokenler silinecek`,
          `> 📉 Kapasite 2'ye düşürülecek`,
          '',
          `${E.cross} **Bu işlem geri alınamaz!**`,
          `${THIN_DIVIDER}`,
        ].join('\n'))
        .setFooter(BRAND.footer('Dikkatli Ol'));

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rolal:confirm:${targetUserId}`)
          .setLabel('✅ Onayla ve Rolü Al')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`rolal:cancel`)
          .setLabel('❌ İptal')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
  },

  async onButton(interaction, actionParts) {
    const action = actionParts[0];

    // Yetki kontrolü
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Bu işlemi yapamazsın!',
        ephemeral: true
      });
    }

    if (action === 'cancel') {
      await interaction.update({
        content: '❌ İşlem iptal edildi.',
        embeds: [],
        components: [],
      });
      return;
    }

    if (action === 'confirm') {
      const targetUserId = actionParts[1];

      await interaction.update({
        content: '⏳ İşleniyor... Tokenler scan ediliyor...',
        embeds: [],
        components: [],
      });

      try {
        const sub = getUserSubscription(targetUserId);

        // Token scan fonksiyonu
        const testToken = async (tokenObj) => {
          try {
            const raw = decrypt(tokenObj);
            const testClient = new SelfClient({ checkUpdate: false });

            const isValid = await new Promise((resolve) => {
              const timer = setTimeout(() => resolve(false), 7000);
              testClient.once('ready', () => {
                clearTimeout(timer);
                testClient.destroy();
                resolve(true);
              });
              testClient.login(raw).catch(() => {
                clearTimeout(timer);
                resolve(false);
              });
            });

            return isValid;
          } catch {
            return false;
          }
        };

        // Tokenlerini scan et ve temizle
        const result = await scanAndCleanInvalidTokens(targetUserId, testToken);

        // Discord'dan rolü al
        const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        if (member && sub.roleId) {
          await member.roles.remove(sub.roleId).catch(() => { });
        console.log(`🗑️ [RolAl] Kullanıcı ${targetUserId} → Rol silindi: ${sub.type}`);
        }

        // Aboneliği ücretsiz'e çevir
        setUserSubscription(targetUserId, {
        type: 'Ücretsiz',
        expiresAt: null,
        capacity: 2,
        roleId: null,
        guildId: null,
        });

        console.log(`🗑️ [RolAl] Kullanıcı ${targetUserId} → Ücretsiz'e düşürüldü → Geçerli: ${result.valid}, Silinen: ${result.cleaned}`);

        const embed = new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(`${E.check} Rol Başarıyla Alındı!`)
          .setDescription([
            `${THIN_DIVIDER}`,
            `> 👤 **Kullanıcı:** <@${targetUserId}>`,
            `> 🎭 **Alınan Rol:** \`${sub.type}\``,
            '',
            `${E.chart} **SCAN SONUÇLARI:**`,
            `> ✅ **Geçerli:** \`${result.valid}\` token`,
            `> 🗑️ **Silinen:** \`${result.cleaned}\` geçersiz token`,
            `> 📊 **Yeni Kapasite:** \`2\` (4 → 2)`,
            `> 🏷️ **Yeni Paket:** \`Ücretsiz\``,
            '',
            `${E.check} Tüm işlemler tamamlandı!`,
            `${THIN_DIVIDER}`,
          ].join('\n'))
          .setFooter(BRAND.footer('Rol Sistemi'))
          .setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });

        // Kullanıcıya bildirim gönder
        try {
          const user = await interaction.client.users.fetch(targetUserId);
          const userEmbed = new EmbedBuilder()
            .setColor(COLORS.danger)
            .setTitle(`${E.warning} REXAL — Paket Süresi Doldu`)
            .setDescription([
              `${THIN_DIVIDER}`,
              `> ${E.info} Premium paketiniz sona erdi.`,
              '',
              `> 🎭 **Önceki Paket:** \`${sub.type}\``,
              `> 🏷️ **Yeni Paket:** \`Ücretsiz\``,
              `> 📊 **Yeni Kapasite:** \`2 token\``,
              '',
              `${E.warning} **SCAN YAPILDI:**`,
              `> Geçersiz tokenleriniz temizlendi.`,
              `> Silinen: \`${result.cleaned}\` token`,
              `> Kalan: \`${result.valid}\` token`,
              '',
              `${E.info} Premium pakete tekrar sahip olmak için yöneticiye başvurabilirsin!`,
              `${THIN_DIVIDER}`,
            ].join('\n'))
            .setFooter(BRAND.footer('Vault Sistemi'))
            .setTimestamp();

          await user.send({ embeds: [userEmbed] }).catch(() => { });
        } catch { }

      } catch (err) {
        console.error('Rol alma hatası:', err);
        await interaction.editReply({
          content: `❌ Hata: ${err.message}`,
          embeds: [],
        });
      }
    }
  },
};
