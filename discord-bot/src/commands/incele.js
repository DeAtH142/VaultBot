// src/commands/incele.js — 🕵️‍♂️ AI Sunucu Analizörü
import { EmbedBuilder } from 'discord.js';
import { askCloudflareAI } from '../utils/cloudflareAI.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

export default {
  name: 'incele',
  description: 'AI ile sunucuyu analiz et ve taktik al',
  aliases: ['analiz', 'ai-analiz'],

  async execute(message) {
    // Sadece yöneticiler kullanabilsin (isteğe bağlı, istersen kaldırabilirsin)
    if (!message.member.permissions.has('ManageGuild')) {
      return message.reply('❌ Bu komutu sadece **Sunucuyu Yönet** yetkisi olanlar kullanabilir.');
    }

    await message.reply('🕵️‍♂️ **Yapay Zeka sunucuyu inceliyor, lütfen bekle...** (Bu işlem 10-15 saniye sürebilir)');

    try {
      // 1. Sunucu Verilerini Topla
      const guild = message.guild;
      const memberCount = guild.memberCount;
      const onlineCount = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
      const channelCount = guild.channels.cache.size;
      const roleCount = guild.roles.cache.size;

      // 2. Son 20 Mesajı Çek (Sohbetin sıcaklığını anlamak için)
      const fetchedMessages = await message.channel.messages.fetch({ limit: 20 });
      const chatContext = fetchedMessages
        .reverse()
        .map(m => `[${m.author.username}]: ${m.content}`)
        .join('\n');

      // 3. AI için Prompt Hazırla
      const systemPrompt = `Sen uzman bir Discord sunucu büyüme danışmanısın. Kullanıcılara her zaman Türkçe, samimi ve stratejik cevaplar verirsin. Cevapların kısa, maddeler halinde ve uygulanabilir olmalıdır.`;
      
      const userPrompt = `İşte Discord sunucumun verileri:
- Toplam Üye: ${memberCount}
- Çevrimiçi Üye: ${onlineCount}
- Kanal Sayısı: ${channelCount}
- Rol Sayısı: ${roleCount}

Son 20 mesajın dökümü:
${chatContext}

Bu verilere dayanarak:
1. Sunucudaki en büyük eksiklik nedir?
2. Aktifliği artırmak için 3 tane yaratıcı ve uygulanabilir taktik ver.
3. Sohbeti canlandırmak için nasıl bir etkinlik/çekiliş düzenlemeliyim?`;

      // 4. Cloudflare AI'a Sor
      const aiResponse = await askCloudflareAI(systemPrompt, userPrompt);

      // 5. Cevabı Embed'e Dönüştür
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setAuthor({ name: `${BRAND.name} • AI Sunucu Analizi`, iconURL: message.client.user.displayAvatarURL() })
        .setTitle(`🕵️‍♂️ ${guild.name} — Analiz Raporu`)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `**📊 Sunucu İstatistikleri:**`,
          `> 👥 Üye: \`${memberCount}\` | 🟢 Çevrimiçi: \`${onlineCount}\``,
          `> 💬 Kanal: \`${channelCount}\` | 🎭 Rol: \`${roleCount}\``,
          `\`${THIN_DIVIDER}\``,
          `**🤖 Yapay Zeka Raporu:**`,
          aiResponse.slice(0, 3900), // Discord limitine takılmamak için
        ].join('\n'))
        .setFooter({ text: BRAND.footer('Powered by Cloudflare AI') })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (err) {
      console.error('İnceleme hatası:', err);
      await message.reply(`❌ **Analiz sırasında bir hata oluştu:**\n\`${err.message}\``);
    }
  },
};
