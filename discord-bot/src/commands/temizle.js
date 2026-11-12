// src/commands/temizle.js — 🧹 REXAL Mesaj & DM Temizlik Paneli
// Ekran görüntüsündeki panelin birebir benzeri:
//  - DM Konuşmaları Sil: belirtilen kullanıcıyla olan DM'lerdeki kendi mesajlarını siler
//  - Sunucu Kanallarını Sil: belirtilen sunucudaki kendi mesajlarını siler
// Kasadaki hesap seçilerek çalışır. Panel sadece sahibine özeldir.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import { cleanDmWithUser, cleanGuildMessages } from '../utils/messageCleaner.js';
import { COLORS, errorEmbed, BRAND, UX, section, bullet, statusLine, THIN_DIVIDER } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('REXAL Cleanup Engine');

// userId -> { tip: 'dm'|'sunucu', tokenIndex, hedef }
const pendingFlow = new Map();
const runningJobs = new Set(); // aynı anda tek temizlik

function buildPanelEmbed(userId) {
  const tokens = getTokens(userId);
  return new EmbedBuilder()
    .setColor(COLORS.darkPurple)
    .setAuthor({ name: `${BRAND.name} • REXAL Temizlik ${BRAND.version}` })
    .setTitle('🗑️ REXAL — Mesaj & DM Temizlik Paneli')
    .setDescription([
      UX.header,
      statusLine([['📮', 'Sistem', 'Hazır'], ['🔁', 'Mod', 'Geriye Dönük Silme']]),
      '',
      section('Mesaj Temizliği Nedir?'),
      'Belirttiğin hesabın geçmişte gönderdiği tüm mesajları **(DM konuşmaları veya sunucudaki kanallar)**',
      'geriye dönük olarak tamamen silmesini sağlar.',
      '',
      section('⚠️ Temizlik Seçenekleri'),
      `> ${UX.dot2} ${bullet('✅', 'DM Konuşmaları Sil', 'Belirtilen kullanıcı ile olan özel sohbetten sana ait tüm mesajları siler')}`,
      `> ${UX.dot2} ${bullet('✅', 'Sunucu Kanallarını Sil', 'Belirtilen sunucuda tokena ait tüm yazılı mesajları kanalları tek tek tarayarak siler')}`,
      '',
      section('Kontrol Paneli'),
      'Aşağıdaki butonlarla temizlik sihirbazını başlat:',
      '',
      `📁 Kasan: \`${tokens.length}\` hesap`,
      '⏱️ Tempo güvenli: silme arası 1sn civarı, rate-limit korumalı.',
    ].join('\n'))
    .setFooter(FOOTER())
    .setTimestamp();
}

const PANEL_BUTTONS = () => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('temizle:dm').setLabel('DM Mesajlarını Temizle').setEmoji('🗑️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('temizle:sunucu').setLabel('Sunucu Mesajlarını Temizle').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('temizle:yardim').setLabel('Yardım').setEmoji('❓').setStyle(ButtonStyle.Secondary),
  ),
];

export default {
  name: 'temizle',
  aliases: ['REXAL', 'mesajtemizle', 'dmtemizle', 'cleanup'],
  description: 'REXAL 🧹 REXAL — Mesaj & DM Temizlik Paneli',

  async execute(message) {
    await message.reply({ embeds: [buildPanelEmbed(message.author.id)], components: PANEL_BUTTONS() });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'yardim') {
      const embed = new EmbedBuilder()
        .setTitle('❓ Temizlik — Yardım & SSS')
        .setColor(COLORS.info)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          section('DM temizliği nasıl çalışır?'),
          '> Seçtiğin hesap, hedef kullanıcıyla olan DM kanalını açar ve kendi yazdığı',
          '> mesajları en yeniden başlayarak geriye doğru siler. Karşı tarafın mesajlarına dokunmaz.',
          '',
          section('Sunucu temizliği nasıl çalışır?'),
          '> Seçtiğin hesap, girdiğin sunucunun metin kanallarını tek tek gezer;',
          '> her kanalda kendi mesajlarını bulur ve siler (kanal başına max 200).',
          '',
          section('Ne kadar sürer?'),
          '> Mesaj başına ~1sn + kanal geçişlerinde 3sn bekler (rate-limit koruması).',
          '> 1000 mesaj ≈ 20-25 dakika. Panel işlem sonunda rapor verir.',
          '',
          section('Geri alınamaz mı?'),
          '> Evet — silinen mesajlar geri gelmez. Başlatmadan önce emin ol!',
          '',
          section('"Kullanıcı bulunamadı" / "Sunucu bulunamadı"'),
          '> ID hatalı olabilir VEYA hesap o kullanıcıya/sunucuya erişemiyor.',
          '> DM için: karşı taraf DM kapatabilir. Sunucu için: hesabın sunucuda olması gerekir.',
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (runningJobs.has(userId)) {
      return interaction.reply({ content: '⚠️ Devam eden bir temizlik var — bitmesini bekle.', ephemeral: true });
    }
    if (getTokens(userId).length === 0) {
      return interaction.reply({
        content: '📦 Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true,
      });
    }

    pendingFlow.set(userId, { tip: action === 'dm' ? 'dm' : 'sunucu' });

    const options = getTokens(userId).slice(0, 25).map((t, i) => ({
      label: `${i + 1}. ${t.label || t.username || `Hesap ${i + 1}`}`.slice(0, 100),
      value: String(i), emoji: '🧹',
    }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('temizle:hesapsec')
        .setPlaceholder(action === 'dm' ? '🗑️ DM temizliği yapacak hesabı seç...' : '🗑️ Sunucu temizliği yapacak hesabı seç...')
        .addOptions(options),
    );
    return interaction.reply({
      content: '**ADIM 1/3 — Hangi hesabın mesajları temizlensin?**',
      components: [row], ephemeral: true,
    });
  },

  async onSelect(interaction, parts) {
    if (parts[0] !== 'hesapsec') return;
    const userId = interaction.user.id;
    const flow = pendingFlow.get(userId);
    if (!flow) return interaction.update({ content: '⌛ Oturum süresi doldu, yeniden başlat.', components: [] });

    flow.tokenIndex = parseInt(interaction.values[0], 10);

    if (flow.tip === 'dm') {
      const modal = new ModalBuilder().setCustomId(`temizle:modal:dm:${flow.tokenIndex}`).setTitle('🗑️ DM Temizliği');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('hedef').setLabel('Hedef kullanıcı ID')
          .setPlaceholder('örn: 123456789012345678').setStyle(TextInputStyle.Short).setRequired(true),
      ));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('maxgun').setLabel('Kaç günden eskiler silinsin (boş=tümü)')
          .setPlaceholder('örn: 30 (boş bırak = hepsi)').setStyle(TextInputStyle.Short).setRequired(false),
      ));
      return interaction.showModal(modal);
    }

    const modal = new ModalBuilder().setCustomId(`temizle:modal:sunucu:${flow.tokenIndex}`).setTitle('🗑️ Sunucu Temizliği');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('sunucu_id').setLabel('Sunucu ID')
        .setPlaceholder('örn: 123456789012345678').setStyle(TextInputStyle.Short).setRequired(true),
    ));
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('kanal_limit').setLabel('Max kanal tarama (boş=40)')
        .setPlaceholder('40').setStyle(TextInputStyle.Short).setRequired(false),
    ));
    return interaction.showModal(modal);
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'modal') return;
    const userId = interaction.user.id;
    const tip = parts[1];
    const tokenIndex = parseInt(parts[2], 10);

    await interaction.deferReply({ ephemeral: true });

    // Aynı anda tek temizlik — çakışma yok
    if (runningJobs.has(userId)) {
      return interaction.editReply({ embeds: [errorEmbed('Devam eden temizlik var, bitmesini bekle.')] });
    }

    // ── DM temizliği ──
    if (tip === 'dm') {
      const hedef = interaction.fields.getTextInputValue('hedef').trim();
      const maxGunStr = (interaction.fields.getTextInputValue('maxgun') || '').trim();
      const maxAgeDays = /^\d+$/.test(maxGunStr) ? parseInt(maxGunStr, 10) : 0;
      if (!/^\d{17,20}$/.test(hedef)) {
        return interaction.editReply({ embeds: [errorEmbed('Hedef kullanıcı ID geçersiz görünüyor. 17-20 haneli sayı olmalı.')] });
      }

      runningJobs.add(userId);
      const embed = new EmbedBuilder()
        .setTitle('🧹 DM Temizliği Başladı...')
        .setColor(COLORS.info)
        .setDescription(`> ⏳ Hesap #${tokenIndex + 1} — <@${hedef}> ile DM konuşması taranıyor...\n> Mesajlar teker teker siliniyor, bu biraz sürebilir.`)
        .setFooter(FOOTER()).setTimestamp();
      await interaction.editReply({ embeds: [embed] });

      const res = await cleanDmWithUser(userId, tokenIndex, hedef, { maxAgeDays });
      runningJobs.delete(userId);

      if (!res.ok) {
        return interaction.followUp({ embeds: [errorEmbed(`Temizlik başarısız:\n\`${res.error}\``)], ephemeral: true });
      }
      const sonuc = new EmbedBuilder()
        .setTitle('✅ DM Temizliği Tamamlandı')
        .setColor(COLORS.success)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 🗑️ **Silinen mesaj:** \`${res.deleted}\``,
          `> 🔍 **Taranan (senin) mesaj:** \`${res.scanned}\``,
          `> 👤 **Hesap:** \`${res.username}\`  •  🎯 Hedef: <@${hedef}>`,
          maxAgeDays ? `> 📅 Sınır: son ${maxAgeDays} gün` : '> 📅 Sınır: tüm geçmiş',
          '',
          `*Karşı tarafın mesajlarına dokunulmadı.*`,
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      return interaction.followUp({ embeds: [sonuc], ephemeral: true });
    }

    // ── Sunucu temizliği ──
    const sunucuId = interaction.fields.getTextInputValue('sunucu_id').trim();
    const kanalLimitStr = (interaction.fields.getTextInputValue('kanal_limit') || '').trim();
    const channelLimit = /^\d+$/.test(kanalLimitStr) ? Math.min(100, parseInt(kanalLimitStr, 10)) : 40;
    if (!/^\d{17,20}$/.test(sunucuId)) {
      return interaction.editReply({ embeds: [errorEmbed('Sunucu ID geçersiz görünüyor. 17-20 haneli sayı olmalı.')] });
    }

    runningJobs.add(userId);
    const embed = new EmbedBuilder()
      .setTitle('🧹 Sunucu Temizliği Başladı...')
      .setColor(COLORS.info)
      .setDescription(`> ⏳ Hesap #${tokenIndex + 1} — sunucu kanalları taranıyor...\n> Kanallar tek tek geziliyor, bu **uzun sürebilir** (kanal başına ~3sn + mesaj başına ~1.2sn).`)
      .setFooter(FOOTER()).setTimestamp();
    await interaction.editReply({ embeds: [embed] });

    const res = await cleanGuildMessages(userId, tokenIndex, sunucuId, { channelLimit });
    runningJobs.delete(userId);

    if (!res.ok) {
      return interaction.followUp({ embeds: [errorEmbed(`Temizlik başarısız:\n\`${res.error}\``)], ephemeral: true });
    }
    const sonuc = new EmbedBuilder()
      .setTitle('✅ Sunucu Temizliği Tamamlandı')
      .setColor(COLORS.success)
      .setDescription([
        `\`${THIN_DIVIDER}\``,
        `> 🗑️ **Silinen mesaj:** \`${res.deleted}\``,
        `> 📺 **Taranan kanal:** \`${res.channels}\``,
        `> 👤 **Hesap:** \`${res.username}\``,
        '',
        `*Rate-limit koruması nedeniyle tempo güvenli tutuldu.*`,
      ].join('\n'))
      .setFooter(FOOTER()).setTimestamp();
    return interaction.followUp({ embeds: [sonuc], ephemeral: true });
  },
};
