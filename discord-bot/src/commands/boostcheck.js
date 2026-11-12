// src/commands/boostcheck.js — 📣 Kanal/Hesap Boost Kontrolü
// Kasadaki hesapların sunucu boost durumlarını listeler. Hafif REST tabanlı — selfbot login gerektirir
// (boost bilgisi ancak giriş yapan client üzerinden gelir).
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine, progressBar } from '../utils/embeds.js';
import { getTokens } from '../utils/tokenStore.js';
import { runSequentialWithDelay } from '../utils/selfbotHelpers.js';

const FOOTER = () => BRAND.footer('Boost Inspector');

/**
 * Hesabın boost yaptığı sunucuları bulur.
 * selfbot client'ta guilds.cache + premiumSubscriptionType / premiumSince üzerinden tespit edilir.
 */
async function collectBoosts(login) {
  const boosts = [];
  for (const [, guild] of login.client.guilds.cache) {
    try {
      const me = guild.me || await guild.members.fetchMe().catch(() => null);
      if (!me) continue;
      // premiumSince = bu üyenin boost tarihi (varsa hesap bu sunucuyu boostluyor)
      if (me.premiumSinceTimestamp || me.premiumSince) {
        boosts.push({
          guildName: guild.name,
          guildId: guild.id,
          since: me.premiumSinceTimestamp || (me.premiumSince ? new Date(me.premiumSince).getTime() : null),
        });
      }
    } catch { }
  }
  return boosts;
}

export default {
  name: 'boostcheck',
  aliases: ['boostlar', 'boosts', 'boost'],
  description: 'REXAL — Hesap Boost Durumu Listeleme',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setAuthor({ name: `${BRAND.name} • Boost Inspector ${BRAND.version}` })
      .setTitle('📣 REXAL — Boost Kontrol')
      .setDescription([
        UX.header, UX.footerLine, '',
        statusLine([['🌐', 'Sistem', 'Hazır'], ['💎', 'Mod', 'Envanter']]),
        '',
        section('Ne Yapar?'),
        'Kasadaki hesapların **hangi sunucuları boostladığını** listeler.',
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('💎', 'Sunucu Bazlı', 'Hesap başı boost yapılan sunucu + başlangıç tarihi')}`,
        `> ${UX.dot2} ${bullet('🔐', 'Giriş Gerekli', 'Boost bilgisi hesap oturumu ile gelir — selfbot login kullanır')}`,
        `> ${UX.dot2} ${bullet('♾️', 'Sıfır İz', 'Tarama bitince tüm oturumlar kapanır')}`,
        '',
        section('Kontrol Paneli'),
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('boostcheck:tara').setLabel('Boostları Tara').setEmoji('📣').setStyle(ButtonStyle.Success),
      )],
    });
  },

  async onButton(interaction, action) {
    const userId = interaction.user.id;
    const tokens = getTokens(userId);
    if (tokens.length === 0) return interaction.reply({ content: '❌ Kasanızda hesap yok!', ephemeral: true });

    if (action[0] === 'tara') {
      const options = tokens.map((t, i) => ({
        label: `${i + 1}. ${t.username || t.label || `Hesap ${i + 1}`}`,
        value: String(i),
        emoji: t.status === 'gecersiz' ? '💔' : '⚪',
      }));
      return interaction.reply({
        content: 'Hangi hesapların boostları taransın?',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('boostcheck:sec')
            .addOptions(options).setPlaceholder('🔍 Hesaplar (çoklu seçim)').setMinValues(1).setMaxValues(options.length),
        )], ephemeral: true,
      });
    }
  },

  async onSelect(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const indices = interaction.values.map(Number);

    try {
      const reports = await runSequentialWithDelay(
        indices.map(i => ({ userId: interaction.user.id, tokenIndex: i })),
        async (_acc, login) => {
          const boosts = await collectBoosts(login);
          return { summary: `${boosts.length} boost`, boosts };
        },
        2500,
      );

      const totalBoosts = reports.reduce((s, r) => s + (r.boosts?.length || 0), 0);
      const lines = reports.map(r => {
        const name = r.username || `Hesap #${r.tokenIndex + 1}`;
        if (!r.ok) return `> 💔 **${name}** — Giriş başarısız: \`${r.error}\``;
        if (!r.boosts?.length) return `> ⚪ **${name}** — Boost yok`;
        const bl = r.boosts.map(b => `>    💎 **${b.guildName}**${b.since ? ` — \`${new Date(b.since).toLocaleDateString('tr-TR')}\`'den beri` : ''}`).join('\n');
        return `> 🟢 **${name}** — \`${r.boosts.length}\` boost\n${bl}`;
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('📣 Boost Envanteri')
        .setColor(COLORS.gold)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 👥 **Hesap:** \`${indices.length}\`   💎 **Toplam Boost:** \`${totalBoosts}\``,
          '',
          lines.slice(0, 3800),
          `\`${THIN_DIVIDER}\``,
          `> ♾️ *Tüm oturumlar kapatıldı — sıfır iz bırakıldı.*`,
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(`Tarama hatası: ${err.message}`)] });
    }
  },
};
