// src/commands/dmsender.js — 💌 Toplu DM Sender Modülü
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine } from '../utils/embeds.js';
import { getTokens } from '../utils/tokenStore.js';
import { runBulkDm, DM_DELAY_PER_TARGET_MS, DM_INTER_ACCOUNT_MS } from '../utils/dmSender.js';
import { buildReportLines } from '../utils/selfbotHelpers.js';

const FOOTER = () => BRAND.footer('Bulk DM Engine');
const runningJobs = new Set();

export default {
  name: 'dmsender',
  aliases: ['topludm', 'dmgonder', 'bulkdm'],
  description: 'REXAL — Toplu DM Sender Kontrol Paneli',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.purple)
      .setAuthor({ name: `${BRAND.name} • Bulk DM Engine ${BRAND.version}` })
      .setTitle('💌 REXAL — Toplu DM Sender')
      .setDescription([
        UX.header, UX.footerLine, '',
        statusLine([['🌐', 'Sistem', 'Hazır'], ['📥', 'Mod', 'Round-Robin'], ['⏱️', 'Tempo', 'Güvenli']]),
        '',
        section('Ne Yapar?'),
        'Kasadaki seçtiğin hesaplarla, girdiğin **kullanıcı ID listesine** toplu DM atar.',
        'Hedefler hesaplara **round-robin** bölünür — tek hesap dokatmaz.',
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('🔄', 'Round-Robin', 'Hedefler hesaplara eşit dağıtılır')}`,
        `> ${UX.dot2} ${bullet('📝', 'Şablon Havuzu', 'Her satır ayrı şablon, `{@user}` etiketi destekli')}`,
        `> ${UX.dot2} ${bullet('⏱️', 'Rate Koruması', 'Hedef arası \`4sn\`, hesap arası \`6sn\`, limitte \`8sn\` bekleme')}`,
        `> ${UX.dot2} ${bullet('♻️', '`{@user}`', 'Mesajda hedefi etiketler • `{@me}` gönderen hesabı yazar')}`,
        '',
        section('Kontrol Paneli'),
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('dmsender:baslat').setLabel('DM Kampanyası Başlat').setEmoji('💌').setStyle(ButtonStyle.Success),
      )],
    });
  },

  async onButton(interaction) {
    if (runningJobs.has(interaction.user.id)) {
      return interaction.reply({ content: '⚠️ Devam eden bir DM kampanyanız var, bitmesini bekleyin.', ephemeral: true });
    }
    if (getTokens(interaction.user.id).length === 0) {
      return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
    }

    const modal = new ModalBuilder().setCustomId('dmsender:modal').setTitle('💌 Toplu DM Kampanyası');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('targets').setLabel('Hedef kullanıcı ID\'leri (virgül/satır ile)')
          .setPlaceholder('123..., 456..., 789...').setStyle(TextInputStyle.Paragraph).setRequired(true)),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('messages').setLabel('Mesaj şablonları (her satır ayrı)')
          .setPlaceholder('Merhaba {@user}! ...\nSelam {@user}!').setStyle(TextInputStyle.Paragraph).setRequired(true)),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('accounts').setLabel('Hesap numaraları (boş=tümü) ör: 1,2,3')
          .setPlaceholder('Boş = tüm geçerli hesaplar').setStyle(TextInputStyle.Short).setRequired(false)),
    );
    return interaction.showModal(modal);
  },

  async onModalSubmit(interaction) {
    const targets = interaction.fields.getTextInputValue('targets').split(/[\n, ]+/).map(s => s.trim()).filter(s => /^\d{5,}$/.test(s));
    const messages = interaction.fields.getTextInputValue('messages').split('\n').map(s => s.trim()).filter(Boolean);
    const hesapRaw = interaction.fields.getTextInputValue('accounts')?.trim() || '';

    if (targets.length === 0) return interaction.reply({ embeds: [errorEmbed('Geçerli kullanıcı ID girmediniz!')], ephemeral: true });
    if (messages.length === 0) return interaction.reply({ embeds: [errorEmbed('En az bir mesaj şablonu gerekli!')], ephemeral: true });

    const tokens = getTokens(interaction.user.id);
    let indices = tokens.map((_, i) => i).filter(i => tokens[i].status !== 'gecersiz');
    if (hesapRaw) {
      const wanted = hesapRaw.split(/[, ]+/).map(x => parseInt(x, 10) - 1).filter(n => !isNaN(n));
      indices = indices.filter(i => wanted.includes(i));
      if (indices.length === 0) return interaction.reply({ embeds: [errorEmbed('Belirtilen hesap numaraları geçersiz!')], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    runningJobs.add(interaction.user.id);
    try {
      const reports = await runBulkDm(interaction.user.id, indices, targets, messages);
      const totalSent = reports.reduce((s, r) => s + (r.sent || 0), 0);
      const embed = new EmbedBuilder()
        .setTitle('💌 Toplu DM Raporu')
        .setColor(COLORS.success)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 🎯 **Hedef sayısı:** \`${targets.length}\`  👥 **Hesap:** \`${indices.length}\`  📨 **Gönderilen:** \`${totalSent}\``,
          '',
          buildReportLines(reports),
          `\`${THIN_DIVIDER}\``,
          `> ♾️ *Tüm oturumlar kapatıldı — sıfır iz bırakıldı.*`,
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(`Kampanya hatası: ${err.message}`)] });
    } finally {
      runningJobs.delete(interaction.user.id);
    }
  },
};
