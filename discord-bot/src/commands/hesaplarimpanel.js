// src/commands/hesaplarimpanel.js — 🎛️ ?hesaplarim — Hesap Kontrol Paneli
//
// Ses AFK motorunu yönetir: hesap seç, sese sok, mikrofon/kulaklık kapat.
// ⚠️ `!hesaplarim` (vault) komutundan TAMAMEN AYRI bir komuttur.

import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits,
} from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { getTokens } from '../utils/tokenStore.js';
import {
  startVoiceAfk, stopVoiceAfk, getVoiceAfkStats, isVoiceAfkRunning,
  getAccountVoiceSessions, getUserVoiceAfkSessions,
} from '../utils/voiceAfkRunner.js';
import { voiceAfkStore } from '../utils/voiceAfkStore.js';
import { markStart, markStop } from '../utils/playtimeHooks.js';
import { BRAND } from '../utils/embeds.js';
import {
  checkStatusGate, gateComponents, buildStatusGateEmbed, verifyUserStatus,
  isExempt, getSystemStats, rememberGateMessage,
} from '../utils/statusGate.js';

// ── Sabitler ─────────────────────────────────────────────────────────────
const DM_GUILD = '@me';
const PAGE_SIZE = 25; // select menüsü başına hesap
const EMOJI_GUILD_NAME = 'rexal-panel-icons';

// Özel emoji adı → lokal PNG (scripts/make-hesap-icons.mjs üretir)
const ICON_FILES = {
  bolt: 'bolt.png', mic: 'mic.png', micoff: 'micoff.png',
  headset: 'headset.png', deafoff: 'deafoff.png', cam: 'cam.png',
  live: 'live.png', pad: 'pad.png', spotify: 'spotify.png',
  check: 'check.png', cross: 'cross.png', circle: 'circle.png',
};

// Emoji yüklenemezse kullanılacak unicode yedek
const FALLBACK = {
  bolt: '⚡', mic: '🎤', micoff: '🔇', headset: '🎧', deafoff: '🔕',
  cam: '📹', live: '🔴', pad: '🎮', spotify: '🎵', check: '✅',
  cross: '❌', circle: '⭕',
};

// ── Kullanıcı bazlı panel durumu ─────────────────────────────────────────
const panelState = new Map(); // userId -> { index, page }

function st(userId) {
  if (!panelState.has(userId)) panelState.set(userId, { index: -1, page: 0 });
  return panelState.get(userId);
}

function setIndex(userId, index) {
  const s = st(userId);
  s.index = Number.isInteger(index) ? index : -1;
  if (s.index >= 0) s.page = Math.floor(s.index / PAGE_SIZE);
  return s;
}

// ── İkon yükleyici (ilk kullanımda yükler, sonra önbellekten döner) ──────
const emojiCache = { at: 0, map: { ...FALLBACK } };
const EMOJI_CACHE_MS = 6 * 60 * 60 * 1000;

/**
 * Bot'un kendi "ikon sunucusuna" PNG'leri yükler ve emoji string'lerini döner.
 * Sunucu/yetki yoksa veya emoji doluysa unicode yedeklere düşer.
 * @param {import('discord.js').Client} client
 * @returns {Promise<Record<string,string>>}
 */
export async function resolveIcons(client) {
  if (Date.now() - emojiCache.at < EMOJI_CACHE_MS) return emojiCache.map;

  const map = { ...FALLBACK };

  try {
    const guild = client.guilds.cache.find(
      g => g.name === EMOJI_GUILD_NAME
        && g.members?.me?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions),
    );
    if (!guild) return map;

    const existing = await guild.emojis.fetch();
    for (const [key, file] of Object.entries(ICON_FILES)) {
      const emojiName = `r_${key}`;
      const hit = existing.find(e => e.name === emojiName);
      if (hit) { map[key] = `<:${hit.name}:${hit.id}>`; continue; }

      const full = path.resolve('data', 'icons', file);
      if (!fs.existsSync(full)) continue;
      const created = await guild.emojis.create({ attachment: full, name: emojiName });
      map[key] = `<:${created.name}:${created.id}>`;
    }

    emojiCache.at = Date.now();
    emojiCache.map = map;
  } catch (err) {
    console.warn('[hesaplarim] ikon yüklenemedi, unicode yedek kullanılıyor:', err.message);
  }

  return map;
}

// ── Yardımcılar ─────────────────────────────────────────────────────────
const accountName = (tokens, idx) =>
  tokens[idx]?.username || tokens[idx]?.label || `Hesap #${idx + 1}`;

const statsOf = (userId, idx) => {
  try { return getVoiceAfkStats(userId, idx); } catch { return null; }
};

const isRunning = (userId, idx) => {
  try { return isVoiceAfkRunning(userId, idx); } catch { return false; }
};

const avatarOf = (tokens, idx) => {
  const url = tokens[idx]?.avatarUrl || tokens[idx]?.avatar;
  return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
};

const truncate = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

// ── Embed + Bileşen üretimi ─────────────────────────────────────────────
export function buildPanel({ icons: I, tokens, index, page, ownerId, client }) {
  const total = tokens.length;
  const has = total > 0 && index >= 0 && index < total;
  const idx = has ? index : -1;
  const running = has ? isRunning(ownerId, idx) : false;
  const s = has ? statsOf(ownerId, idx) : null;

  const name = has ? accountName(tokens, idx) : '—';
  const micOpen = s ? s.selfMute === false : false;
  const deafOpen = s ? s.selfDeaf === false : false;

  // Aynı hesap birden fazla sunucuda AFK olabilir — hepsi listelenir
  const sessions = has ? (() => { try { return getAccountVoiceSessions(ownerId, idx); } catch { return []; } })() : [];

  const lines = [
    `> ${I.circle} **${truncate(name, 40)}**`,
    `> 🗂️ **Durum:** ${running ? `${I.check} \`🟢 Çalışıyor\`${sessions.length > 1 ? ` \`×${sessions.length} sunucu\`` : ''}` : `${I.cross} \`🔴 Durduruldu\``}`,
    ...(sessions.length
      ? sessions.map(x => `> ⚡ **Ses Kanalı:** \`${x.guildId}\` / \`${x.channelId}\``)
      : [`> ⚡ **Ses Kanalı:** ${s?.channelId ? `\`${s.channelId}\`` : '`—`'}`]),
    `> ${running && micOpen ? I.mic : I.micoff} **Mikrofon:** ${running ? (micOpen ? '`✅ Açık`' : '`🔇 Kapalı`') : '`—`'}`,
    `> ${running && deafOpen ? I.headset : I.deafoff} **Kulaklık:** ${running ? (deafOpen ? '`✅ Açık`' : '`🔕 Kapalı`') : '`—`'}`,
    `> ${I.cam} **Kamera:** \`—\``,
    `> ${I.live} **Yayın:** \`—\``,
    `> ${I.pad} **Controller:** \`—\``,
    `> ${I.spotify} **Spotify:** \`—\``,
  ];

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Hesap Kontrol Paneli' })
    .setDescription(lines.join('\n'))
    .setColor(running ? 0x2ecc71 : 0xed4245)
    .setFooter(BRAND.footer('Hesap Kontrol Paneli'))
    .setTimestamp();

  const avatar = has ? avatarOf(tokens, idx) : null;
  if (avatar) embed.setThumbnail(avatar);
  else if (client?.user?.displayAvatarURL) embed.setThumbnail(client.user.displayAvatarURL({ size: 128 }));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const options = total === 0
    ? [{ label: 'Kasa boş', description: 'Önce !hesaplarim ile hesap ekleyin', value: 'none' }]
    : tokens.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE).map((t, i) => {
      const real = page * PAGE_SIZE + i;
      const live = isRunning(ownerId, real);
      return {
        label: truncate(t.username || t.label || `Hesap #${real + 1}`, 100),
        description: live ? '✅ Seste çalışıyor' : '⭕ Hazır',
        value: String(real),
        emoji: live ? '📞' : '💤',
      };
    });

  const rows = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('hesap:select')
        .setPlaceholder(has ? truncate(name, 80) : 'Hesap seç…')
        .setDisabled(total === 0)
        .addOptions(options),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hesap:menu')
        .setLabel('Sunucu & Profil İşlemleri...')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!has),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hesap:prev')
        .setEmoji('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId('hesap:next')
        .setEmoji('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId('hesap:pagelist')
        .setLabel('Sayfayı Seç')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(totalPages <= 1),
      new ButtonBuilder()
        .setCustomId('hesap:pageinfo')
        .setEmoji('🔴')
        .setLabel(`Sayfa ${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hesap:mic')
        .setLabel(micOpen ? 'Mikrofon Aç' : 'Mikrofon Kapat')
        .setEmoji(micOpen ? '🎤' : '🔇')
        .setStyle(micOpen ? ButtonStyle.Success : ButtonStyle.Danger)
        .setDisabled(!running),
      new ButtonBuilder()
        .setCustomId('hesap:deaf')
        .setLabel(deafOpen ? 'Kulaklık Aç' : 'Kulaklık Kapat')
        .setEmoji(deafOpen ? '🎧' : '🔕')
        .setStyle(deafOpen ? ButtonStyle.Success : ButtonStyle.Danger)
        .setDisabled(!running),
      new ButtonBuilder()
        .setCustomId('hesap:cam')
        .setLabel('Kamera Aç')
        .setEmoji('📹')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!running),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hesap:close')
        .setLabel('Paneli Kapat')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('hesap:restart')
        .setLabel('⚡ Yeniden Başlat')
        .setStyle(ButtonStyle.Danger),
    ),
  ];

  return { embed, rows };
}

// ── Kullanıcının çalışan TÜM sistemlerini durdur (şart kalkınca) ───────
// Her modül: (userId) → çalışan token index'lerini listeler, tek tek durdurur.
const SYSTEM_STOPPERS = [
  ['sesafk', async (userId) => {
    const { getUserVoiceAfkSessions, stopVoiceAfk } = await import('../utils/voiceAfkRunner.js');
    let n = 0;
    for (const s of getUserVoiceAfkSessions(userId)) {
      if (stopVoiceAfk(userId, s.tokenIndex, { all: true }).success) { n++; markStop(userId, 'voiceafk', s.tokenIndex); }
    }
    return n;
  }],
  ['owo', async (userId) => {
    const m = await import('../utils/owoRunner.js');
    let n = 0;
    for (let i = 0; i < 100; i++) {
      if (!m.isOwoRunning?.(userId, i)) continue;
      m.stopOwoAutomation(userId, i); n++;
    }
    return n;
  }],
  ['autotyper', async (userId) => {
    const m = await import('../utils/autoTyperRunner.js');
    let n = 0;
    for (const s of (m.getAllAutoTyperSessions() || [])) {
      if (String(s.userId) !== String(userId)) continue;
      if (m.stopAutoTyper(userId, s.tokenIndex)?.success !== false) { markStop(userId, 'autotyper', s.tokenIndex); n++; }
    }
    return n;
  }],
  ['otomesaj', async (userId) => {
    const m = await import('../utils/scheduledMessenger.js');
    let n = 0;
    for (const j of (m.getScheduledJobs(userId) || [])) {
      if (m.stopScheduledJob(userId, j.tokenIndex)?.success !== false) n++;
    }
    return n;
  }],
  ['aichat', async (userId) => {
    const m = await import('../utils/aiChatRunner.js');
    let n = 0;
    for (let i = 0; i < 100; i++) {
      if (!m.isAiRunning?.(userId, i)) continue;
      m.stopAiChat(userId, i); n++;
    }
    return n;
  }],
  ['mcafk', async (userId) => {
    const m = await import('../utils/mcAfkRunner.js');
    return m.stopAllMcAfk?.(userId) || 0;
  }],
  ['spotify', async (userId) => {
    const m = await import('../utils/spotifyPresenceRunner.js');
    return m.stopAllSpotify?.(userId) || 0;
  }],
  ['oyun', async (userId) => {
    const m = await import('../utils/oyunPresenceRunner.js');
    return m.stopAllOyun?.(userId) || 0;
  }],
  ['seskayit', async (userId) => {
    const m = await import('../utils/voiceRecRunner.js');
    return m.stopAllVoiceRecordings?.(userId) || 0;
  }],
  ['streamer', async (userId) => {
    const m = await import('../utils/streamerPresenceRunner.js');
    return m.stopAllStreams?.(userId) || 0;
  }],
  ['senaryo', async (userId) => {
    const m = await import('../utils/scenarioRunner.js');
    return m.isScenarioRunning?.(userId) ? (m.stopScenario(userId), 1) : 0;
  }],
  ['otobump', async (userId) => {
    const m = await import('../utils/bumpRunner.js');
    let n = 0;
    for (const j of (m.getJobsByUser(userId) || [])) {
      if (m.stopBumpJob(userId, j.tokenIndex)?.success !== false) n++;
    }
    return n;
  }],
];

export async function stopUserSystems(userId) {
  let stopped = 0;
  for (const [name, fn] of SYSTEM_STOPPERS) {
    try {
      const n = await fn(userId);
      if (typeof n === 'number') stopped += n;
    } catch { /* modül yok / henüz çalışmıyor → atla */ }
  }
  return stopped;
}

// ── Panel mesajını yenile (embed + butonlar) ────────────────────────────
async function refresh(interaction, icons, note = null) {
  const userId = interaction.user.id;
  const tokens = getTokens(userId);
  const s = st(userId);
  const { embed, rows } = buildPanel({
    icons, tokens, index: s.index, page: s.page, ownerId: userId, client: interaction.client,
  });
  if (note) embed.setDescription(`${note}\n\n${embed.data.description}`);
  await interaction.update({ embeds: [embed], components: rows }).catch(() => { });
}

// ── Mikrofon / kulaklık değiştir ────────────────────────────────────────
/**
 * Sesteki hesabın selfMute / selfDeaf değerini değiştirir (kanal aynı kalır).
 * @returns {Promise<{ok:boolean, value?:boolean, error?:string}>}
 */
async function setVoiceFlag(userId, idx, flag) {
  const info = statsOf(userId, idx);
  if (!info) return { ok: false, error: 'Hesap seste değil' };

  const next = flag === 'selfMute' ? info.selfMute === false : info.selfDeaf === false;
  const opts = {
    selfMute: flag === 'selfMute' ? next : info.selfMute !== false,
    selfDeaf: flag === 'selfDeaf' ? next : info.selfDeaf !== false,
  };

  try {
    const res = await startVoiceAfk(userId, idx, info.guildId, info.channelId, opts);
    return res.success ? { ok: true, value: next } : { ok: false, error: res.error };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Komut ───────────────────────────────────────────────────────────────
export default {
  name: 'hesaplarim',
  aliases: ['hesapkontrol', 'hesappanel'],
  description: 'REXAL — Hesap Kontrol Paneli (Ses AFK yönetimi)',
  prefix: '?', // Sadece "?" ile tetiklenir; "!hesaplarim" (vault) ayrı komut

  async execute(message) {
    const userId = message.author.id;

    // 🚩 Durum şartı — özel durumunda şart metni yoksa panel açılmaz
    const denied = await checkStatusGate(message.client, userId, `?${this.name}`, { member: message.member });
    if (denied) {
      const sent = await message.reply(denied);
      try {
        const mod = await import('../utils/statusGate.js');
        mod.rememberGateMessage(userId, message.channel.id, sent.id);
      } catch { }
      return sent;
    }

    const tokens = getTokens(userId);
    const s = st(userId);
    if (s.index < 0 && tokens.length > 0) s.index = 0;
    const icons = await resolveIcons(message.client);
    const { embed, rows } = buildPanel({
      icons, tokens, index: s.index, page: s.page, ownerId: userId, client: message.client,
    });

    return message.reply({ embeds: [embed], components: rows });
  },

  // ══════════════════════════════════════════════════════════════
  // 🚩 DURUM ŞARTI BUTONLARI
  // ══════════════════════════════════════════════════════════════
  async onStatusGateButton(interaction, actionParts) {
    const action = actionParts[0];
    const userId = interaction.user.id;
    const command = `?${this.name}`;

    // 🔄 Doğrula — Discord'dan yeniden çek
    if (action === 'verify') {
      await interaction.deferReply({ ephemeral: true });
      const result = await verifyUserStatus(interaction.client, userId, {
        force: true,
        member: interaction.guild?.members.cache.get(userId),
      });
      const exempt = isExempt(userId);
      const ok = result.ok || exempt;

      if (!ok) {
        return interaction.editReply({
          embeds: [buildStatusGateEmbed({ userId, command, result, exempt, stats: getSystemStats(userId) })],
          components: gateComponents(),
        });
      }

      // ✅ Şart tamam → paneli göster
      const tokens = getTokens(userId);
      const s = st(userId);
      if (s.index < 0 && tokens.length > 0) s.index = 0;
      const icons = await resolveIcons(interaction.client);
      const { embed, rows } = buildPanel({
        icons, tokens, index: s.index, page: s.page, ownerId: userId, client: interaction.client,
      });

      await interaction.editReply({
        embeds: [buildStatusGateEmbed({ userId, command, result, exempt: true, stats: getSystemStats(userId) })],
        components: [],
      });
      return interaction.followUp({ embeds: [embed], components: rows, ephemeral: true }).catch(() => { });
    }

    // 🛠️ Nasıl aktif edilir?
    if (action === 'howto') {
      return interaction.reply({
        ephemeral: true,
        content: [
          '**🛠️ Durum Şartını Aktif Etme**',
          '**1.** Discord > Profil > **Özel Durumumu Düzenle**',
          '**2.** Durum metnine şunlardan birini yaz:',
          '```\ndiscord.gg/rexal\n.gg/rexal\n/rexal\n```',
          '**3.** Kaydet ve **Çevrimiçi** ol (Görünmez/Çevrimdışı ise doğrulanamaz)',
          '**4.** **Doğrula** butonuna bas',
        ].join('\n'),
      });
    }

    // ⛔ Sistemleri durdur
    if (action === 'stopall') {
      const stopped = await stopUserSystems(userId);
      return interaction.reply({
        ephemeral: true,
        content: stopped > 0
          ? `⛔ **${stopped}** sistem durduruldu.`
          : '📭 Durdurulacak çalışan sistem yok.',
      });
    }
  },

  // ── Butonlar (normal) ───────────────────────────────────────────

  // ══════════════════════════════════════════════════════════════════
  // BUTONLAR
  // ══════════════════════════════════════════════════════════════════
  async onButton(interaction, actionParts) {
    const action = actionParts[0];
    const userId = interaction.user.id;
    const icons = await resolveIcons(interaction.client);

    // 🚩 Durum şartı butonları
    if (['verify', 'howto', 'stopall'].includes(action)) {
      return this.onStatusGateButton(interaction, actionParts);
    }

    // 🚩 Her panel aksiyonundan önce şart yeniden kontrol edilir
    const denied = await checkStatusGate(interaction.client, userId, '?hesaplarim', {
      member: interaction.guild?.members.cache.get(userId),
    });
    if (denied) {
      const stopped = await stopUserSystems(userId);
      return interaction.reply({
        ...denied,
        ephemeral: true,
        content: stopped > 0 ? `⛔ Durum şartı kalktı — **${stopped}** sistem durduruldu.` : undefined,
      });
    }
    const tokens = getTokens(userId);
    const s = st(userId);

    // ❌ Paneli kapat
    if (action === 'close') {
      panelState.delete(userId);
      return interaction.update({ content: '❌ Panel kapatıldı.', embeds: [], components: [] }).catch(() => { });
    }

    // ⚡ Yeniden başlat (kayıtlı tüm ses ayarları)
    if (action === 'restart') {
      await interaction.deferUpdate();
      const configs = voiceAfkStore.list(userId);
      let ok = 0;
      for (const cfg of configs) {
        try {
          const gid = cfg.type === 'dm' ? DM_GUILD : cfg.guildId;
          const res = await startVoiceAfk(userId, cfg.tokenIndex, gid, cfg.channelId, {
            fallbackChannelId: cfg.fallbackChannelId || null,
            selfMute: cfg.selfMute !== false,
            selfDeaf: cfg.selfDeaf !== false,
          });
          if (res.success) { ok++; markStart(userId, 'voiceafk', cfg.tokenIndex); }
        } catch { }
        await new Promise(r => setTimeout(r, 1200));
      }
      return refresh(interaction, icons, ok > 0
        ? `> ✅ **${ok}/${configs.length}** hesap yeniden başlatıldı.`
        : (configs.length ? '> ❌ Hiçbir hesap yeniden başlatılamadı.' : '> 📭 Kayıtlı ses ayarı yok.'));
    }

    // ◀ ▶ sayfa
    if (action === 'prev' || action === 'next') {
      const totalPages = Math.max(1, Math.ceil(tokens.length / PAGE_SIZE));
      s.page = Math.min(Math.max(0, s.page + (action === 'next' ? 1 : -1)), totalPages - 1);
      return refresh(interaction, icons);
    }

    // 📄 Sayfayı seç (modal)
    if (action === 'pagelist') {
      const totalPages = Math.max(1, Math.ceil(tokens.length / PAGE_SIZE));
      const modal = new ModalBuilder()
        .setCustomId('hesap:modalpage')
        .setTitle(`Sayfa Seç (1-${totalPages})`);
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('page')
          .setLabel('Sayfa numarası')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('1')
          .setValue(String(s.page + 1))
          .setRequired(true),
      ));
      return interaction.showModal(modal);
    }

    if (action === 'pageinfo') {
      return interaction.reply({
        content: `📄 **Sayfa ${s.page + 1}** • Toplam \`${tokens.length}\` hesap (sayfa başına ${PAGE_SIZE}).`,
        ephemeral: true,
      });
    }

    // 🎛️ Sunucu & Profil menüsü
    if (action === 'menu') {
      if (s.index < 0) {
        return interaction.reply({ content: '⚠️ Önce listeden bir hesap seç.', ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('hesap:action')
          .setPlaceholder('Yapılacak işlemi seç…')
          .addOptions([
            { label: 'Sunucu Sesine Bağlan', description: 'Sese gir + mikrofon & kulaklık kapat', value: 'guild', emoji: '🎙️' },
            { label: 'DM Sesine Bağlan', description: 'Grup DM aramasına gir', value: 'dm', emoji: '💬' },
            { label: 'Hesabı Durdur', description: 'Sesten çıkar', value: 'stop', emoji: '🛑' },
          ]),
      );
      return interaction.reply({
        content: `🎛️ **${truncate(accountName(tokens, s.index), 80)}** — işlem seç:`,
        components: [row],
        ephemeral: true,
      });
    }

    // 🎤 Mikrofon
    if (action === 'mic') {
      if (s.index < 0) return interaction.reply({ content: '⚠️ Önce bir hesap seç.', ephemeral: true });
      const res = await setVoiceFlag(userId, s.index, 'selfMute');
      return refresh(interaction, icons, res.ok
        ? `> ${res.value ? '🔇 Mikrofon kapatıldı' : '🎤 Mikrofon açıldı'} — **${truncate(accountName(tokens, s.index), 40)}**`
        : `> ❌ Mikrofon değiştirilemedi: \`${res.error}\``);
    }

    // 🎧 Kulaklık
    if (action === 'deaf') {
      if (s.index < 0) return interaction.reply({ content: '⚠️ Önce bir hesap seç.', ephemeral: true });
      const res = await setVoiceFlag(userId, s.index, 'selfDeaf');
      return refresh(interaction, icons, res.ok
        ? `> ${res.value ? '🔕 Kulaklık kapatıldı' : '🎧 Kulaklık açıldı'} — **${truncate(accountName(tokens, s.index), 40)}**`
        : `> ❌ Kulaklık değiştirilemedi: \`${res.error}\``);
    }

    // 📹 Kamera — selfbot API'sinde destekli değil
    if (action === 'cam') {
      return interaction.reply({
        content: '📹 Kamera yayını selfbot API\'sinde desteklenmiyor — bu buton sadece bilgi verir.',
        ephemeral: true,
      });
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // MENÜ SEÇİMLERİ
  // ══════════════════════════════════════════════════════════════════
  async onSelect(interaction, actionParts) {
    const action = actionParts[0];
    const userId = interaction.user.id;
    const tokens = getTokens(userId);
    const icons = await resolveIcons(interaction.client);

    // Hesap seçimi
    if (action === 'select') {
      const idx = parseInt(interaction.values[0], 10);
      if (!Number.isInteger(idx)) return interaction.deferUpdate().catch(() => { });
      setIndex(userId, idx);
      return refresh(interaction, icons);
    }

    // Hangi sunucudan çıkarılsın? (çok sunucu varsa)
    if (action === 'stopwhich') {
      const s = st(userId);
      const value = interaction.values[0];
      const all = value === '__all__';

      let ok = false;
      try { ok = stopVoiceAfk(userId, s.index, all ? { all: true } : { guildId: value }).success; } catch { }
      if (ok) markStop(userId, 'voiceafk', s.index);

      const left = (() => { try { return getAccountVoiceSessions(userId, s.index).length; } catch { return 0; } })();
      return interaction.update({
        content: ok
          ? (all
            ? `🛑 Tüm sunuculardan çıkarıldı.`
            : `🛑 \`${value}\` sunucusundan çıkarıldı. ${left > 0 ? `Kalan: **${left} sunucu**.` : ''}`)
          : '⭕ Bu hesap seste değildi.',
        components: [],
      });
    }

    // İşlem menüsü
    if (action === 'action') {
      const value = interaction.values[0];
      const s = st(userId);
      if (s.index < 0) {
        return interaction.reply({ content: '⚠️ Önce bir hesap seç.', ephemeral: true });
      }
      const name = truncate(accountName(tokens, s.index), 45);

      if (value === 'stop') {
        const singles = (() => { try { return getAccountVoiceSessions(userId, s.index); } catch { return []; } })();

        // Birden fazla sunucuda → hangisini durduracağını sor
        if (singles.length > 1) {
          const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('hesap:stopwhich')
              .setPlaceholder('Hangi sunucudan çıkarılsın?')
              .addOptions([
                ...singles.map(x => ({
                  label: `${x.guildId} / ${x.channelId}`.slice(0, 100),
                  description: 'Bu sunucudan çıkar',
                  value: x.guildId,
                  emoji: '🛑',
                })),
                { label: 'Tüm sunuculardan çıkar', description: `Hepsini durdur (${singles.length} sunucu)`, value: '__all__', emoji: '⛔' },
              ]),
          );
          return interaction.update({
            content: `🛑 **${name}** şu an **${singles.length} sunucuda** — hangisi durdurulsun?`,
            components: [row],
          });
        }

        let ok = false;
        try { ok = stopVoiceAfk(userId, s.index, { all: true }).success; } catch { }
        if (ok) markStop(userId, 'voiceafk', s.index);
        return interaction.update({
          content: ok ? `🛑 **${name}** sesten çıkarıldı.` : `⭕ **${name}** zaten bağlı değildi.`,
          components: [],
        });
      }

      // Sunucu sesi modalı
      if (value === 'guild') {
        const modal = new ModalBuilder()
          .setCustomId(`hesap:modalguild:${s.index}`)
          .setTitle(`Sunucu Ses — ${name}`.slice(0, 45));
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('guild_id')
              .setLabel('Sunucu ID')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('123456789012345678')
              .setRequired(true),
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('channel_id')
              .setLabel('Ses Kanalı ID')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('123456789012345678')
              .setRequired(true),
          ),
        );
        return interaction.showModal(modal);
      }

      // DM sesi modalı
      if (value === 'dm') {
        const modal = new ModalBuilder()
          .setCustomId(`hesap:modaldm:${s.index}`)
          .setTitle(`DM Ses — ${name}`.slice(0, 45));
        modal.addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('dm_channel_id')
            .setLabel('DM Kanal ID (grup DM / arama ID)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('123456789012345678')
            .setRequired(true),
        ));
        return interaction.showModal(modal);
      }
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // MODAL YANITLARI
  // ══════════════════════════════════════════════════════════════════
  async onModalSubmit(interaction, actionParts) {
    const userId = interaction.user.id;
    const tokens = getTokens(userId);

    // Sayfa seç
    if (actionParts[0] === 'modalpage') {
      const raw = parseInt(interaction.fields.getTextInputValue('page'), 10);
      const totalPages = Math.max(1, Math.ceil(tokens.length / PAGE_SIZE));
      const page = Math.min(Math.max(0, (Number.isFinite(raw) ? raw : 1) - 1), totalPages - 1);
      st(userId).page = page;
      const icons = await resolveIcons(interaction.client);
      const s = st(userId);
      const { embed, rows } = buildPanel({
        icons, tokens, index: s.index, page: s.page, ownerId: userId, client: interaction.client,
      });
      return interaction.update({ embeds: [embed], components: rows }).catch(() => { });
    }

    // Sunucu sesi — SADECE sese gir, mikrofon + kulaklık kapalı
    if (actionParts[0] === 'modalguild') {
      const idx = parseInt(actionParts[1], 10);
      const guildId = interaction.fields.getTextInputValue('guild_id').trim();
      const channelId = interaction.fields.getTextInputValue('channel_id').trim();

      await interaction.deferReply({ ephemeral: true });
      const res = await startVoiceAfk(userId, idx, guildId, channelId, {
        selfMute: true,
        selfDeaf: true,
      });
      if (!res.success) {
        return interaction.editReply({
          content: res.conflict
            ? `🚫 **Bu hesap aynı sunucuda zaten başka bir ses kanalında** (${res.where}).\n> Aynı sunucuda tek kanal olur — farklı bir sunucu ID gir ya da önce \`Hesabı Durdur\` seç.`
            : `❌ Ses bağlantısı başlatılamadı: \`${res.error}\``,
        });
      }
      markStart(userId, 'voiceafk', idx);
      rememberGateMessage(userId, '?hesaplarim', interaction.message);
      const active = (() => { try { return getAccountVoiceSessions(userId, idx).length; } catch { return 1; } })();
      return interaction.editReply({
        content: active > 1
          ? `✅ **${truncate(accountName(tokens, idx), 60)}** — \`${guildId}\` / \`${channelId}\` eklendi. Artık **${active} sunucuda** AFK (mikrofon + kulaklık kapalı).`
          : `✅ **${truncate(accountName(tokens, idx), 60)}** — \`${channelId}\` kanalına girdi (mikrofon + kulaklık kapalı).`,
      });
    }

    // DM sesi — sadece sese gir, mikrofon + kulaklık kapalı
    if (actionParts[0] === 'modaldm') {
      const idx = parseInt(actionParts[1], 10);
      const channelId = interaction.fields.getTextInputValue('dm_channel_id').trim();

      await interaction.deferReply({ ephemeral: true });
      const res = await startVoiceAfk(userId, idx, DM_GUILD, channelId, {
        selfMute: true,
        selfDeaf: true,
      });
      if (!res.success) {
        return interaction.editReply({
          content: res.conflict
            ? `🚫 **Bu hesap aynı sunucuda zaten başka bir ses kanalında** (${res.where}).\n> Aynı sunucuda tek kanal olur — farklı bir DM ya da sunucu dene, ya da önce \`Hesabı Durdur\` seç.`
            : `❌ DM sesi başlatılamadı: \`${res.error}\``,
        });
      }
      markStart(userId, 'voiceafk', idx);
      rememberGateMessage(userId, '?hesaplarim', interaction.message);
      return interaction.editReply({
        content: `✅ **${truncate(accountName(tokens, idx), 60)}** — DM sesine girdi (mikrofon + kulaklık kapalı).`,
      });
    }
  },
};
