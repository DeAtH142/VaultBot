// src/commands/resimtopla.js
import { EmbedBuilder } from 'discord.js';
import { createZipFromUserImages, clearUserImages, getUserImageCount } from '../utils/dmCollector.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

// Aktif toplama oturumları (userId -> true)
const activeSessions = new Set();

export default {
  name: 'resimtopla',
  description: 'DM üzerinden gönderdiğin resimleri toplayıp ZIP olarak geri gönderir',
  aliases: ['resimtopla', 'resimzip', 'resimtopla baslat'],

  async execute(message, args) {
    const userId = message.author.id;
    const action = args[0]?.toLowerCase();

    // ── Oturumu Durdur ve ZIP Gönder ──
    if (action === 'durdur' || action === 'bitir' || action === 'gonder') {
      if (!activeSessions.has(userId)) {
        return message.reply('❌ Aktif bir resim toplama oturumun yok! Başlatmak için `!resimtopla` yaz.');
      }

      const count = getUserImageCount(userId);
      if (count === 0) {
        activeSessions.delete(userId);
        clearUserImages(userId);
        return message.reply('📭 Hiç resim göndermemişsin, toplanacak bir şey yok.');
      }

      await message.reply(`⏳ **${count}** resim ZIP'leniyor...`);

      try {
        const zipBuffer = await createZipFromUserImages(userId);
        if (!zipBuffer) return message.reply('❌ ZIP oluşturulamadı.');

        const embed = new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(`${E.check} Resimlerin Hazır!`)
          .setDescription([
            `${THIN_DIVIDER}`,
            `> 📦 **Toplanan Resim:** \`${count}\` adet`,
            `> 📁 **Dosya:** \`resimlerim.zip\``,
            '',
            '*İyi kullanımlar! Yeni bir oturum için tekrar `!resimtopla` yazabilirsin.*'
          ].join('\n'))
          .setFooter(BRAND.footer('DM Collector'));

        await message.reply({
          embeds: [embed],
          files: [{ attachment: zipBuffer, name: 'resimlerim.zip' }]
        });

        // Temizlik
        clearUserImages(userId);
        activeSessions.delete(userId);

      } catch (err) {
        console.error('ZIP oluşturma hatası:', err);
        await message.reply(`❌ ZIP oluşturulurken hata: ${err.message}`);
      }
      return;
    }

    // ── Oturumu Başlat ──
    if (activeSessions.has(userId)) {
      return message.reply('⚠️ Zaten aktif bir resim toplama oturumun var! Bitirmek için `!resimtopla durdur` yaz.');
    }

    activeSessions.add(userId);
    clearUserImages(userId); // Varsa eski verileri temizle

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`${E.camera} Resim Toplama Başladı!`)
      .setDescription([
        `${THIN_DIVIDER}`,
        `> ${E.info} **Nasıl Çalışır?**`,
        '> 1️⃣ Bu mesajdan sonra botun DM\'ine istediğin kadar **resim** gönder.',
        '> 2️⃣ İşin bittiğinde buraya gelip `!resimtopla durdur` yaz.',
        '> 3️⃣ Bot, DM\'de topladığı tüm resimleri **ZIP** dosyası yapıp sana burada gönderecek.',
        '',
        `${E.warning} **Not:** Sadece resim dosyaları (png, jpg, jpeg, gif) toplanır.`,
        `${THIN_DIVIDER}`,
      ].join('\n'))
      .setFooter(BRAND.footer('DM Collector'));

    await message.reply({ embeds: [embed] });
  },

  // DM oturumlarını yönetmek için dışa aktarılan fonksiyonlar
  isActive: (userId) => activeSessions.has(userId),
  stopSession: (userId) => activeSessions.delete(userId),
};
