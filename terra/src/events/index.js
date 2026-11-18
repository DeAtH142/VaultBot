// src/events/index.js — Olay dinleyicileri
const { Events, EmbedBuilder } = require('discord.js');
const { collections, FieldValue } = require('../firebase');
const { registerGuildDoc } = require('../utils/schemas');
const { generateMapImage } = require('../game/map');

module.exports = function registerEvents(client) {
  // Bot yeni bir sunucuya eklendi → guild dokümanı oluştur + hoş geldin mesajı
  client.on(Events.GuildCreate, async (guild) => {
    await registerGuildDoc(guild.id);
    const channel =
      guild.systemChannel ||
      guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me).has('SendMessages'));
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle('🗺️ Terra Strateji Botu — Hoş Geldin!')
      .setDescription(
        'Sunucunda kendi ittifaklarınla harita savaşlarına başlayabilirsin!\n\n' +
        '• `/kurulum` → Haritanın atılacağı kanalı seç ve oyunu kur.\n' +
        '• `/ayarlar` → Oyunu başlat/durdur, harita boyutunu ve arka planı ayarla.\n' +
        '• `/sezon-sifirla` → Yeni sezon başlat (yetkili only).'
      )
      .setColor(0x5865f2)
      .setFooter({ text: 'Daisy © 2026' });
    channel.send({ embeds: [embed] }).catch(() => {});
  });

  // Butonla güç ver / harita yenile gibi ID tabanlı mesaj güncellemeleri
  client.on(Events.MessageCreate, async () => {}); // yer tutucu

  // Sezon sıfırlama zamanlayıcısı gerekirse burada
};
