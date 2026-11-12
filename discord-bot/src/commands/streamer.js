// src/commands/streamer.js — 📺 REXAL Streamer Rich Presence Paneli
// Fotoğraftaki panelin bot entegrasyonu:
//  - Kasadan hesap seç → 7/24 "canlı yayında" görünür (STREAMING + mor rozet)
//  - Özel yayın başlığı, oyun/kategori, opsiyonel logo görseli
//  - Yayından çıkar: tek tıkla normal duruma döner
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  startStreamerPresence, stopStreamerPresence, stopAllStreams,
  isStreaming, listStreams,
} from '../utils/streamerPresenceRunner.js';
import { COLORS, errorEmbed, BRAND, UX, section, bullet, statusLine, THIN_DIVIDER } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('REXAL Streamer Engine');

// Kullanıcı elle görsel değiştirmek istediğinde hangi akışta olduğunu tutar
const pendingImage = new Map(); // userId -> tokenIndex

function buildPanel(userId) {
  const streams = listStreams(userId);
  const aktif = streams.length
    ? streams.map(s =>
      `> 📺 **${s.username || `Hesap #${s.tokenIndex + 1}`}** — \`${s.platform}\` • *${s.title || 'Canlı Yayında!'}* • \`${s.minutes} dk\``
    ).join('\n')
    : '> ⚫ *Aktif yayın yok — "Kasadan Hesap Seç" ile 30 saniyede başlat!*';

  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setAuthor({ name: `${BRAND.name} • REXAL Streamer ${BRAND.version}` })
    .setTitle('📺 REXAL — Streamer Rich Presence')
    .setDescription([
      UX.header,
      `⚠️ **Sistem Durumu:** \`${streams.length ? 'Aktif' : 'Çevrimiçi'}\``,
      '',
      section('Sistem Açıklaması'),
      'Discord hesaplarını **7/24 Kesintisiz Aktif** ve **Streamer Rich Presence** durumuna getirir.',
      'Profilinizde mor canlı yayın rozeti yanar, özel yayın başlığı ve (istersen) özel streamer',
      'görseli görüntülenir.',
      '',
      section('⚡ Kontrol & Özelleştirme'),
      `> ${UX.dot2} ${bullet('🔑', 'Kasadan Hesap Seç', 'Vault\'ta eklediğin hesapları tek tıkla canlı yayına sok')}`,
      `> ${UX.dot2} ${bullet('🖼️', 'Özel Görsel', 'Yayın kartında görünecek logo/banner linkini belirle')}`,
      `> ${UX.dot2} ${bullet('📤', 'Yayından Çıkar', 'İstediğin hesabı tek tıkla normal çevrimiçi durumuna döndür')}`,
      '',
      section('📺 Aktif Yayınlar'),
      aktif,
    ].join('\n'))
    .setFooter(FOOTER())
    .setTimestamp();
}

const BUTTONS = () => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('streamer:sec').setLabel('Kasadan Hesap Seç').setEmoji('🔑').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('streamer:gorsel').setLabel('Görsel Değiştir').setEmoji('🖼️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('streamer:cikar').setLabel('Yayından Çıkar').setEmoji('📤').setStyle(ButtonStyle.Danger),
  ),
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('streamer:yardim').setLabel('Yardım / SSS').setEmoji('❓').setStyle(ButtonStyle.Secondary),
  ),
];

export default {
  name: 'streamer',
  aliases: ['yayin', 'streamerpresence', 'canliyayin'],
  description: 'REXAL 📺 REXAL Streamer Rich Presence Paneli',

  async execute(message) {
    await message.reply({ embeds: [buildPanel(message.author.id)], components: BUTTONS() });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;
    const tokens = getTokens(userId);

    if (action === 'yardim') {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('❓ Streamer Presence — Yardım & SSS')
          .setColor(COLORS.info)
          .setDescription([
            `\`${THIN_DIVIDER}\``,
            section('Yayın linki ne olmalı?'),
            '> **Twitch:** `https://twitch.tv/kullaniciadi`',
            '> **YouTube:** `https://youtube.com/watch?v=VIDEO_ID` veya kanal linki',
            '> Link geçersizse presence Discord tarafından reddedilir.',
            '',
            section('Mor rozet ne zaman çıkar?'),
            '> Presence kabul edilir edilmez çıkar (genelde 5-30 sn).',
            '> Görünmüyorsa profiline **başka bir hesaptan** bak — kendi istemcin cache\'ler.',
            '',
            section('Görsel Değiştir ne yapar?'),
            '> Yayın kartında görünen büyük görseli değiştirir. JPG/PNG linki ver',
            '> (örn bir logo). Boş bırakırsan varsayılan görünüm kalır.',
            '> ⚠️ Görseli değiştirmek için önce hesabı seçmen istenir.',
            '',
            section('"Yayın linki geçersiz" hatası'),
            '> Link formatını kontrol et. `twitch.tv/kanka` değil,',
            '> `https://twitch.tv/kanka` şeklinde tam olmalı.',
            '',
            section('Hesap offline görünüyorsa'),
            '> "Yayından Çıkar" → hesabı tekrar seç → yeniden başlat.',
            '> Token ölmüş olabilir: `!hesaplarim` → Denetle.',
          ].join('\n'))
          .setFooter(FOOTER()).setTimestamp()],
        ephemeral: true,
      });
    }

    // ── Yayın başlat: hesap seç ──
    if (action === 'sec') {
      if (tokens.length === 0) return interaction.reply({ content: '📦 Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
      const options = tokens.slice(0, 25).map((t, i) => ({
        label: `${i + 1}. ${t.label || t.username || `Hesap ${i + 1}`}`.slice(0, 100),
        description: isStreaming(userId, i) ? '✅ Yayında — yeniden seçersen üzerine yazar' : '💤 Yayında değil',
        value: String(i), emoji: isStreaming(userId, i) ? '📺' : '💤',
      }));
      return interaction.reply({
        content: '**🔑 ADIM 1/2 — Hangi hesap canlı yayına girsin?**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('streamer:modal')
            .setPlaceholder('📺 Yayına sokacağın hesabı seç...').addOptions(options),
        )], ephemeral: true,
      });
    }

    // ── Görsel değiştir: önce hesap, sonra sadece görsel URL'i güncellenir ──
    if (action === 'gorsel') {
      const streams = listStreams(userId);
      if (streams.length === 0) {
        return interaction.reply({ content: '⚠️ Önce bir yayın başlat — görsel yayında olan hesaba eklenir.', ephemeral: true });
      }
      pendingImage.set(userId, null);
      const options = streams.map(s => ({
        label: `${s.username || `Hesap #${s.tokenIndex + 1}`}`.slice(0, 100),
        description: `Şu anki: ${s.title || 'varsayılan'}`,
        value: String(s.tokenIndex), emoji: '🖼️',
      }));
      return interaction.reply({
        content: '**🖼️ Hangi yayının görselini değiştirelim?**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('streamer:gorselsec')
            .setPlaceholder('🖼️ Yayın seç...').addOptions(options),
        )], ephemeral: true,
      });
    }

    // ── Yayından çıkar ──
    if (action === 'cikar') {
      const streams = listStreams(userId);
      if (streams.length === 0) return interaction.reply({ content: '⚫ Aktif yayın yok.', ephemeral: true });
      if (streams.length === 1) {
        stopStreamerPresence(userId, streams[0].tokenIndex);
        return interaction.reply({ content: `📤 **${streams[0].username || 'Hesap'}** yayından çıkarıldı — normal çevrimiçi durumuna döndü.`, ephemeral: true });
      }
      const options = streams.map(s => ({
        label: `${s.username || `Hesap #${s.tokenIndex + 1}`} — ${s.platform}`.slice(0, 100),
        value: String(s.tokenIndex), emoji: '📤',
      }));
      options.push({ label: '💀 TÜM YAYINLARI KAPAT', value: 'all', emoji: '💀' });
      return interaction.reply({
        content: '**📤 Hangi yayını kapatalım?**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('streamer:cikar_sec')
            .setPlaceholder('📤 Yayın seç...').addOptions(options),
        )], ephemeral: true,
      });
    }
  },

  async onSelect(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    // Yayın başlatma modalı
    if (action === 'modal') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      const modal = new ModalBuilder().setCustomId(`streamer:modal:${tokenIndex}`).setTitle('📺 Yayın Ayarları');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('stream_url').setLabel('Yayın linki (Twitch/YouTube)')
          .setPlaceholder('https://twitch.tv/kullaniciadi').setStyle(TextInputStyle.Short).setRequired(true),
      ));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('title').setLabel('Yayın başlığı')
          .setPlaceholder('örn: Sabah junkesi 🌅 | !social').setStyle(TextInputStyle.Short).setRequired(false)
          .setMaxLength(100),
      ));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('game').setLabel('Oyun / kategori')
          .setPlaceholder('örn: Just Chatting (boş = Just Chatting)').setStyle(TextInputStyle.Short).setRequired(false),
      ));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('image').setLabel('Logo/banner URL (opsiyonel)')
          .setPlaceholder('https://...jpg — boş bırakırsan varsayılan').setStyle(TextInputStyle.Short).setRequired(false),
      ));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('durum').setLabel('Profil durumu (online/dnd, boş=dnd)')
          .setPlaceholder('dnd — yayıncılar genelde dnd görünür').setStyle(TextInputStyle.Short).setRequired(false),
      ));
      return interaction.showModal(modal);
    }

    // Görsel değiştirme modalı (sadece görsel alanı)
    if (action === 'gorselsec') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      pendingImage.set(userId, tokenIndex);
      const modal = new ModalBuilder().setCustomId(`streamer:gorsel_modal:${tokenIndex}`).setTitle('🖼️ Yayın Görselini Değiştir');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('image').setLabel('Yeni logo/banner URL')
          .setPlaceholder('https://...jpg — temizlemek için "sil" yaz').setStyle(TextInputStyle.Short).setRequired(true),
      ));
      return interaction.showModal(modal);
    }

    // Yayından çıkarma
    if (action === 'cikar_sec') {
      const val = interaction.values[0];
      if (val === 'all') {
        const n = stopAllStreams(userId);
        return interaction.update({ content: `💀 **${n} yayının tamamı kapatıldı.**`, components: [] });
      }
      const r = stopStreamerPresence(userId, Number(val));
      return interaction.update({
        content: r.ok ? '📤 **Yayın kapatıldı** — hesap normal duruma döndü.' : '❌ Hesap bulunamadı.',
        components: [],
      });
    }
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'modal' && parts[0] !== 'gorsel_modal') return;
    const userId = interaction.user.id;
    const tokenIndex = parseInt(parts[1], 10);
    const tokens = getTokens(userId);
    const t = tokens[tokenIndex];
    if (!t) return interaction.reply({ embeds: [errorEmbed('Hesap bulunamadı — kasadan silinmiş olabilir.')], ephemeral: true });

    // ── Sadece görsel güncelleme ──
    if (parts[0] === 'gorsel_modal') {
      const img = interaction.fields.getTextInputValue('image').trim();
      if (/^sil$/i.test(img)) {
        // Yayını aynı ayarlarla görselsiz yeniden başlat
        const streams = listStreams(userId);
        const cur = streams.find(s => s.tokenIndex === tokenIndex);
        const cfg = {
          streamUrl: cur?.streamUrl || 'https://twitch.tv/discord',
          title: cur?.title || '', game: cur?.game || '', imageUrl: '', statusChoice: 'dnd',
        };
        await interaction.deferReply({ ephemeral: true });
        const res = await startStreamerPresence(userId, tokenIndex, t, cfg);
        return interaction.editReply({
          embeds: [res.ok
            ? new EmbedBuilder().setTitle('🖼️ Görsel Temizlendi').setColor(COLORS.success)
              .setDescription(`> Yayın artık varsayılan görselle devam ediyor.`).setFooter(FOOTER())
            : errorEmbed(`Güncellenemedi: \`${res.error}\``)],
        });
      }
      if (!/^https?:\/\/.+\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(img)) {
        return interaction.reply({ embeds: [errorEmbed('Görsel linki `https://....png/jpg/gif/webp` formatında olmalı.')], ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const streams = listStreams(userId);
      const cur = streams.find(s => s.tokenIndex === tokenIndex);
      const cfg = {
        streamUrl: cur?.streamUrl || 'https://twitch.tv/discord',
        title: cur?.title || '', game: cur?.game || '', imageUrl: img, statusChoice: 'dnd',
      };
      const res = await startStreamerPresence(userId, tokenIndex, t, cfg);
      return interaction.editReply({
        embeds: [res.ok
          ? new EmbedBuilder().setTitle('🖼️ Görsel Güncellendi!').setColor(COLORS.success)
            .setDescription([
              `> 🖼️ Yeni görsel: ${img}`,
              `> 👤 Hesap: \`${res.username}\``,
              `> ⏱️ Kart güncellemesi 10-30 sn sürebilir.`,
            ].join('\n')).setFooter(FOOTER())
          : errorEmbed(`Güncellenemedi: \`${res.error}\``)],
      });
    }

    // ── Yeni yayın başlatma ──
    const streamUrl = interaction.fields.getTextInputValue('stream_url').trim();
    const title = interaction.fields.getTextInputValue('title').trim();
    const game = interaction.fields.getTextInputValue('game').trim();
    const imageUrl = interaction.fields.getTextInputValue('image').trim();
    const durumStr = (interaction.fields.getTextInputValue('durum') || '').trim().toLowerCase();
    const statusChoice = ['online', 'dnd', 'idle', 'bosta', 'rahatsiz', 'gorunmez', 'invisible'].includes(durumStr) ? durumStr : 'dnd';

    await interaction.deferReply({ ephemeral: true });
    const res = await startStreamerPresence(userId, tokenIndex, t, {
      streamUrl, title, game, imageUrl, statusChoice,
    });

    if (!res.ok) {
      return interaction.editReply({ embeds: [errorEmbed(`Yayın başlatılamadı:\n\`${res.error}\`\n\n**Kontrol listesi:**\n> • Link \`https://twitch.tv/isim\` formatında olmalı\n> • Token geçerli mi? \`!hesaplarim\` → Denetle\n> • 1-2 dk sonra tekrar dene`)] });
    }

    const platform = streamUrl.includes('youtube') ? 'YouTube' : 'Twitch';
    const embed = new EmbedBuilder()
      .setTitle('📺 Yayın Aktif!')
      .setColor(0x9146ff)
      .setDescription([
        `\`${THIN_DIVIDER}\``,
        `> 👤 **Hesap:** \`${res.username}\``,
        `> 🌐 **Platform:** \`${platform}\`  •  🔗 ${streamUrl}`,
        title ? `> 📝 **Başlık:** *${title}*` : null,
        game ? `> 🎮 **Kategori:** ${game}` : null,
        imageUrl ? `> 🖼️ **Özel görsel:** ayarlandı` : null,
        '',
        `> 💜 Mor canlı yayın rozeti 5-30 sn içinde profilde belirir.`,
        `> ♻️ Reboot Recovery aktif  •  💓 Keep-Alive 4dk  •  🔁 7/24 kesintisiz`,
        `\`${THIN_DIVIDER}\``,
      ].filter(Boolean).join('\n'))
      .setFooter(FOOTER()).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  },
};
