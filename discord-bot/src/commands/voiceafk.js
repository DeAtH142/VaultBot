// src/commands/voiceafk.js — 🌙 Özel AFK & Ses Sistemi (Premium Panel v2)
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

// ── Kalıcı config deposu (kullanıcı bazlı) ─────────────────────────────
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

  // ── Buton Etkileşimleri ──────────────────────────────────────────────
  async onButton(interaction, actionParts) {
    const action = actionParts[0];
    const userId = interaction.user.id;
    const tokens = getTokens(userId);

    if (action === 'sec') {
      if (tokens.length === 0) {
        return interaction.reply({
          content: '📦 Kasanızda hesap yok! Önce `!hesaplarim` panelinden `!tokenekle` ile ekleyin.',
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`👤 Hesap Seçimi (${tokens.length} hesap bulundu)`)
        .setColor(0x3498db)
        .setDescription([
          `> ${E?.check ?? '✅'} **Bağlı hesaplar menüde işaretli**`,
          '> Bir hesap seçince ses bağlantısı formu (sunucu + kanal) açılacak.',
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
          .setPlaceholder('Ses kanalına bağlanacak hesabı seç...')
          .addOptions(options),
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

    } else if (action === 'kaldir') {
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
        return {
          label: accountName(tokens, i).slice(0, 100),
          description: running ? '🎙️ Bağlı — durdurmak için seç' : '⭕ Zaten durmuş',
          value: String(i),
          emoji: '🛑',
        };
      });

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('voiceafk:kaldironay')
          .setPlaceholder('Kaldırmak/durdurmak istediğin hesabı seç...')
          .addOptions(options),
      );

      await interaction.reply({
        content: '🛑 **Kaldırmak istediğin hesabı seç:**',
        components: [row],
        ephemeral: true,
      });

    } else if (action === 'rapor') {
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

        if (s) {
          return [
            `> ✅ **${name}** — Bağlı`,
            `> ⏱️ Süre: \`${s.durationMin} dk\` | 🔁 Yeniden Bağlanma: \`${s.reconnections}\``,
            cfg ? `> 📡 Sunucu: \`${cfg.guildId}\` | Kanal: \`${cfg.channelId}\`` : null,
          ].filter(Boolean).join('\n');
        }
        return [
          `> ⭕ **${name}** — Durduruldu`,
          cfg ? `> 📡 Son Sunucu: \`${cfg.guildId}\` | Kanal: \`${cfg.channelId}\``
              : '> 📡 *Henüz yapılandırılmadı*',
        ].join('\n');
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('📊 Ses AFK Durum Raporu')
        .setColor(COLORS.vault ?? 0x5865f2)
        .setDescription(lines)
        .setFooter(FOOTER())
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (action === 'tumukaldir' || action === 'tumukaldır') {
      let stopped = 0;
      tokens.forEach((_, i) => {
        try { if (stopVoiceAfk(userId, i).success) stopped++; } catch {}
      });
      await interaction.update({
        content: [
          `🛑 **${stopped}** hesap ses kanalından çıkarıldı.`,
          `> 💡 Yapılandırmalar korundu — \`Yeniden Başlat\` ile geri bağlayabilirsiniz.`,
        ].join('\n'),
        components: [],
      });

    } else if (action === 'restart') {
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
          const res = await startVoiceAfk(userId, cfg.tokenIndex, cfg.guildId, cfg.channelId);
          if (res.success) { started++; results.push(`> ✅ **${name}** — yeniden bağlandı`); }
          else results.push(`> ❌ **${name}** — \`${res.error}\``);
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

      await interaction.editReply({ embeds: [embed] });
    }
  },

  // ── Menü Seçimleri ───────────────────────────────────────────────────
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
        .setTitle(`Ses Bağlantısı — ${name}`.slice(0, 45));

      const guildInput = new TextInputBuilder()
        .setCustomId('guild_id')
        .setLabel('Sunucu ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678')
        .setValue(existing.guildId || '')
        .setRequired(true);

      const channelInput = new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('Ses Kanalı ID')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678')
        .setValue(existing.channelId || '')
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(guildInput),
        new ActionRowBuilder().addComponents(channelInput),
      );

      await interaction.showModal(modal);

    } else if (action === 'kaldironay') {
      const idx = parseInt(interaction.values[0], 10);
      let stopped = false;
      try { stopped = stopVoiceAfk(userId, idx).success; } catch {}
      store.del(userId, idx);

      await interaction.update({
        content: stopped
          ? `✅ Hesap #${idx + 1} ses kanalından çıkarıldı ve yapılandırma silindi.`
          : `⭕ Hesap #${idx + 1} zaten bağlı değildi. Yapılandırma temizlendi.`,
        components: [],
      });
    }
  },

  // ── Modal Yanıtı ─────────────────────────────────────────────────────
  async onModalSubmit(interaction, actionParts) {
    if (actionParts[0] !== 'modal') return;
    const idx = parseInt(actionParts[1], 10);
    const userId = interaction.user.id;

    const guildId = interaction.fields.getTextInputValue('guild_id').trim();
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();

    await interaction.deferReply({ ephemeral: true });

    // Ayarları kaydet (restart için)
    store.set(userId, idx, { guildId, channelId, enabled: true });

    const tokens = getTokens(userId);
    const name = accountName(tokens, idx);

    const res = await startVoiceAfk(userId, idx, guildId, channelId);

    if (!res.success) {
      return interaction.editReply({
        embeds: [errorEmbed(`Ses bağlantısı başlatılamadı:\n\`${res.error}\``)],
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎙️ Ses AFK Başlatıldı')
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
        `> Durdurduğunda \`Durum Raporu\`'ndan geçmişi görebilirsin.`,
        `\`${THIN_DIVIDER}\``,
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

// ── Ana Panel Embed ────────────────────────────────────────────────────
export function createMainEmbed(client) {
  return new EmbedBuilder()
    .setColor(0xfaa61a)
    .setAuthor({ name: `${BRAND.name} • Secure Voice Engine ${BRAND.version}` })
    .setTitle('🌙 REXAL — Özel AFK & Ses Sistemi')
    .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setDescription([
      UX.header,
      `*${UX.arrow} Kasadaki her hesabı tek tek ses kanalına bağla*`,
      UX.footerLine,
      '',
      statusLine([
        ['🎙️', 'Hedef', 'Seçili Hesap'],
        ['🔁', 'Deneme', '10/kanal'],
        ['🔒', 'Şifreleme', 'AES-256-GCM'],
      ]),
      '',
      section('Nasıl Çalışır?'),
      `> ${UX.dot2} **Havuzdan Hesap Seç** butonuna bas`,
      `> ${UX.dot2} Menüden bir hesap seç — form açılacak`,
      `> ${UX.dot2} Sunucu + Ses Kanalı ID gir, bağlanır`,
      `> ${UX.dot2} Kanal bulunamazsa **10 kez** arar, sonra bırakır`,
      `> ${UX.dot2} Koparsa otomatik geri bağlanır`,
      '',
      section('Kontrol Paneli'),
      `> ${UX.dot2} 👤 **Hesap Seç** — Belirli hesabı bağla`,
      `> ${UX.dot2} 🗑️ **Hesap Kaldır** — Belirli hesabı durdur`,
      `> ${UX.dot2} 📊 **Durum Raporu** — Canlı istatistikler`,
      `> ${UX.dot2} 🔄 **Yeniden Başlat** — Kayıtlı tüm hesapları tekrar bağla`,
    ].join('\n'))
    .setFooter(FOOTER())
    .setTimestamp();
}

// ── Ana Buton Satırları ────────────────────────────────────────────────
export function createMainRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('voiceafk:sec')
      .setLabel('Havuzdan Hesap Seç')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Success),
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
