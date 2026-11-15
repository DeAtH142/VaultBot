// src/commands/resimtopla.js
import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import { 
  createZipFromUserImages, 
  clearUserImages, 
  getUserImageCount, 
  startSession, 
  stopSession,
  activeOwnerId
} from '../utils/dmCollector.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

export default {
  name: 'resimtopla',
  description: 'DM üzerinden gelen resimleri/dosyaları toplayıp ZIP olarak geri gönderir',

  async execute(message) {
    const userId = message.author.id;
    const isActive = activeOwnerId === userId;
    const count = getUserImageCount(userId);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`${E.camera || '📸'} REXAL — Medya Toplama Sistemi`)
      .setDescription([
        `${THIN_DIVIDER}`,
        `> ${E.gear || '⚙️'} **Sistem Durumu:** ${isActive ? '🟢 Aktif (Dinleniyor)' : (activeOwnerId ? '🟡 Başkası Tarafından Kullanılıyor' : '🔴 Durduruldu')}`,
        `> 📦 **Toplanan Medya:** \`${count}\` Adet`,
        '',
        `${E.info || 'ℹ️'} **NASIL KULLANILIR?**`,
        '> 1️⃣ Aşağıdaki **Başlat** butonuna tıkla.',
        '> 2️⃣ Botun DM\'ine **sen veya arkadaşların** istediği kadar resim/dosya gönderebilir.',
        '> 3️⃣ İşiniz bittiğinde **Durdur** butonuna bas.',
        '> 4️⃣ **ZIP Olarak İndir** butonuyla tüm medyayı tek dosya halinde al.',
        '',
        `${E.warning || '⚠️'} **DİKKAT**`,
        '> Bot, "Başlat"a bastığın andan itibaren **herkesin** DM\'den attığı dosyaları toplar.',
        `${THIN_DIVIDER}`,
      ].join('\n'))
      .setFooter(BRAND.footer('Media Collector'))
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('resimtopla:start')
        .setLabel('▶️ Başlat')
        .setStyle(ButtonStyle.Success)
        .setDisabled(activeOwnerId !== null), // Eğer biri başlattıysa butonu kilitle
      new ButtonBuilder()
        .setCustomId('resimtopla:stop')
        .setLabel('⏹ Durdur')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!isActive), // Sadece sahibi durdurabilir
      new ButtonBuilder()
        .setCustomId('resimtopla:zip')
        .setLabel('📦 ZIP Olarak İndir')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(count === 0) // Medya yoksa ZIP butonu kapalı
    );

    await message.reply({ embeds: [embed], components: [row] });
  },

  async onButton(interaction, actionParts) {
    const userId = interaction.user.id;
    const action = actionParts[0];

    // ── BAŞLAT BUTONU ──
    if (action === 'start') {
      if (activeOwnerId !== null) {
        return interaction.reply({ content: '⚠️ Zaten aktif bir toplama oturumu var!', ephemeral: true });
      }
      
      startSession(userId); // Havuzu bu kullanıcı için başlat

      const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(COLORS.success)
        .setDescription(`> **Sistem Durumu:** 🟢 Aktif (Dinleniyor)\n> **Toplanan Medya:** \`0\` Adet\n\n*Botun DM'ine resim/dosya gönderebilirsin. (Arkadaşlarınız da gönderebilir!)*`);

      await interaction.update({
        embeds: [newEmbed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('resimtopla:start').setLabel('▶️ Başlat').setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId('resimtopla:stop').setLabel('⏹ Durdur').setStyle(ButtonStyle.Danger).setDisabled(false),
            new ButtonBuilder().setCustomId('resimtopla:zip').setLabel('📦 ZIP Olarak İndir').setStyle(ButtonStyle.Primary).setDisabled(true)
          )
        ]
      });

      // Kullanıcıya DM'den de bilgi ver
      try {
        const user = await interaction.client.users.fetch(userId);
        await user.send({ content: '🟢 **Sistem Başlatıldı!** Botun DM\'ine resim/dosya gönderebilirsin. Arkadaşların da gönderebilir.' });
      } catch { }
    }

    // ── DURDUR BUTONU ──
    else if (action === 'stop') {
      if (activeOwnerId !== userId) {
        return interaction.reply({ content: '⚠️ Bu oturumun sahibi sen değilsin!', ephemeral: true });
      }

      stopSession(); // Havuzu durdur
      const count = getUserImageCount(userId);

      const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(COLORS.danger)
        .setDescription(`> **Sistem Durumu:** 🔴 Durduruldu\n> **Toplanan Medya:** \`${count}\` Adet\n\n*ZIP oluşturmak için aşağıdaki butona basın.*`);

      await interaction.update({
        embeds: [newEmbed],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('resimtopla:start').setLabel('▶️ Başlat').setStyle(ButtonStyle.Success).setDisabled(false),
            new ButtonBuilder().setCustomId('resimtopla:stop').setLabel('⏹ Durdur').setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setCustomId('resimtopla:zip').setLabel('📦 ZIP Olarak İndir').setStyle(ButtonStyle.Primary).setDisabled(count === 0)
          )
        ]
      });
    }

    // ── ZIP İNDİR BUTONU ──
    else if (action === 'zip') {
      const count = getUserImageCount(userId);
      if (count === 0) {
        return interaction.reply({ content: '📭 Toplanmış medya yok!', ephemeral: true });
      }

      const confirmEmbed = new EmbedBuilder()
        .setColor(COLORS.warning || 0xffaa00)
        .setTitle('⚠️ ZIP Oluşturma Onayı')
        .setDescription(`**${count}** adet medya dosyası ZIP haline getirilecek.\nİşlem dosya boyutuna göre **1-3 dakika** sürebilir.\n\nOnaylıyor musun?`);

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('resimtopla:confirm_zip').setLabel('✅ Evet, ZIP\'le').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('resimtopla:cancel_zip').setLabel('❌ İptal').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
    }

    // ── ZIP ONAYLA ──
    else if (action === 'confirm_zip') {
      await interaction.update({ content: '⏳ ZIP dosyası oluşturuluyor...', embeds: [], components: [] });

      try {
        const zipBuffer = await createZipFromUserImages(userId);
        if (!zipBuffer) throw new Error('ZIP oluşturulamadı.');

        await interaction.editReply({
          content: '✅ ZIP dosyan hazır!',
          files: [{ attachment: zipBuffer, name: 'toplanan_medyalar.zip' }]
        });

        clearUserImages(userId); // İşlem bitince temizle
        
        const panelMsg = await interaction.message.fetch();
        await panelMsg.edit({
          embeds: [EmbedBuilder.from(panelMsg.embeds[0]).setDescription('> **Sistem Durumu:** 🔴 Durduruldu\n> **Toplanan Medya:** `0` Adet\n\n*ZIP başarıyla indirildi.*')],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('resimtopla:start').setLabel('▶️ Başlat').setStyle(ButtonStyle.Success).setDisabled(false),
              new ButtonBuilder().setCustomId('resimtopla:stop').setLabel('⏹ Durdur').setStyle(ButtonStyle.Danger).setDisabled(true),
              new ButtonBuilder().setCustomId('resimtopla:zip').setLabel('📦 ZIP Olarak İndir').setStyle(ButtonStyle.Primary).setDisabled(true)
            )
          ]
        }).catch(() => {});

      } catch (err) {
        console.error('ZIP Hatası:', err);
        await interaction.editReply({ content: `❌ Hata: ${err.message}` });
      }
    }

    // ── ZIP İPTAL ──
    else if (action === 'cancel_zip') {
      await interaction.update({ content: '❌ ZIP oluşturma iptal edildi.', embeds: [], components: [] });
    }
  }
};
