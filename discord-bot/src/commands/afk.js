// src/commands/afk.js
import { startAfk, stopAfk, isAfkActive } from '../afkManager.js';
import { infoEmbed, errorEmbed, E, COLORS } from '../utils/embeds.js';
import { EmbedBuilder } from 'discord.js';

export default {
  name: 'afk',
  aliases: ['afkmod'],
  description: 'AFK koruyucuyu açar veya kapatır.',

  async execute(message, args) {
    const sub = args[0]?.toLowerCase();
    const key = `${message.guild.id}:${message.author.id}`;

    if (!sub || !['on', 'off', 'aç', 'kapat', 'durum'].includes(sub)) {
      return message.reply({
        embeds: [errorEmbed([
          '**Kullanım:**',
          '```',
          '!afk on     →  AFK koruyucuyu aç',
          '!afk off    →  AFK koruyucuyu kapat',
          '!afk durum  →  Mevcut durumu göster',
          '```',
        ].join('\n'))],
      });
    }

    if (sub === 'on' || sub === 'aç') {
      const started = startAfk(key, message.channel);
      if (!started) {
        return message.reply({
          embeds: [infoEmbed('AFK Koruyucu', `${E.warning} AFK koruyucu zaten **aktif**!`)],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`${E.shield} AFK Koruyucu Aktif`)
        .setColor(COLORS.success)
        .setDescription([
          `${E.check} AFK koruyucu **açıldı**!`,
          '',
          `${E.dot} **Kanal:** <#${message.channel.id}>`,
          `${E.dot} **Periyot:** Her 4 dakikada bir \`typing\` gönderilecek`,
          `${E.dot} **Durum:** Online olarak korunacak`,
          '',
          `${E.info} Kapatmak için: \`!afk off\``,
        ].join('\n'))
        .setFooter({ text: `${E.vault} Vault Bot` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } else if (sub === 'off' || sub === 'kapat') {
      const stopped = stopAfk(key);
      if (!stopped) {
        return message.reply({
          embeds: [infoEmbed('AFK Koruyucu', `${E.warning} AFK koruyucu zaten **kapalı**!`)],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`${E.cross} AFK Koruyucu Kapatıldı`)
        .setColor(COLORS.danger)
        .setDescription([
          `${E.check} AFK koruyucu **kapatıldı**.`,
          '',
          `${E.info} Tekrar açmak için: \`!afk on\``,
        ].join('\n'))
        .setFooter({ text: `${E.vault} Vault Bot` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } else if (sub === 'durum') {
      const active = isAfkActive(key);
      const embed = new EmbedBuilder()
        .setTitle(`${E.chart} AFK Durumu`)
        .setColor(active ? COLORS.success : COLORS.dark)
        .setDescription(
          active
            ? `${E.online} AFK koruyucu **aktif** — bu kanalda typing gönderiliyor.`
            : `${E.offline} AFK koruyucu **kapalı**.`,
        )
        .setFooter({ text: `${E.vault} Vault Bot` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    }
  },
};
