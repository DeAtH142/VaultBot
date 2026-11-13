// src/commands/spotify.js — 🎧 Spotify Fake Presence Kontrol Paneli
// Akış: Başlat → Hesap seç → Şarkı ara (iTunes API) → Sonuçlardan seç → Presence aktif.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  isSpotifyRunning, getSpotifyStats, listRunningSpotify,
  startSpotifyPresence, stopSpotifyPresence, stopAllSpotify, searchTrack,
} from '../utils/spotifyPresenceRunner.js';
import { COLORS, THIN_DIVIDER, BRAND, UX, section, statusLine } from '../utils/embeds.js';
import { markStart, markStop } from '../utils/playtimeHooks.js';

const FOOTER = () => BRAND.footer('Spotify Fake Presence Engine');
// Kullanıcı başına arama sonuçlarının geçici saklandığı yer
const pendingSearch = new Map(); // userId -> { tracks: [], at: number }
const PENDING_TTL_MS = 5 * 60 * 1000; // 5 dk sonra arama sonucu geçersiz sayılır

// Eski arama sonuçlarını temizleyen periyodik görev (bellek sızıntısı önlemi)
setInterval(() => {
  const now = Date.now();
  for (const [uid, p] of pendingSearch) {
    if (now - p.at > PENDING_TTL_MS) pendingSearch.delete(uid);
  }
}, 60 * 1000).unref();

// Discord select menü maksimum 25 option kabul eder
const MAX_SELECT_OPTIONS = 25;

export default {
  name: 'spotify',
  aliases: ['spo', 'spoti', 'presence'],
  description: 'REXAL — Spotify Fake Presence Kontrol Paneli',

  async execute(message) {
    const running = listRunningSpotify(message.author.id);
    const stats = running.map((s) => {
      const st = getSpotifyStats(message.author.id, s.tokenIndex);
      return `> 🎧 **${st.username || `Hesap #${s.tokenIndex + 1}`}** — **${st.trackTitle}** — *${st.artist}*, süren: \`${st.durationMin} dk\``;
    });

    const embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setAuthor({ name: `${BRAND.name} • Spotify Fake Presence ${BRAND.version}` })
      .setTitle('🎧 REXAL — Spotify Fake Presence')
      .setThumbnail(message.client.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription([
        UX.header,
        `*${UX.arrow} Vault hesabının profilinde istediğin şarkı 7/24 "dinleniyor" görünür*`,
        UX.footerLine,
        '',
        statusLine([['🎵', 'Kaynak', 'iTunes API'], ['🖼️', 'Kapak', 'Gerçek Albüm Resmi'], ['♻️', 'Recovery', '7/24 Aktif']]),
        '',
        section('Nasıl Çalışır?'),
        `> ${UX.dot2} **Başlat** → Vault'tan hesap seç`,
        `> ${UX.dot2} Şarkı adı yaz (örn: \`crush benim olsana\`) — sistem arar`,
        `> ${UX.dot2} Sonuçlardan doğru olanı seç (şarkı + sanatçı + kapak gösterilir)`,
        `> ${UX.dot2} Onaylarsan profilinde o şarkı **7/24 dinleniyor** görünür`,
        `> ${UX.dot2} Bot kapansa bile **Reboot Recovery** otomatik geri başlatır`,
        '',
        section('Aktif Oturumlar'),
        stats.length ? stats.join('\n') : '> ⚫ *Şu anda aktif presence yok*',
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('spotify:baslat').setLabel('Başlat').setEmoji('🎧').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('spotify:durdur').setLabel('Durdur').setEmoji('🛑').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('spotify:durum').setLabel('Durum').setEmoji('📊').setStyle(ButtonStyle.Secondary),
      ),
    ];

    await message.reply({ embeds: [embed], components: rows });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'baslat') {
      const tokens = getTokens(userId);
      if (tokens.length === 0) {
        return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
      }
      // Discord select menü limiti: 25 option. Fazlaysa ilk 25 gösterilir.
      return interaction.reply({
        content: '🎧 Hangi hesapta Spotify presence aktif olsun?'
          + (tokens.length > MAX_SELECT_OPTIONS ? `\n> ⚠️ *${tokens.length} hesap var — ilk ${MAX_SELECT_OPTIONS} tanesi listelendi.*` : ''),
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('spotify:hesapsec')
            .addOptions(tokens.slice(0, MAX_SELECT_OPTIONS).map((t, i) => ({
              label: `${i + 1}. ${t.username || t.label || `Hesap ${i + 1}`}`.slice(0, 100),
              value: String(i),
              emoji: isSpotifyRunning(userId, i) ? '🎧' : (t.status === 'gecersiz' ? '💔' : '⚪'),
            })))
            .setPlaceholder('🔍 Hesap seç...'),
        )], ephemeral: true,
      });
    }

    if (action === 'durdur') {
      const running = listRunningSpotify(userId);
      if (running.length === 0) {
        return interaction.reply({ content: '⚫ Aktif Spotify presence yok.', ephemeral: true });
      }
      return interaction.reply({
        content: '🛑 Hangi oturumu kapatayım?',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('spotify:durdursec')
            .addOptions(running.map(s => ({
              label: `Hesap #${s.tokenIndex + 1} — ${s.track.title}`,
              value: String(s.tokenIndex), emoji: '🛑',
            })))
            .setPlaceholder('🔍 Oturum seç...'),
        )], ephemeral: true,
      });
    }

    if (action === 'onayla') {
      const idx = Number(parts[1]);
      const pending = pendingSearch.get(userId);
      if (pending && Date.now() - pending.at > PENDING_TTL_MS) pendingSearch.delete(userId);
      const track = pending?.tracks[Number(parts[2])];
      if (!track) return interaction.update({ content: '❌ Arama sonucu bulunamadı, yeniden aramayı dene.', components: [], embeds: [] });

      await interaction.deferUpdate();
      const res = await startSpotifyPresence(userId, idx, track, { statusChoice: pending?.statusChoice || 'online' });
      if (res.success) markStart(userId, 'spotify', idx); // ⏱️
      const embed = new EmbedBuilder()
        .setTitle(res.success ? '🎧 Presence Aktif!' : '❌ Başlatılamadı')
        .setColor(res.success ? 0x1db954 : COLORS.danger)
        .setThumbnail(track.coverUrl)
        .setDescription(res.success
          ? [
            `> 🎵 **${track.title}** — 🎤 ${track.artist}`,
            `> 💿 *${track.album}*`,
            '',
            `> ✅ **${res.username ?? 'Hesap'}** profilinde artık bu şarkı dinleniyor görünüyor.`,
            '> ♻️ Bot yeniden başlasa bile otomatik devam eder.',
          ].join('\n')
          : `> ⚠️ Hata: \`${res.error}\``)
        .setFooter(FOOTER()).setTimestamp();
      return interaction.editReply({ embeds: [embed], components: [] });
    }

    if (action === 'vazgec') {
      return interaction.update({ content: '❌ Vazgeçildi.', embeds: [], components: [] });
    }

    if (action === 'hepsini-kapat' || action === 'hepsini_kapat') {
      const running = listRunningSpotify(userId);
      const n = stopAllSpotify(userId);
      for (const s of running) markStop(userId, 'spotify', s.tokenIndex); // ⏱️
      return interaction.reply({ content: `💀 Tüm Spotify presence'ları kapatıldı (**${n}** adet).`, ephemeral: true });
    }

    if (action === 'durum') {
      const running = listRunningSpotify(userId);
      if (running.length === 0) return interaction.reply({ content: '⚫ Aktif oturum yok.', ephemeral: true });
      const lines = running.map((s) => {
        const st = getSpotifyStats(userId, s.tokenIndex);
        return `> 🎧 **Hesap #${s.tokenIndex + 1}** — **${st.trackTitle}**\n> 🎤 *${st.artist}* — 💿 ${st.album}\n> ⏱️ ${st.durationMin} dakikadır çalıyor`;
      });
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('📊 Spotify Presence Durum')
          .setColor(COLORS.vault)
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
      const modal = new ModalBuilder().setCustomId(`spotify:arama:${idx}`).setTitle('🎧 Şarkı Ara');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('sorgu').setLabel('Şarkı adı / sanatçı')
            .setPlaceholder('örn: crush benim olsana').setStyle(TextInputStyle.Short).setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('durum').setLabel('Profil durumu (online/idle/dnd boşsa online)')
            .setPlaceholder('online').setStyle(TextInputStyle.Short).setRequired(false),
        ),
      );
      return interaction.showModal(modal);
    }

    if (action === 'durdursec') {
      const idx = Number(interaction.values[0]);
      const ok = stopSpotifyPresence(userId, idx);
      if (ok) markStop(userId, 'spotify', idx); // ⏱️
      return interaction.update({
        content: ok ? `🛑 Hesap #${idx + 1} Spotify presence kapatıldı.` : '❌ Oturum bulunamadı.',
        components: [],
      });
    }

    if (action === 'parcasec') {
      const idx = Number(parts[1]);
      const pending = pendingSearch.get(userId);
      if (pending && Date.now() - pending.at > PENDING_TTL_MS) {
        pendingSearch.delete(userId);
        return interaction.update({ content: '⌛ Arama süresi doldu (5 dk). Yeniden aramayı dene.', embeds: [], components: [] });
      }
      const tracks = pending?.tracks ?? [];
      const track = tracks[Number(interaction.values[0])];
      if (!track) return interaction.update({ content: '❌ Şarkı bulunamadı (arama süresi doldu).', components: [] });

      // Onay embed'i: Şarkı + sanatçı + kapak gösterilir
      const embed = new EmbedBuilder()
        .setTitle('🎵 Bu şarkı mı?')
        .setColor(0x1db954)
        .setThumbnail(track.coverUrl)
        .setDescription([
          `> 🎵 **${track.title}**`,
          `> 🎤 **${track.artist}**`,
          `> 💿 *${track.album}*`,
          `> ⏱️ ${Math.floor(track.durationMs / 60000)}:${String(Math.floor((track.durationMs % 60000) / 1000)).padStart(2, '0')}`,
          '',
          '*Onaylırsan profilinde 7/24 bu şarkı dinleniyor görünür.*',
        ].join('\n'))
        .setFooter(FOOTER());

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`spotify:onayla:${idx}:${interaction.values[0]}`).setLabel('Evet, Bunu!').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('spotify:vazgec').setLabel('Vazgeç').setEmoji('❌').setStyle(ButtonStyle.Danger),
        );
      return interaction.update({ content: '', embeds: [embed], components: [row] });
    }
  },

  async onModalSubmit(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action !== 'arama') return;
    const idx = Number(parts[1]);
    const sorgu = interaction.fields.getTextInputValue('sorgu').trim();
    const rawDurum = (interaction.fields.getTextInputValue('durum').trim() || 'online').toLowerCase();
    // Geçersiz değer girilirse sessizce 'online'a düş
    const durumSec = ['online', 'idle', 'dnd'].includes(rawDurum) ? rawDurum : 'online';

    await interaction.deferReply({ ephemeral: true });
    const tracks = await searchTrack(sorgu, 8);

    if (tracks.length === 0) {
      return interaction.editReply({ content: `❌ \`${sorgu}\` için sonuç bulunamadı. Farklı bir ifade dene.` });
    }

    pendingSearch.set(userId, { tracks, at: Date.now(), statusChoice: durumSec });

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Arama Sonuçları: "${sorgu}"`)
      .setColor(0x1db954)
      .setDescription(tracks.map((t, i) =>
        `> **${i + 1}.** 🎵 **${t.title}** — 🎤 ${t.artist}\n>    💿 *${t.album}*`,
      ).join('\n'))
      .setFooter(FOOTER());

    return interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`spotify:parcasec:${idx}`)
          .addOptions(tracks.map((t, i) => ({
            label: `${i + 1}. ${t.title}`.slice(0, 100),
            description: `${t.artist} — ${t.album}`.slice(0, 100),
            value: String(i),
            emoji: '🎵',
          })))
          .setPlaceholder('🔍 Şarkı seç...'),
      )],
    });
  },
};
