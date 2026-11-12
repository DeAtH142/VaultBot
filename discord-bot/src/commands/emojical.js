// src/commands/emojical.js — 🌙 REXAL Emoji & Sticker Çalıcı Paneli
// Ekran görüntüsündeki "REXAL Emoji & Sticker Çalıcı" panelinin botumuza uyarlanmış hali.
// Akış: Çal butonu → kaynak hesap seç → kaynak sunucu ID (+opsiyonel davet) → hedef sunucu ID
//       → bot emojileri/sticker'ları indirip hedef sunucuya yükler → DM raporu.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import { stealEmojis, fetchEmojisAsZip, uploadEmojisWithSelfbot } from '../utils/emojiStealer.js';
import { COLORS, errorEmbed, BRAND, UX, section, bullet, statusLine, THIN_DIVIDER } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('REXAL Emoji Thief Engine');

// userId -> { tokenIndex, kaynak, davet, hedef }
const pendingFlow = new Map();
const runningJobs = new Set();

export default {
  name: 'emojical',
  aliases: ['emojicopy', 'emojical', 'emoji-cal'],
  description: 'REXAL 🌙 REXAL Emoji & Sticker Çalıcı Paneli',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setAuthor({ name: `${BRAND.name} • REXAL Emoji Thief ${BRAND.version}` })
      .setTitle('🌙 REXAL Emoji & Sticker Çalıcı')
      .setDescription([
        UX.header,
        statusLine([['🟢', 'Sistem Durumu', 'Hazır']]),
        '',
        section('Emoji/Sticker Çalıcı Nedir?'),
        'Hedef sunucudaki tüm özel emojileri ve sticker\'ları vault\'taki bir hesap üzerinden çeker,',
        'başka bir sunucuya yükler.',
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('🔁', 'Kendi Hesabınla Kopyala', 'Yöneticisi olduğun sunucuya direkt kendi tokenin ile yükler')}`,
        `> ${UX.dot2} ${bullet('📦', 'DM ZIP', 'Hedef yoksa emojileri hareketli/hareketsiz klasörlü ZIP olarak DM\'den atar')}`,
        `> ${UX.dot2} ${bullet('🌐', 'Toplu Kopyalama', 'Tüm emojiler ve sticker\'lar tek seferde aktarılır')}`,
        `> ${UX.dot2} ${bullet('🔐', 'Vault Entegrasyonu', 'Kaynak hesabi vault\'tan seç')}`,
        `> ${UX.dot2} ${bullet('🎬', 'Animasyonlu Destek', 'Animasyonlu emojiler de kopyalanır')}`,
        `> ${UX.dot2} ${bullet('📩', 'DM Raporu', 'İşlem bitince detaylı rapor DM\'e gelir')}`,
        '',
        section('Nasıl Çalışır?'),
        '> 1️⃣ Kaynak sunucuya erişebilen bir vault hesabı seç',
        '> 2️⃣ Kaynak sunucu ID\'sini gir (hesap üye değilse davet kodu da verebilirsin)',
        '> 3️⃣ Hedef sunucu ID\'sini gir (botun **bu sunucuda** olması + Emoji Yönet yetkisi şart)',
        '> 4️⃣ Bot indirir → yükler → rapor DM\'ne düşer',
        '',
        section('Kontrol Paneli'),
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('emojical:cal').setLabel('Emoji/Sticker Çal').setEmoji('🌙').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('emojical:selfbot_copy').setLabel('Kendi Hesabınla Kopyala').setEmoji('🔁').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('emojical:dm_zip').setLabel('DM ZIP Al').setEmoji('📦').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('emojical:yardim').setLabel('Yardım').setEmoji('❓').setStyle(ButtonStyle.Secondary),
      )],
    });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'yardim') {
      const embed = new EmbedBuilder()
        .setTitle('❓ Emoji Çalıcı — Yardım & SSS')
        .setColor(COLORS.info)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          section('Hangi hesabı seçmeliyim?'),
          '> Kaynak sunucuda **üye olan** bir vault hesabı. Üye değilse, davet kodu',
          '> girersen hesap davete katılıp emojileri çeker.',
          '',
          section('Yükleme neden botla yapılıyor?'),
          '> Kullanıcı tokeni ile emoji oluşturmak riskli ve kısıtlı.',
          '> **Ben (bot)** hedef sunucuda "Emoji Yönet" + "Sticker Yönet" yetkisiyle',
          '> yükleme yapıyorum — güvenli ve kalıcı.',
          '',
          section('Bot hedef sunucuda olmalı!'),
          '> Botun yükleme yapacağı sunucuda davetli olması gerekir.',
          '> Bot yetkisi yoksa yükleme başarısız olur.',
          '',
          section('Slot dolulukları'),
          '> Normal sunucular: **100 emoji** / ~5-40 sticker. Doluysa ilk boş slotlardan',
          '> devam eder, sığmayanlar raporda "başarısız" listelenir.',
          '',
          section('İsim çakışmaları'),
          '> Hedef sunucuda aynı isimde emoji varsa o emoji atlanır — üzerine yazmaz.',
          '',
          section('Davet kodu nasıl yazılır?'),
          '> Sadece kod: `abc123` (discord.gg/ kısmını yazma).',
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (runningJobs.has(userId)) {
      return interaction.reply({ content: '⚠️ Devam eden bir emoji çalma işlemi var — bitmesini bekle.', ephemeral: true });
    }
    if (getTokens(userId).length === 0) {
      return interaction.reply({ content: '📦 Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
    }

    // Akış tipi — hesap seçtikten sonra hangi modal geleceğini belirler
    const flowMode = (action === 'selfbot_copy') ? 'selfbot_copy' : (action === 'dm_zip') ? 'dm_zip' : 'bot_copy';
    if (!pendingFlow.has(userId)) pendingFlow.set(userId, {});
    pendingFlow.get(userId).mode = flowMode;

    const options = getTokens(userId).slice(0, 25).map((t, i) => ({
      label: `${i + 1}. ${t.label || t.username || `Hesap ${i + 1}`}`.slice(0, 100),
      value: String(i), emoji: '🌙',
    }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('emojical:hesapsec')
        .setPlaceholder(`🌙 Kaynak sunucuya erişen hesabı seç (${flowMode === 'bot_copy' ? 'Bot ile Çal' : flowMode === 'selfbot_copy' ? 'Kendi Hesabınla Kopyala' : 'DM ZIP'})...`)
        .addOptions(options),
    );
    return interaction.reply({ content: '**ADIM 1/2 — Kaynak sunucuya erişen hesabı seç:**', components: [row], ephemeral: true });
  },

  async onSelect(interaction, parts) {
    if (parts[0] !== 'hesapsec') return;
    const userId = interaction.user.id;
    const tokenIndex = parseInt(interaction.values[0], 10);

    const flow = pendingFlow.get(userId) || {};
    flow.tokenIndex = tokenIndex;
    pendingFlow.set(userId, flow);

    const isSelfbotCopy = flow.mode === 'selfbot_copy';
    const isDmZip = flow.mode === 'dm_zip';

    const modal = new ModalBuilder().setCustomId(`emojical:modal:${tokenIndex}`).setTitle(
      isSelfbotCopy ? '🔁 Hesabınla Kopyala' : isDmZip ? '📦 DM ZIP Ayarları' : '🌙 Emoji Çalma Ayarları'
    );
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('kaynak_id').setLabel('Kaynak sunucu ID')
        .setPlaceholder('örn: 123456789012345678').setStyle(TextInputStyle.Short).setRequired(true),
    ));
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('davet').setLabel('Davet kodu (hesap üye değilse)')
        .setPlaceholder('örn: abc123 — üye ise boş bırak').setStyle(TextInputStyle.Short).setRequired(false),
    ));
    if (isDmZip) {
      // DM ZIP'te hedef sunucu gerekmez
    } else {
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('hedef_id').setLabel(isSelfbotCopy ? 'Hedef sunucu ID (yöneticisi olduğun)' : 'Hedef sunucu ID (botun olduğu)')
          .setPlaceholder('örn: 987654321098765432').setStyle(TextInputStyle.Short).setRequired(true),
      ));
    }
    return interaction.showModal(modal);
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'modal') return;
    const userId = interaction.user.id;
    const tokenIndex = parseInt(parts[1], 10);

    const kaynak = interaction.fields.getTextInputValue('kaynak_id').trim();
    const davet = (interaction.fields.getTextInputValue('davet') || '').trim().replace(/^https?:\/\/(www\.)?discord\.gg\//i, '').replace(/^discord\.gg\//i, '');
    const flow = pendingFlow.get(userId) || {};
    const mode = flow.mode || 'bot_copy';
    pendingFlow.delete(userId);
    const hedef = (interaction.fields.fields.get('hedef_id')?.value || '').trim();

    if (!/^\d{17,20}$/.test(kaynak) || (hedef && !/^\d{17,20}$/.test(hedef))) {
      return interaction.reply({ embeds: [errorEmbed('Sunucu ID\'leri 17-20 haneli sayı olmalı.')], ephemeral: true });
    }
    if (runningJobs.has(userId)) {
      return interaction.reply({ content: '⚠️ Devam eden işlem var.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    runningJobs.add(userId);

    // ── MOD: selfbot_copy (kendi hesabınla yükle) ──
    if (mode === 'selfbot_copy') {
      const res = await uploadEmojisWithSelfbot(userId, tokenIndex, kaynak, davet || null, hedef);
      runningJobs.delete(userId);
      const reportEmbed = res.ok ? new EmbedBuilder()
        .setTitle('✅ Hesabınla Kopyalama Tamamlandı')
        .setColor(COLORS.success)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 👤 **Hesap:** \`${res.username}\``,
          `> 🌙 **Kaynak:** \`${res.source}\` → 🎯 **Hedef:** \`${res.target}\``,
          '',
          `> 😀 **Emoji:** \`${res.emojiOk}/${res.emojiTotal}\` yüklendi${res.emojiFail ? ` (\`${res.emojiFail}\` atlandı)` : ''}`,
          '',
          res.failReasons?.length ? [`**⚠️ Bazı hatalar:**`, res.failReasons.map(r => `> • ${r}`).join('\n')].join('\n') : null,
          `\`${THIN_DIVIDER}\``,
        ].filter(Boolean).join('\n'))
        .setFooter(FOOTER()).setTimestamp()
        : errorEmbed(`Kopyalama başarısız:\n\`${res.error}\``);
      await interaction.user.send({ embeds: [reportEmbed] }).catch(() => { });
      return interaction.editReply({ embeds: [reportEmbed] });
    }

    // ── MOD: dm_zip (DM'den ZIP gönder) ──
    if (mode === 'dm_zip') {
      const res = await fetchEmojisAsZip(userId, tokenIndex, kaynak, davet || null);
      runningJobs.delete(userId);
      if (!res.ok) {
        const errEmbed = errorEmbed(`ZIP hazırlanamadı:\n\`${res.error}\``);
        return interaction.editReply({ embeds: [errEmbed] });
      }
      const sizeMB = (res.zip.length / 1024 / 1024).toFixed(2);
      const zipReport = new EmbedBuilder()
        .setTitle('📦 Emoji ZIP Hazır!')
        .setColor(COLORS.success)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 👤 **Hesap:** \`${res.username}\``,
          `> 🌙 **Kaynak sunucu:** \`${res.source}\``,
          '',
          `> 😀 **Emoji:** \`${res.emojiCount}\` (hareketli: \`${res.animatedCount}\`, hareketsiz: \`${res.staticCount}\`)`,
          `> 🎨 **Sticker:** \`${res.stickerCount}\``,
          `> 📦 **Boyut:** \`${sizeMB} MB\``,
          '',
          `> 📁 ZIP yapısı:`,
          `> • \`emojiler/hareketli/\` — GIF emojiler`,
          `> • \`emojiler/hareketsiz/\` — PNG emojiler`,
          `> • \`stickerlar/\` — Sticker\'lar`,
          `\`${THIN_DIVIDER}\``,
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      try {
        if (res.zip.length > 25 * 1024 * 1024) throw new Error('ZIP 25 MB sınırını aşıyor');
        await interaction.user.send({
          embeds: [zipReport],
          files: [{ attachment: res.zip, name: `emojiler-${res.source}.zip` }],
        });
        const okEmbed = new EmbedBuilder()
          .setTitle('📤 ZIP DM\'ne Gönderildi')
          .setColor(COLORS.success)
          .setDescription(`> 📦 \`${sizeMB} MB\` — DM\'ni kontrol et!`).setFooter(FOOTER()).setTimestamp();
        return interaction.editReply({ embeds: [okEmbed] });
      } catch (err) {
        return interaction.editReply({ embeds: [errorEmbed(`ZIP gönderilemedi: \`${err.message}\``)] });
      }
    }

    // ── MOD: bot_copy (klasik bot ile çal + hedefe yükle) ──
    const bek = new EmbedBuilder()
      .setTitle('🌙 Emoji Çalma Başladı...')
      .setColor(COLORS.gold)
      .setDescription([
        `> ⏳ **${kaynak}** sunucusundaki emojiler/sticker\'lar taranıyor...`,
        `> 💾 İndirme → yükleme sırası başlayacak. Bu 1-5 dk sürebilir.`,
        `> 📩 Bitince rapor burada + DM\'nde olacak.`,
      ].join('\n'))
      .setFooter(FOOTER()).setTimestamp();
    await interaction.editReply({ embeds: [bek] });

    const res = await stealEmojis(userId, tokenIndex, kaynak, davet || null, interaction.client, hedef);
    runningJobs.delete(userId);

    const reportEmbed = res.ok ? new EmbedBuilder()
      .setTitle('✅ Emoji Çalma Tamamlandı')
      .setColor(COLORS.success)
      .setDescription([
        `\`${THIN_DIVIDER}\``,
        `> 👤 **Kaynak hesap:** \`${res.username}\``,
        `> 🌙 **Kaynak sunucu:** \`${res.source}\` → 🎯 **Hedef:** \`${hedef}\``,
        '',
        `> 😀 **Emoji:** \`${res.emojiOk}/${res.emojiTotal}\` yüklendi${res.emojiFail ? ` (\`${res.emojiFail}\` atlandı/hata)` : ''}`,
        `> 🎨 **Sticker:** \`${res.stickerOk}/${res.stickerTotal}\` yüklendi${res.stickerFail ? ` (\`${res.stickerFail}\` atlandı/hata)` : ''}`,
        '',
        res.failReasons?.length ? [
          `**⚠️ Bazı hatalar:**`,
          res.failReasons.map(r => `> • ${r}`).join('\n'),
        ].join('\n') : null,
        `\`${THIN_DIVIDER}\``,
      ].filter(Boolean).join('\n'))
      .setFooter(FOOTER()).setTimestamp()
      : errorEmbed(`Emoji çalma başarısız:\n\`${res.error}\`\n\n**Kontrol listesi:**\n> • Hesap kaynak sunucuda üye mi? (değilse davet kodu ver)\n> • Bot hedef sunucuda ve "Emoji Yönet" yetkisi var mı?\n> • Sunucu ID'ler doğru mu?`);

    // DM raporu
    await interaction.user.send({ embeds: [reportEmbed] }).catch(() => { });

    return interaction.editReply({ embeds: [reportEmbed] });
  },
};
