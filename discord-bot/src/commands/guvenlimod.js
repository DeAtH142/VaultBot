// src/commands/guvenlimod.js
// 🛡️ !guvenlimod — Anti-Ban Güvenli Mod paneli (Zoktay ☄️ + Esin 💛)
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { COLORS, BRAND, E, THIN_DIVIDER, UX , errorEmbed, infoEmbed } from '../utils/embeds.js';
import { hasAntiBan, tierBadgeText } from '../utils/tierPerms.js';
import { isSafeMode, setSafeMode, safeModeText } from '../utils/safeMode.js';

export default {
  name: 'guvenlimod',
  aliases: ['guvenli', 'antiban', 'safe'],
  description: 'Anti-Ban Güvenli Mod paneli (Zoktay ve Esin paketleri)',

  async execute(message) {
    if (!hasAntiBan(message.author.id)) {
      const deny = new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle('🔒 Bu Özellik Kilitli')
        .setDescription([
          THIN_DIVIDER,
          `> ${E.info} **Anti-Ban Güvenli Mod** en üst paketlerde bulunur.`,
          `> ${E.star} Gereken paket: \`5. Paket Zoktay ☄️\` veya \`6. Paket Esin 💛\``,
          `> 📊 Senin paketin: ${tierBadgeText(message.author.id)}`,
        ].join('\n'))
        .setFooter(BRAND.footer('VIP Özelliği'));
      return message.reply({ embeds: [deny] });
    }

    const state = isSafeMode(message.author.id);
    const embed = this.buildPanel(message.author, state);
    return message.reply({ embeds: [embed], components: this.components(state) });
  },

  buildPanel(user, state) {
    return new EmbedBuilder()
      .setAuthor({ name: `${BRAND.name} • Anti-Ban Motoru`, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setColor(state ? COLORS.success : COLORS.gray)
      .setTitle('🛡️  REXAL — ANTI-BAN GÜVENLİ MOD')
      .setDescription([
        UX.header,
        statusLineLocal(state),
        UX.footerLine,
        '',
        section('Ne Yapar?'),
        `> ▸ Tüm selfbot aksiyonlarında (farm, mesaj, DM, bump) komut aralıklarını **~1.75-2.1x yavaşlatır** ve insansı jitter ekler.`,
        `> ▸ Discord'ın hız/otomasyon algılamasına takılma riskini ciddi oranda düşürür.`,
        `> ▸ Tüm token'ların için geçerlidir, token başına ayar gerektirmez.`,
        '',
        `> ⚙️ **Mevcut durum:** ${safeModeText(user.id)}`,
        '',
        `*${state ? 'Hesapların şu an korumalı hızda çalışıyor.' : 'Hesapların standart hızda — riski sana ait.'}*`,
      ].join('\n'))
      .setFooter(BRAND.footer('Anti-Ban Engine • Zoktay+'))
      .setTimestamp();
  },

  components(state) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guvenlimod:toggle').setLabel(state ? 'Kapat (Standart Hız)' : 'Aç (Güvenli Hız)').setEmoji(state ? '⚡' : '🛡️').setStyle(state ? ButtonStyle.Secondary : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('guvenlimod:refresh').setLabel('Yenile').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    )];
  },

  async onButton(interaction, parts) {
    if (parts[0] === 'toggle') {
      if (!hasAntiBan(interaction.user.id)) {
        return interaction.reply({ content: '❌ Bu özellik paketine dahil değil.', ephemeral: true });
      }
      const newState = !isSafeMode(interaction.user.id);
      setSafeMode(interaction.user.id, newState);
      const embed = this.buildPanel(interaction.user, newState);
      return interaction.update({ embeds: [embed], components: this.components(newState) });
    }
    if (parts[0] === 'refresh') {
      const state = isSafeMode(interaction.user.id);
      const embed = this.buildPanel(interaction.user, state);
      return interaction.update({ embeds: [embed], components: this.components(state) });
    }
  },
};

// küçük yerel yardımcılar (embeds.js'e bağımlılığı azaltmak için)
function statusLineLocal(state) {
  return `> 🟢 **DURUM:** \`${state ? 'AKTİF' : 'PASİF'}\`  ◆  ⚙️ **MOTOR:** \`Anti-Ban v1\``;
}
function section(t) { return `❯ **${t.toUpperCase()}**`; }
