// src/commands/kayit.js — 🎙️ Ses Kanalı Kayıt Sistemi
// Akış: Hesap seç → Sunucu/Kanal ID gir → Kayıt başlar.
// Kayıt: PCM → FFmpeg(MP3) → 19 MB'ta bölüm kesilir → OWNER'a DM'lenir → yeni bölüm.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  startVoiceRecording, stopVoiceRecording, getVoiceRecStats,
  listVoiceRecordings, isFfmpegAvailable,
} from '../utils/voiceRecRunner.js';
import { COLORS, THIN_DIVIDER, BRAND, UX, section, statusLine } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('Voice Recorder Engine');
const MAX_SELECT_OPTIONS = 25;

export default {
  name: 'kayit',
  aliases: ['kayıt', 'seskayit', 'rec', 'recorder'],
  description: 'REXAL — Ses Kanalı Kayıt Sistemi Kontrol Paneli',

  async execute(message) {
    const running = listVoiceRecordings(message.author.id);
    const stats = running.map((r) => {
      const s = getVoiceRecStats(message.author.id, r.tokenIndex);
      return `> 🎙️ **Hesap #${r.tokenIndex + 1}** — kanal \`${s.channelId}\`, bölüm: \`${s.partNumber}\`, gönderilen: \`${s.partsSent}\`, toplam: \`${s.totalMB} MB\`, dinleyici: \`${s.listeners}\``;
    });

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setAuthor({ name: `${BRAND.name} • Voice Recorder ${BRAND.version}` })
      .setTitle('🎙️ REXAL — Ses Kanalı Kayıt Sistemi')
      .setThumbnail(message.client.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription([
        UX.header,
        `*${UX.arrow} Hesap ses kanalına girer, konuşan herkesi kaydeder, bölümleri DM'ine yollar*`,
        UX.footerLine,
        '',
        statusLine([['📦', 'Format', 'MP3 128kbps'], ['✂️', 'Bölüm', '19 MB/dosya'], ['🔇', 'VAD', 'Sessizlik filtresi']]),
        '',
        section('Nasıl Çalışır?'),
        `> ${UX.dot2} **Kayıt Başlat** → Vault'tan hesap seç`,
        `> ${UX.dot2} Sunucu + ses kanalı ID'sini gir`,
        `> ${UX.dot2} Hesap kanala girer; kanaldaki konuşmaları kaydeder`,
        `> ${UX.dot2} Dosya **19 MB**'a ulaşınca bölüm DM'ine gönderilir ve kayıt kaldığı yerden devam eder *(güvenlik kamerası mantığı)*`,
        `> ${UX.dot2} Kimse konuşmuyorken boş ses kaydedilmez (VAD)`,
        `> ${UX.dot2} Bot kapansa bile **Reboot Recovery** kaydı geri başlatır`,
        '',
        section('Aktif Kayıtlar'),
        stats.length ? stats.join('\n') : '> ⚫ *Şu anda aktif kayıt yok*',
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('kayit:baslat').setLabel('Kayıt Başlat').setEmoji('🎙️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('kayit:durdur').setLabel('Durdur').setEmoji('🛑').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('kayit:durum').setLabel('Durum').setEmoji('📊').setStyle(ButtonStyle.Secondary),
      ),
    ];

    await message.reply({ embeds: [embed], components: rows });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'baslat') {
      if (!isFfmpegAvailable()) {
        return interaction.reply({ content: '❌ FFmpeg sistemde bulunamadı! Önce FFmpeg kurup PATH\'e ekleyin.', ephemeral: true });
      }
      const tokens = getTokens(userId);
      if (tokens.length === 0) {
        return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
      }
      return interaction.reply({
        content: '🎙️ Hangi hesap kayıt alsın?',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('kayit:hesapsec')
            .addOptions(tokens.slice(0, MAX_SELECT_OPTIONS).map((t, i) => ({
              label: `${i + 1}. ${t.username || t.label || `Hesap ${i + 1}`}`.slice(0, 100),
              value: String(i),
              emoji: '🎙️',
            })))
            .setPlaceholder('🔍 Hesap seç...'),
        )], ephemeral: true,
      });
    }

    if (action === 'durdur') {
      const running = listVoiceRecordings(userId);
      if (running.length === 0) {
        return interaction.reply({ content: '⚫ Aktif kayıt yok.', ephemeral: true });
      }
      return interaction.reply({
        content: '🛑 Hangi kaydı durdurayım?',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('kayit:durdursec')
            .addOptions(running.map((r) => ({
              label: `Hesap #${r.tokenIndex + 1} — kanal ${r.channelId}`.slice(0, 100),
              value: String(r.tokenIndex), emoji: '🛑',
            })))
            .setPlaceholder('🔍 Kayıt seç...'),
        )], ephemeral: true,
      });
    }

    if (action === 'durum') {
      const running = listVoiceRecordings(userId);
      if (running.length === 0) return interaction.reply({ content: '⚫ Aktif kayıt yok.', ephemeral: true });
      const lines = running.map((r) => {
        const s = getVoiceRecStats(userId, r.tokenIndex);
        return `> 🎙️ **Hesap #${r.tokenIndex + 1}**\n> 📡 Kanal: \`${s.channelId}\` • Süre: \`${s.durationMin} dk\`\n> 📦 Bölüm: \`${s.partNumber}\` • Gönderilen: \`${s.partsSent}\` • Toplam: \`${s.totalMB} MB\`\n> 👂 Dinleyici: \`${s.listeners}\` • Yeniden bağlanma: \`${s.reconnections}\``;
      });
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('📊 Kayıt Durumu')
          .setColor(COLORS.gold)
          .setDescription([`\`${THIN_DIVIDER}\``, ...lines, `\`${THIN_DIVIDER}\``].join('\n'))
          .setFooter(FOOTER()).setTimestamp()],
        ephemeral: true,
      });
    }
  },

  async onSelect(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'hesapsec') {
      const idx = Number(interaction.values[0]);
      const modal = new ModalBuilder().setCustomId(`kayit:ayar:${idx}`).setTitle('🎙️ Kayıt Ayarları');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('guild_id').setLabel('Sunucu ID')
            .setPlaceholder('123456789012345678').setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('channel_id').setLabel('Ses Kanalı ID')
            .setPlaceholder('123456789012345678').setStyle(TextInputStyle.Short).setRequired(true),
        ),
      );
      return interaction.showModal(modal);
    }

    if (action === 'durdursec') {
      const idx = Number(interaction.values[0]);
      const ok = stopVoiceRecording(userId, idx);
      return interaction.update({
        content: ok ? `🛑 Hesap #${idx + 1} kaydı durduruldu. Son bölüm DM olarak yollandı.` : '❌ Kayıt bulunamadı.',
        components: [],
      });
    }
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'ayar') return;
    const idx = Number(parts[1]);
    const guildId = interaction.fields.getTextInputValue('guild_id').trim();
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();

    await interaction.deferReply({ ephemeral: true });

    const res = await startVoiceRecording(
      interaction.user.id, idx, guildId, channelId, interaction.user.id,
    );

    const embed = new EmbedBuilder()
      .setTitle(res.success ? '🎙️ Kayıt Başladı!' : '❌ Başlatılamadı')
      .setColor(res.success ? COLORS.success : COLORS.danger)
      .setDescription(res.success
        ? [
          `> 🎙️ **Hesap #${idx + 1}** kanala girdi ve kayda başladı.`,
          `> 📡 Sunucu: \`${guildId}\` • Kanal: \`${channelId}\``,
          '',
          `> 📦 Bölümler **19 MB**'a ulaşınca DM'ine \`kayit_bolum_N.mp3\` olarak gönderilir.`,
          `> 🔇 Kimse konuşmuyorken sessizlik kaydedilmez (VAD).`,
          `> ♻️ Bot kapansa bile otomatik devam eder.`,
        ].join('\n')
        : `> ⚠️ Hata: \`${res.error}\``)
      .setFooter(FOOTER()).setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
