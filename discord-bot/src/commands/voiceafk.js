// src/commands/voiceafk.js — 🌙 Özel AFK & Ses Sistemi (Sunucu + DM Ses v3)
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { getTokens } from '../utils/tokenStore.js';
import {
  startVoiceAfk, stopVoiceAfk, getVoiceAfkStats,
} from '../utils/voiceAfkRunner.js';
import {
  COLORS, THIN_DIVIDER, BRAND, UX, E, DIVIDER,
  section, statusLine, errorEmbed,
} from '../utils/embeds.js';

// ── Kalıcı config deposu (kullanıcı bazlı) ────────────────────────────
const CONFIG_FILE = path.resolve('data/voiceafk-configs.json');

function _load() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}
function _save(d) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(d, null, 2));
  } catch (e) { console.error('[voiceafk store]', e); }
}
const store = {
  get(userId, idx) { return _load()[userId]?.[idx] ?? null; },
  set(userId, idx, cfg) {
    const d = _load();
    d[userId] = d[userId] || {};
    d[userId][idx] = cfg;
    _save(d);
  },
  del(userId, idx) {
    const d = _load();
    if (d[userId]) delete d[userId][idx];
    _save(d);
  },
  list(userId) {
    return Object.entries(_load()[userId] || {})
      .map(([k, v]) => ({ tokenIndex: parseInt(k, 10), ...v }));
  },
};

// 🔑 DM sesleri için sentinel guild ID — runner bunu görünce DM moduna geçer
const DM_GUILD = '@me';

function isRunning(userId, idx) {
  try { return !!getVoiceAfkStats(userId, idx); } catch { return false; }
}
function accountName(tokens, idx) {
  const t = tokens[idx];
  return t?.username || t?.label || `Hesap #${idx + 1}`;
}

const FOOTER = () => BRAND.footer('Secure Voice Engine');

export default {
  name: 'voiceafk',
  aliases: ['sesafk', 'sesafkpanel', 'afkses'],
  description: 'REXAL — Özel AFK & Ses Sistemi Kontrol Paneli',

  async execute(message) {
    await message.reply({
      embeds: [createMainEmbed(message.client)],
      components: createMainRows(),
    });
  },

  // ── Buton Etkileşimleri ──────────────────────────────────────────
  async onButton(interaction, actionParts) {
    const action = actionParts[0];
    const userId = interaction.user.id;
    const tokens = getTokens(userId);

    // 🎙️ SUNUCU SES — hesap seç
    if (action === 'sec') {
      if (tokens.length === 0) {
        return interaction.reply({
          content: '📦 Kasanızda hesap yok! Önce `!hesaplarim` panelinden `!tokenekle` ile ekleyin.',
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`👤 Hesap Seçimi — Sunucu Ses (${tokens.length})`)
        .setColor(0x3498db)
        .setDescription([
          `> ${E?.check ?? '✅'} **Bağlı hesaplar menüde işaretli**`,
          '> Bir hesap seçince **Sunucu + Ses Kanalı** formu açılacak.',
          '',
          DIVIDER,
        ].join('\n'));

      const options = tokens.map((t, i) => {
        const running = isRunning(userId, i);
        return {
          label: (t.username || t.label || `Hesap ${i + 1}`).slice(0, 100),
          description: running ? '✅ Zaten bağlı' : '⭕ Hazır',
          value: String(i),
          emoji: running ? '🎙️' : '💤',
        };
      });

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('voiceafk:hesapayari')
          .setPlaceholder('Sunucu ses kanalına bağlanacak hesabı seç...')
          .addOptions(options),
      );

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // 💬 DM SES — hesap seç
    if (action === 'dm') {
      if (tokens.length === 0) {
        return interaction.reply({
          content: '📦 Kasanızda hesap yok! Önce `!hesaplarim` panelinden `!tokenekle` ile ekleyin.',
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`💬 Hesap Seçimi — DM Ses (${tokens.length})`)
        .setColor(0x9b59b6)
        .setDescription([
          `> ${E?.check ?? '✅'} **DM sesine girecek hesabı seç**`,
          '> Sadece **DM Kanal ID** gireceksin — sunucu gerekmiyor.',
          '> Hesap zaten o grup DM\'in içinde olmalı.',
          '',
          DIVIDER,
        ].join('\n'));

      const options = tokens.map((t, i) => {
        const running = isRunning(userId, i);
        return {
          label: (t.username || t.label || `Hesap ${i + 1}`).slice(0, 100),
          description: running ? '✅ Zaten bağlı' : '⭕ Hazır',
          value: String(i),
          emoji: running ? '📞' : '💤',
        };
      });

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('voiceafk:dmayari')
          .setPlaceholder('DM sesine bağlanacak hesabı seç...')
          .addOptions(options),
      );

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // 🗑️ Hesap kaldır
    if (action === 'kaldir') {
      const configs = store.list(userId);
      const runningIdxs = tokens.map((_, i) => i).filter(i => isRunning(userId, i));
      const idxs = [...new Set([...configs.map(c => c.tokenIndex), ...runningIdxs])];

      if (idxs.length === 0) {
        return interaction.reply({
          content: '📭 Bağlı veya yapılandırılmış hesabınız yok.',
          ephemeral: true,
        });
      }

      const options = idxs.map(i => {
        const running = isRunning(userId, i);
        const cfg = store.get(userId, i);
        const typeTag = cfg?.type === 'dm' ? '💬 DM' : '🎙️ Sunucu';
        return {
          label: accountName(tokens, i).slice(0, 100),
          description: running ? `${typeTag} — Bağlı, durdurmak için seç` : `${typeTag} — Zaten durmuş`,
          value: String(i),
          emoji: '🛑',
        };
      });

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('voiceafk:kaldironay')
          .setPlaceholder('Kaldırmak istediğin hesabı seç...')
          .addOptions(options),
      );

      return interaction.reply({
        content: '🛑 **Kaldırmak istediğin hesabı seç:**',
        components: [row],
        ephemeral: true,
      });
    }

    // 📊 Durum raporu
    if (action === 'rapor') {
      const configs = store.list(userId);
      const runningIdxs = tokens.map((_, i) => i).filter(i => isRunning(userId, i));
      const idxs = [...new Set([...configs.map(c => c.tokenIndex), ...runningIdxs])];

      if (idxs.length === 0) {
        return interaction.reply({
          content: '📭 Henüz aktif veya kayıtlı ses bağlantınız yok.',
          ephemeral: true,
        });
      }

      const lines = idxs.map(i => {
        const name = accountName(tokens, i);
        const cfg = store.get(userId, i);
        const s = isRunning(userId, i) ? getVoiceAfkStats(userId, i) : null;
        const typeTag = cfg?.type === 'dm' ? '💬 DM Ses' : '🎙️ Sunucu Ses';

        if (s) {
          const target = cfg?.type === 'dm'
            ? `> 💬 DM Kanal: \`${cfg.channelId}\``
            : `> 📡 Sunucu: \`${cfg.guildId}\` | Kanal: \`${cfg.channelId}\``;
          return [
            `> ✅ **${name}** — ${typeTag} Bağlı`,
            `> ⏱️ Süre: \`${s.durationMin} dk\` | 🔁 Yeniden Bağlanma: \`${s.reconnections}\``,
            cfg ? target : null,
          ].filter(Boolean).join('\n');
        }

        const targetLine = cfg?.type === 'dm'
          ? `> 💬 Son DM Kanal: \`${cfg.channelId}\``
          : (cfg ? `> 📡 Son Sunucu: \`${cfg.guildId}\` | Kanal: \`${cfg.channelId}\`` : '> 📡 *Yapılandırılmadı*');
        return [
          `> ⭕ **${name}** — ${typeTag} Durduruldu`,
          targetLine,
        ].join('\n');
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('📊 Ses AFK Durum Raporu')
        .setColor(COLORS.vault ?? 0x5865f2)
        .setDescription(lines)
        .setFooter(FOOTER())
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // 🛑 Tümünü durdur
    if (action === 'tumukaldir' || action === 'tumukaldır') {
      let stopped = 0;
      tokens.forEach((_, i) => {
        try { if (stopVoiceAfk(userId, i).success) stopped++; } catch {}
      });
      return interaction.update({
        content: [
          `🛑 **${stopped}** hesap ses kanalından çıkarıldı.`,
          `> 💡 Yapılandırmalar korundu — \`Yeniden Başlat\` ile geri bağlayabilirsiniz.`,
        ].join('\n'),
        components: [],
      });
    }

    // 🔄 Yeniden başlat
    if (action === 'restart') {
      await interaction.deferReply({ ephemeral: true });
      const configs = store.list(userId);
      if (configs.length === 0) {
        return interaction.editReply({
          content: '📭 Yeniden başlatılacak kayıtlı yapılandırma bulunamadı.',
        });
      }

      const results = [];
      let started = 0;
      for (const cfg of configs) {
        const name = accountName(tokens, cfg.tokenIndex);
        try {
          const gid = cfg.type === 'dm' ? DM_GUILD : cfg.guildId;
          const res = await startVoiceAfk(userId, cfg.tokenIndex, gid, cfg.channelId);
          if (res.success) {
            started++;
            results.push(`> ✅ **${name}** — ${cfg.type === 'dm' ? '💬 DM' : '🎙️ Sunucu'} yeniden bağlandı`);
          } else {
            results.push(`> ❌ **${name}** — \`${res.error}\``);
          }
        } catch (e) {
          results.push(`> ❌ **${name}** — \`${e.message}\``);
        }
        await new Promise(r => setTimeout(r, 1500));
      }

      const embed = new EmbedBuilder()
        .setTitle('🔄 Ses AFK Yeniden Başlatma')
        .setColor(started > 0 ? (COLORS.success ?? 0x2ecc71) : (COLORS.danger ?? 0xed4245))
        .setDescription([`\`${THIN_DIVIDER}\``, ...results, `\`${THIN_DIVIDER}\``].join('\n'))
        .setFooter(FOOTER())
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },

  // ── Menü Seçimleri ───────────────────────────────────────────────
  async onSelect(interaction, actionParts) {
    const action = actionParts[0];
    const userId = interaction.user.id;

    if (action === 'hesapayari') {
      const idx = parseInt(interaction.values[0], 10);
      const tokens = getTokens(userId);
      const existing = store.get(userId, idx) || {};
      const name = accountName(tokens, idx);

      const modal = new ModalBuilder()
        .setCustomId(`voiceafk:modal:${idx}`)
        .setTitle(`Sunucu Ses — ${name}`.slice(0, 45));

      const guildInput = new TextInputBuilder()
        .setCustomId('guild_id')
        .setLabel('Sunucu ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678')
        .setValue(existing.type === 'guild' ? (existing.guildId || '') : '')
        .setRequired(true);

      const channelInput = new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('Ses Kanalı ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678')
        .setValue(existing.type === 'guild' ? (existing.channelId || '') : '')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(guildInput),
        new ActionRowBuilder().addComponents(channelInput),
      );

      return interaction.showModal(modal);
    }

    if (action === 'dmayari') {
      const idx = parseInt(interaction.values[0], 10);
      const tokens = getTokens(userId);
      const existing = store.get(userId, idx) || {};
      const name = accountName(tokens, idx);

      const modal = new ModalBuilder()
        .setCustomId(`voiceafk:modaldm:${idx}`)
        .setTitle(`DM Ses — ${name}`.slice(0, 45));

      const channelInput = new TextInputBuilder()
        .setCustomId('dm_channel_id')
        .setLabel('DM Kanal ID (grup DM / arama ID)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678')
        .setValue(existing.type === 'dm' ? (existing.channelId || '') : '')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(channelInput),
      );

      return interaction.showModal(modal);
    }

    if (action === 'kaldironay') {
      const idx = parseInt(interaction.values[0], 10);
      let stopped = false;
      try { stopped = stopVoiceAfk(userId, idx).success; } catch {}
      store.del(userId, idx);

      return interaction.update({
        content: stopped
          ? `✅ Hesap #${idx + 1} bağlantısı kesildi ve yapılandırma silindi.`
          : `⭕ Hesap #${idx + 1} zaten bağlı değildi. Yapılandırma temizlendi.`,
        components: [],
      });
    }
  },

  // ── Modal Yanıtları ─────────────────────────────────────────────
  async onModalSubmit(interaction, actionParts) {
    const userId = interaction.user.id;

    // 🎙️ Sunucu ses modal
    if (actionParts[0] === 'modal') {
      const idx = parseInt(actionParts[1], 10);
      const guildId = interaction.fields.getTextInputValue('guild_id').trim();
      const channelId = interaction.fields.getTextInputValue('channel_id').trim();

      await interaction.deferReply({ ephemeral: true });
      store.set(userId, idx, { type: 'guild', guildId, channelId, enabled: true });

      const tokens = getTokens(userId);
      const name = accountName(tokens, idx);
      const res = await startVoiceAfk(userId, idx, guildId, channelId);

      if (!res.success) {
        return interaction.editReply({
          embeds: [errorEmbed(`Ses bağlantısı başlatılamadı:\n\`${res.error}\``)],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('🎙️ Sunucu Ses AFK Başlatıldı')
        .setColor(COLORS.success ?? 0x2ecc71)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 👤 **Hesap:** \`${name}\``,
          `> 📡 **Sunucu:** \`${guildId}\``,
          `> 🔊 **Kanal:** \`${channelId}\``,
          `> 🔁 **Yeniden Deneme:** \`10/kanal\``,
          `> 🔒 **Şifreleme:** \`AES-256-GCM\``,
          '',
          `> Koparsa otomatik geri bağlanır (10 deneme limitiyle).`,
          `\`${THIN_DIVIDER}\``,
        ].join('\n'))
        .setFooter(FOOTER())
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // 💬 DM ses modal
    if (actionParts[0] === 'modaldm') {
      const idx = parseInt(actionParts[1], 10);
      const channelId = interaction.fields.getTextInputValue('dm_channel_id').trim();

      await interaction.deferReply({ ephemeral: true });
      store.set(userId, idx, { type: 'dm', channelId, enabled: true });

      const tokens = getTokens(userId);
      const name = accountName(tokens, idx);
      const res = await startVoiceAfk(userId, idx, DM_GUILD, channelId);

      if (!res.success) {
        return interaction.editReply({
          embeds: [errorEmbed(`DM ses bağlantısı başlatılamadı:\n\`${res.error}\``)],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('💬 DM Ses AFK Başlatıldı')
        .setColor(0x9b59b6)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 👤 **Hesap:** \`${name}\``,
          `> 💬 **DM Kanal:** \`${channelId}\``,
          `> 🔁 **Yeniden Deneme:** \`10/kanal\``,
          `> 🔒 **Şifreleme:** \`AES-256-GCM\``,
          '',
          `> Grup DM ses aramasına bağlandı. Koparsa otomatik geri bağlanır.`,
          `\`${THIN_DIVIDER}\``,
        ].join('\n'))
        .setFooter(FOOTER())
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },
};

// ── Ana Panel Embed ────────────────────────────────────────────
export function createMainEmbed(client) {
  return new EmbedBuilder()
    .setColor(0xfaa61a)
    .setAuthor({ name: `${BRAND.name} • Secure Voice Engine ${BRAND.version}` })
    .setTitle('🌙 REXAL — Özel AFK & Ses Sistemi')
    .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setDescription([
      UX.header,
      `*${UX.arrow} Sunucu sesi + DM sesi tek panelde*`,
      UX.footerLine,
      '',
      statusLine([
        ['🎙️', 'Sunucu Ses', 'Guild + Kanal'],
        ['💬', 'DM Ses', 'Sadece Kanal ID'],
        ['🔒', 'Şifreleme', 'AES-256-GCM'],
      ]),
      '',
      section('Nasıl Çalışır?'),
      `> ${UX.dot2} 🎙️ **Havuzdan Hesap Seç** — Sunucu ses kanalına bağlan`,
      `> ${UX.dot2} 💬 **DM Sese Gir** — Grup DM aramalarına bağlan (sadece kanal ID)`,
      `> ${UX.dot2} Kanal bulunamazsa **10 kez** arar, sonra bırakır`,
      `> ${UX.dot2} Koparsa otomatik geri bağlanır`,
      '',
      section('Kontrol Paneli'),
      `> ${UX.dot2} 👤 **Hesap Seç** — Sunucu ses kanalına bağla`,
      `> ${UX.dot2} 💬 **DM Sese Gir** — DM aramasına bağla`,
      `> ${UX.dot2} 🗑️ **Hesap Kaldır** — Belirli hesabı durdur`,
      `> ${UX.dot2} 📊 **Durum Raporu** — Canlı istatistikler`,
      `> ${UX.dot2} 🔄 **Yeniden Başlat** — Kayıtlı tüm hesapları tekrar bağla`,
    ].join('\n'))
    .setFooter(FOOTER())
    .setTimestamp();
}

// ── Ana Buton Satırları ───────────────────────────────────────
export function createMainRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('voiceafk:sec')
      .setLabel('Havuzdan Hesap Seç')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('voiceafk:dm')
      .setLabel('DM Sese Gir')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('voiceafk:kaldir')
      .setLabel('Hesap Kaldır')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('voiceafk:rapor')
      .setLabel('Durum Raporu')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('voiceafk:restart')
      .setLabel('Yeniden Başlat')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('voiceafk:tumukaldir')
      .setLabel('Tümünü Durdur')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}
