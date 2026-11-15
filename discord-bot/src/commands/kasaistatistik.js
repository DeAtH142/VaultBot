// src/commands/kasaistatistik.js
// 📊 !kasaistatistik — Detaylı kasa analizi (Lidya 🌷 ve üstü paketler)
import { EmbedBuilder } from 'discord.js';
import { COLORS, BRAND, E, THIN_DIVIDER, UX , errorEmbed, infoEmbed } from '../utils/embeds.js';
import { hasStats, tierBadgeText } from '../utils/tierPerms.js';
import { buildAnalytics } from '../utils/kasaAnalytics.js';

export default {
  name: 'kasaistatistik',
  aliases: ['kasa-istatistik', 'kasarapor', 'analiz'],
  description: 'Detaylı kasa istatistik raporu (Lidya ve üstü paketler)',

  async execute(message) {
    if (!hasStats(message.author.id)) {
      const deny = new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle(`${E.lock || '🔒'} Bu Özellik Kilitli`)
        .setDescription([
          THIN_DIVIDER,
          `> ${E.info} **Detaylı Kasa İstatistikleri** premium bir özelliktir.`,
          `> ${E.star} Gereken paket: \`3. Paket Lidya 🌷\` veya üstü.`,
          `> 📊 Senin paketin: ${tierBadgeText(message.author.id)}`,
          '',
          `*Yükseltme için \`!rol\` panelinden yöneticinle görüşebilirsin.*`,
        ].join('\n'))
        .setFooter(BRAND.footer('VIP Özelliği'));
      return message.reply({ embeds: [deny] });
    }

    const a = buildAnalytics(message.author.id);

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${BRAND.name} • Kasa Analitik Motoru`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
      .setColor(COLORS.purple)
      .setTitle(`${E.chart}  REXAL — DETAYLI KASA İSTATİSTİKLERİ`)
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription([
        UX.header,
        `> 👤 **Paket:** ${tierBadgeText(message.author.id)}`,
        `> 🔑 **Kasadaki Hesap:** \`${a.tokenCount}\``,
        UX.footerLine,
        '',
        `⏱️ **TOPLAM BOT SÜRESİ**`,
        `> \`${a.totalText}\``,
        '',
        `🔥 **EN ÇOK KULLANILAN SİSTEMLER**`,
        a.systemLines.length
          ? a.systemLines.join('\n')
          : '> *Henüz sistem kullanım verisi yok — sistemleri çalıştırdıkça dolar.*',
        a.topSystem ? `> 🏆 **Şampiyon:** \`${a.topSystem.key}\` (${a.topSystem.text})` : '',
        '',
        `🔑 **TOKEN STABİLİTE TABLOSU**`,
        a.accLines.length
          ? a.accLines.join('\n')
          : '> *Kasanda hesap yok.*',
        '',
        `🏆 **KAZANIMLAR**`,
        `> Rol/etkinlik kazanımı: \`${a.awards}\` kez`,
        '',
        THIN_DIVIDER,
        `*Veriler sistemler çalıştıkça canlı olarak birikir.*`,
      ].filter(Boolean).join('\n'))
      .setFooter(BRAND.footer('Kasa Analytics • Lidya+'))
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};
