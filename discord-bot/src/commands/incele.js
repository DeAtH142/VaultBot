// src/commands/incele.js — 🕵️‍♂️ AI Sunucu Analizörü + Soru Sorma
import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} from 'discord.js';
import { askCloudflareAI } from '../utils/cloudflareAI.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

// 🚨 KRAL BURASI ÇOK ÖNEMLİ: AI'ın verdiği cevapları kanal bazlı hafızada tutuyoruz.
const channelContext = new Map(); 

export default {
  name: 'incele',
  description: 'AI ile sunucuyu analiz et ve taktik al',
  aliases: ['analiz', 'ai-analiz'],

  async execute(message) {
    if (!message.member.permissions.has('ManageGuild')) {
      return message.reply('❌ Bu komutu sadece **Sunucuyu Yönet** yetkisi olanlar kullanabilir.');
    }

    await message.reply('🕵️‍♂️ **Yapay Zeka sunucuyu inceliyor, lütfen bekle...**');

    try {
      const guild = message.guild;
      const memberCount = guild.memberCount;
      const onlineCount = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
      const channelCount = guild.channels.cache.size;
      const roleCount = guild.roles.cache.size;

      const fetchedMessages = await message.channel.messages.fetch({ limit: 20 });
      const chatContext = fetchedMessages
        .reverse()
        .map(m => `[${m.author.username}]: ${m.content}`)
        .join('\n');

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

      const aiResponse = await askCloudflareAI(systemPrompt, userPrompt);

      // 🚨 BAĞLAMI KAYDET
      channelContext.set(message.channel.id, aiResponse);

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
          aiResponse.slice(0, 3900),
        ].join('\n'))
        .setFooter(BRAND.footer('Powered by Cloudflare AI'))
        .setTimestamp();

      // 🚨 SORU SOR BUTONU EKLENDİ
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('incele:soru')
          .setLabel('AI\'ya Soru Sor')
          .setEmoji('❓')
          .setStyle(ButtonStyle.Primary)
      );

      await message.reply({ embeds: [embed], components: [row] });

    } catch (err) {
      console.error('İnceleme hatası:', err);
      await message.reply(`❌ **Analiz sırasında bir hata oluştu:**\n\`${err.message}\``);
    }
  },

  // Butona basıldığında Modal aç
  async onButton(interaction, parts) {
    if (parts[0] === 'soru') {
      const modal = new ModalBuilder()
        .setCustomId('incele:sorucevap')
        .setTitle('Yapay Zeka\'ya Soru Sor');

      const soruInput = new TextInputBuilder()
        .setCustomId('soru')
        .setLabel('Sorunuz nedir? (AI geçmişi hatırlar)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Örn: Bu sunucuda nasıl bir çekiliş yapmalıyım?')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(soruInput));
      await interaction.showModal(modal);
    }
  },

  // Soru gönderildiğinde AI'a ilet
  async onModalSubmit(interaction, parts) {
    if (parts[0] === 'sorucevap') {
      const soru = interaction.fields.getTextInputValue('soru');
      const previousContext = channelContext.get(interaction.channel.id) || 'Henüz bir analiz yapılmadı.';

      await interaction.reply({ content: '🤔 **AI düşünüyor...**', flags: MessageFlags.Ephemeral });

      try {
        const systemPrompt = `Sen uzman bir Discord sunucu danışmanısın. 
Önceki analiz raporun şuydu: ${previousContext}
Şimdi kullanıcı sana bir soru soruyor. Lütfen bu bağlamı kullanarak, Türkçe, samimi ve stratejik bir cevap ver.`;
        
        const aiCevap = await askCloudflareAI(systemPrompt, soru);

        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setAuthor({ name: '🤖 Yapay Zeka Cevabı', iconURL: interaction.client.user.displayAvatarURL() })
          .setDescription(`**Soru:** ${soru}\n\n**Cevap:**\n${aiCevap.slice(0, 3900)}`)
          .setFooter(BRAND.footer('Powered by Cloudflare AI'))
          .setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });

      } catch (err) {
        await interaction.editReply({ content: `❌ AI Hata verdi: ${err.message}` });
      }
    }
  }
};
