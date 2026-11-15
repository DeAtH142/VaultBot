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
  activeSessions 
} from '../utils/dmCollector.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

export default {
  name: 'resimtopla',
  description: 'DM üzerinden gönderdiğin resimleri/dosyaları toplayıp ZIP olarak geri gönderir',

  async execute(message) {
    const userId = message.author.id;
    const count = getUserImageCount(userId);
    const isActive = activeSessions.has(userId);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`${E.camera || '📸'} REXAL — Medya Toplama Sistemi`)
      .setDescription([
        `${THIN_DIVIDER}`,
        `> ${E.gear || '⚙️'} **Sistem Durumu:** ${isActive ? '🟢 Aktif (Dinleniyor)' : '🔴 Durduruldu'}`,
        `> 📦 **Toplanan Medya:** \`${count}\` Adet`,
        '',
        `${E.info || 'ℹ️'} **NASIL KULLANILIR?**`,
        '> 1️⃣ Aşağıdaki **Başlat** butonuna tıkla.',
        '> 2️⃣ Botun DM\'ine giderek istediğin kadar **resim veya dosya** gönder.',
        '> 3️⃣ İşin bittiğinde **Durdur** butonuna bas.',
        '> 4️⃣ **ZIP Olarak İndir** butonuyla tüm medyanı tek dosya halinde al.',
        '',
        `${E.warning || '⚠️'} **DİKKAT**`,
        '> ZIP oluşturma işlemi, dosya boyutuna göre birkaç saniye sürebilir.',
        `${THIN_DIVIDER}`,
      ].join('\n'))
      .setFooter(BRAND.footer('Media Collector'))
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('resimtopla:start')
        .setLabel('▶️ Başlat')
        .setStyle(ButtonStyle.Success)
        .setDisabled(isActive),
      new ButtonBuilder()
        .setCustomId('resimtopla:stop')
        .setLabel('⏹ Durdur')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!isActive),
      new ButtonBuilder()
        .setCustomId('resimtopla:zip')
        .setLabel('📦 ZIP Olarak İndir')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(count === 0)
    );

    await message.reply({ embeds: [embed], components: [row] });
  },

  async onButton(interaction, actionParts) {
    const userId = interaction.user.id;
    const action = actionParts[0];

    // ── BAŞLAT BUTONU ──
    if (action === 'start') {
      if (activeSessions.has(userId)) {
        return interaction.reply({ content: '⚠️ Zaten aktif bir toplama oturumun var!', ephemeral: true });
      }
      
      activeSessions.add(userId);
      clearUserImages(userId); // Yeni oturumda eski verileri temizle

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('🟢 Sistem Başlatıldı!')
        .setDescription('Botun DM kutuna giderek resimlerini ve dosyalarını gönderebilirsin. İşin bittiğinde bu panelden **Durdur** butonuna bas.');

      // Paneli güncelle
      await interaction.update({
        embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(COLORS.success).setDescription('> **Sistem Durumu:** 🟢 Aktif (Dinleniyor)\n> **Toplanan Medya:** `0` Adet\n\n*Lütfen DM\'ine gidip resim gönderin.*')],
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
        await user.send({ embeds: [embed] });
      } catch { }
    }

    // ── DURDUR BUTONU ──
    else if (action === 'stop') {
      if (!activeSessions.has(userId)) {
        return interaction.reply({ content: '⚠️ Aktif bir oturumun yok!', ephemeral: true });
      }

      activeSessions.delete(userId);
      const count = getUserImageCount(userId);

      const embed = new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle('🔴 Sistem Durduruldu!')
        .setDescription(`Başarıyla **${count}** adet medya toplandı. Şimdi **ZIP Olarak İndir** butonuna basarak dosyalarını alabilirsin.`);

      // Paneli güncelle
      await interaction.update({
        embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(COLORS.danger).setDescription(`> **Sistem Durumu:** 🔴 Durduruldu\n> **Toplanan Medya:** \`${count}\` Adet\n\n*ZIP oluşturmak için aşağıdaki butona basın.*`)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('resimtopla:start').setLabel('▶️ Başlat').setStyle(ButtonStyle.Success).setDisabled(false),
            new ButtonBuilder().setCustomId('resimtopla:stop').setLabel('⏹ Durdur').setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setCustomId('resimtopla:zip').setLabel('📦 ZIP Olarak İndir').setStyle(ButtonStyle.Primary).setDisabled(count === 0)
          )
        ]
      });

      try {
        const user = await interaction.client.users.fetch(userId);
        await user.send({ embeds: [embed] });
      } catch { }
    }

    // ── ZIP İNDİR BUTONU ──
    else if (action === 'zip') {
      const count = getUserImageCount(userId);
      if (count === 0) {
        return interaction.reply({ content: '📭 Toplanmış medya yok! Önce Başlat butonuna basıp DM\'den resim gönder.', ephemeral: true });
      }

      // Emin misin onayı
      const confirmEmbed = new EmbedBuilder()
        .setColor(COLORS.warning || 0xffaa00)
        .setTitle('⚠️ ZIP Oluşturma Onayı')
        .setDescription([
          `**${count}** adet medya dosyası ZIP haline getirilecek.`,
          'İşlem dosya boyutuna göre **1-3 dakika** sürebilir.',
          '',
          'Onaylıyor musun?'
        ].join('\n'));

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('resimtopla:confirm_zip').setLabel('✅ Evet, ZIP\'le').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('resimtopla:cancel_zip').setLabel('❌ İptal').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
    }

    // ── ZIP ONAYLA ──
    else if (action === 'confirm_zip') {
      await interaction.update({ content: '⏳ ZIP dosyası oluşturuluyor, lütfen bekle...', embeds: [], components: [] });

      try {
        const zipBuffer = await createZipFromUserImages(userId);
        if (!zipBuffer) throw new Error('ZIP oluşturulamadı.');

        await interaction.editReply({
          content: '✅ ZIP dosyan hazır!',
          files: [{ attachment: zipBuffer, name: 'toplanan_medyalar.zip' }]
        });

        // Temizlik (ZIP gönderildikten sonra hafızayı temizle)
        clearUserImages(userId);
        
        // Paneli güncelle
        const panelMsg = await interaction.message.fetch();
        await panelMsg.edit({
          embeds: [EmbedBuilder.from(panelMsg.embeds[0]).setDescription('> **Sistem Durumu:** 🔴 Durduruldu\n> **Toplanan Medya:** `0` Adet\n\n*ZIP başarıyla indirildi. Yeni bir işlem için Başlat butonunu kullanın.*')],
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
