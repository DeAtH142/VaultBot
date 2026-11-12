// src/commands/aichat.js — 🤖 AI Chat Botu (Groq / Gemini) — Pro Panel v2.1
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} from 'discord.js';
import {
  COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine,
} from '../utils/embeds.js';
import { getTokens } from '../utils/tokenStore.js';

// ✅ FIX: namespace import — removeAiConfig yoksa bile bot çökmez
import * as aiRunner from '../utils/aiChatRunner.js';
const {
  startAiChat, stopAiChat, isAiRunning, getAiConfigs, availableProviders,
} = aiRunner;
const removeAiConfig = typeof aiRunner.removeAiConfig === 'function'
  ? aiRunner.removeAiConfig
  : () => false;

import {
  getUserKeys, setUserKey, clearUserKey, validateKey, maskKey,
} from '../utils/aiKeyStore.js';

const FOOTER = () => BRAND.footer('AI Conversation Engine');

function fmtConfig(cfg, running) {
  return [
    `> ${running ? '🟢' : '⚪'} **Hesap #${cfg.tokenIndex + 1}**`,
    `>    💬 **Kanal(lar):** ${cfg.config.channelIds.map(c => `<#${c}>`).join(', ')}`,
    `>    🧠 **Kişilik:** ${cfg.config.systemPrompt ? `\`${cfg.config.systemPrompt.slice(0, 60)}${cfg.config.systemPrompt.length > 60 ? '…' : ''}\`` : '*varsayılan*'}`,
    `>    📨 **Gönderilen cevap:** \`${cfg.stats?.replies ?? 0}\``,
  ].join('\n');
}

export default {
  name: 'aichat',
  aliases: ['ai', 'sohbetbot', 'chatgpt'],
  description: 'REXAL — AI Sohbet Botu (Groq / Gemini)',

  async execute(message) {
    const userId = message.author.id;
    const providers = availableProviders(userId);
    const keys = getUserKeys(userId);
    const configs = getAiConfigs(userId);
    const runningCount = configs.filter(c => isAiRunning(userId, c.tokenIndex)).length;

    const embed = new EmbedBuilder()
      .setColor(COLORS.purple)
      .setAuthor({ name: `${BRAND.name} • AI Conversation Engine ${BRAND.version}` })
      .setTitle('🤖 REXAL — AI Chat Botu')
      .setThumbnail(message.client.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setDescription([
        UX.header, UX.footerLine, '',
        statusLine([
          ['🌐', 'Sistem', providers.length ? 'Hazır' : 'Key Bekliyor'],
          ['🧠', 'Motor', providers.length ? providers.join(' + ') : 'Key ekle'],
          ['⚡', 'Aktif', `${runningCount}/${configs.length}`],
        ]),
        '',
        section('API Key Durumu'),
        `> 🔑 **Groq:** ${keys.groq ? `\`${maskKey(keys.groq)}\`` : '*eklenmemiş*'}`,
        `> 🔑 **Gemini:** ${keys.gemini ? `\`${maskKey(keys.gemini)}\`` : '*eklenmemiş*'}`,
        '',
        section('Ne Yapar?'),
        'Seçili hesap, belirlediğin kanallarda AI ile **doğal sohbet eder** — spam/aktivite görünmek için mükemmel.',
        'Kanal başına son `12` mesaj hatırlanır (bağlamlı konuşma).',
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('🧠', 'Bağlamlı Hafıza', 'Kanal başı son 12 mesaj')}`,
        `> ${UX.dot2} ${bullet('🎭', 'Kişilik Ayarı', 'Kendi system promptunu yaz')}`,
        `> ${UX.dot2} ${bullet('⌨️', 'Doğal Tempo', 'Typing + rastgele gecikme')}`,
        `> ${UX.dot2} ${bullet('🔁', 'Çift Motor', 'Groq → Gemini fallback')}`,
        `> ${UX.dot2} ${bullet('♻️', 'Reboot Recovery', 'Kaldığı yerden devam')}`,
        '',
        section('Kontrol Paneli'),
        `> ${UX.dot2} 🤖 **Başlat** — Yeni AI chat görevi kur`,
        `> ${UX.dot2} 📋 **Durum & Düzenle** — Aktif configleri gör / düzenle`,
        `> ${UX.dot2} ⏹️ **Durdur** — Belirli hesabı durdur`,
        `> ${UX.dot2} 🗑️ **Hesap Kaldır** — Configi sil`,
        `> ${UX.dot2} 🔄 **Yeniden Başlat** — Kayıtlı tüm görevleri tekrar başlat`,
        `> ${UX.dot2} 🛑 **Tümünü Durdur** — Sadece sizin hesaplarınız`,
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('aichat:keygroq').setLabel('Groq Key').setEmoji('⚡').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('aichat:keygemini').setLabel('Gemini Key').setEmoji('💎').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('aichat:keysil').setLabel('Keyleri Sil').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('aichat:baslat').setLabel('AI Chat Başlat').setEmoji('🤖').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('aichat:durum').setLabel('Durum & Düzenle').setEmoji('📋').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('aichat:durdur').setLabel('Durdur').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('aichat:restart').setLabel('Yeniden Başlat').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('aichat:hepsini-durdur').setLabel('Tümünü Durdur').setEmoji('🛑').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('aichat:sil').setLabel('Hesap Kaldır').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        ),
      ],
    });
  },

  // ══════════════════════════════════════════════════════════════════
  // BUTONLAR
  // ══════════════════════════════════════════════════════════════════
  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;
    const tokens = getTokens(userId);
    const providers = availableProviders(userId);

    // ── Durum & Düzenle ─────────────────────────────────────────
    if (action === 'durum') {
      const configs = getAiConfigs(userId);
      if (configs.length === 0) {
        return interaction.reply({ content: '📭 Aktif AI chat yok.', ephemeral: true });
      }
      const lines = configs.map(c => fmtConfig(c, isAiRunning(userId, c.tokenIndex))).join('\n\n');
      const embed = new EmbedBuilder()
        .setTitle('📋 AI Chat Görevleri')
        .setColor(COLORS.info)
        .setDescription(lines.slice(0, 4000))
        .setFooter(FOOTER()).setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('aichat:duzenlesec')
          .setPlaceholder('✏️ Düzenlemek için bir hesap seç...')
          .addOptions(configs.slice(0, 25).map(c => ({
            label: `Hesap #${c.tokenIndex + 1}`.slice(0, 100),
            description: `${isAiRunning(userId, c.tokenIndex) ? '🟢 Çalışıyor' : '⚪ Durduruldu'} — ${c.config.channelIds.length} kanal`.slice(0, 100),
            value: String(c.tokenIndex),
            emoji: '✏️',
          }))),
      );
      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // ── Durdur ───────────────────────────────────────────────────
    if (action === 'durdur') {
      const configs = getAiConfigs(userId).filter(c => isAiRunning(userId, c.tokenIndex));
      if (configs.length === 0) {
        return interaction.reply({ content: '📭 Çalışan AI chat yok.', ephemeral: true });
      }
      return interaction.reply({
        content: '⏹️ **Durdurulacak hesabı seç:**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('aichat:durdursec')
            .addOptions(configs.slice(0, 25).map(c => ({
              label: `Hesap #${c.tokenIndex + 1}`.slice(0, 100),
              description: `${c.config.channelIds.length} kanal`.slice(0, 100),
              value: String(c.tokenIndex),
              emoji: '🟢',
            })))
            .setPlaceholder('🔍 Hesap seç...'),
        )],
        ephemeral: true,
      });
    }

    // ── Hesap Kaldır ─────────────────────────────────────────────
    if (action === 'sil') {
      const configs = getAiConfigs(userId);
      if (configs.length === 0) {
        return interaction.reply({ content: '📭 Kaldırılacak config yok.', ephemeral: true });
      }
      return interaction.reply({
        content: '🗑️ **Kaldırmak istediğin hesabı seç** (çalışıyorsa önce durdurulur):',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('aichat:silsec')
            .addOptions(configs.slice(0, 25).map(c => ({
              label: `Hesap #${c.tokenIndex + 1}`.slice(0, 100),
              description: `${isAiRunning(userId, c.tokenIndex) ? '🟢 Çalışıyor' : '⚪ Durmuş'} — ${c.config.channelIds.length} kanal`.slice(0, 100),
              value: String(c.tokenIndex),
              emoji: '🗑️',
            })))
            .setPlaceholder('🔍 Hesap seç...'),
        )],
        ephemeral: true,
      });
    }

    // ── Yeniden Başlat ───────────────────────────────────────────
    if (action === 'restart') {
      await interaction.deferReply({ ephemeral: true });
      const configs = getAiConfigs(userId);
      if (configs.length === 0) {
        return interaction.editReply({ content: '📭 Yeniden başlatılacak config yok.' });
      }

      const results = [];
      let started = 0;
      for (const cfg of configs) {
        const name = `Hesap #${cfg.tokenIndex + 1}`;
        try {
          if (isAiRunning(userId, cfg.tokenIndex)) {
            try { stopAiChat(userId, cfg.tokenIndex); } catch {}
          }
          await startAiChat(userId, cfg.tokenIndex, cfg.config);
          started++;
          results.push(`> ✅ **${name}** — yeniden başlatıldı`);
        } catch (e) {
          results.push(`> ❌ **${name}** — \`${e.message}\``);
        }
        await new Promise(r => setTimeout(r, 800));
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔄 Yeniden Başlatma (${started}/${configs.length})`)
        .setColor(started > 0 ? COLORS.success : COLORS.danger)
        .setDescription([`\`${THIN_DIVIDER}\``, ...results, `\`${THIN_DIVIDER}\``].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── Tümünü Durdur ────────────────────────────────────────────
    if (action === 'hepsini-durdur' || action === 'hepsini_durdur') {
      const configs = getAiConfigs(userId);
      let stopped = 0;
      const names = [];
      for (const cfg of configs) {
        if (!isAiRunning(userId, cfg.tokenIndex)) continue;
        try {
          if (stopAiChat(userId, cfg.tokenIndex)) {
            stopped++;
            names.push(`Hesap #${cfg.tokenIndex + 1}`);
          }
        } catch {}
      }
      return interaction.reply({
        content: stopped > 0
          ? [`🛑 **${stopped}** hesap durduruldu:`, ...names.map(n => `> • ${n}`), '', '> 🔒 Diğer kullanıcılara dokunulmadı.'].join('\n')
          : '📭 Zaten çalışan hesap yok.',
        ephemeral: true,
      });
    }

    // ── API Key yönetimi ─────────────────────────────────────────
    if (action === 'keygroq' || action === 'keygemini') {
      const provider = action === 'keygroq' ? 'groq' : 'gemini';
      const modal = new ModalBuilder()
        .setCustomId(`aichat:keymodal:${provider}`)
        .setTitle(`${provider === 'groq' ? '⚡ Groq' : '💎 Gemini'} API Key`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('api_key').setLabel('API Key (gizli tut!)')
            .setPlaceholder(provider === 'groq' ? 'gsk_...' : 'AIza...')
            .setStyle(TextInputStyle.Short).setRequired(true)),
      );
      return interaction.showModal(modal);
    }

    if (action === 'keysil') {
      clearUserKey(userId, 'groq');
      clearUserKey(userId, 'gemini');
      return interaction.reply({ content: '🗑️ Tüm AI keyleriniz silindi.', ephemeral: true });
    }

    // ── AI Chat Başlat ───────────────────────────────────────────
    if (action === 'baslat') {
      if (providers.length === 0) {
        return interaction.reply({ content: '❌ Önce API key eklemelisiniz! Yukarıdaki **Groq Key** veya **Gemini Key** butonunu kullanın.', ephemeral: true });
      }
      if (tokens.length === 0) {
        return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
      }
      return interaction.reply({
        content: '🤖 **Hangi hesap AI olarak konuşacak?**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('aichat:sec')
            .addOptions(tokens.slice(0, 25).map((t, i) => ({
              label: `${i + 1}. ${t.username || t.label || `Hesap ${i + 1}`}`.slice(0, 100),
              value: String(i),
              emoji: isAiRunning(userId, i) ? '🟢' : (t.status === 'gecersiz' ? '💔' : '⚪'),
            })))
            .setPlaceholder('🔍 Hesap seç...'),
        )],
        ephemeral: true,
      });
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // SEÇİMLER
  // ══════════════════════════════════════════════════════════════════
  async onSelect(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'durdursec') {
      const idx = Number(interaction.values[0]);
      const ok = stopAiChat(userId, idx);
      return interaction.update({
        content: ok ? `⏹️ Hesap #${idx + 1} AI chat durduruldu.` : '❌ Görev bulunamadı.',
        components: [],
      });
    }

    if (action === 'silsec') {
      const idx = Number(interaction.values[0]);
      const wasRunning = isAiRunning(userId, idx);
      try { if (wasRunning) stopAiChat(userId, idx); } catch {}
      let removed = false;
      try { removed = removeAiConfig(userId, idx); } catch { removed = false; }
      return interaction.update({
        content: removed
          ? `🗑️ Hesap #${idx + 1} configi silindi${wasRunning ? ' (çalışıyordu, durduruldu)' : ''}.`
          : `⚠️ Hesap #${idx + 1} durduruldu fakat config silinemedi.\n> 💡 \`aiChatRunner.js\`'de \`removeAiConfig\` export etmiyorsun.`,
        components: [],
      });
    }

    if (action === 'duzenlesec') {
      const idx = Number(interaction.values[0]);
      const cfg = getAiConfigs(userId).find(c => c.tokenIndex === idx);
      if (!cfg) {
        return interaction.update({ content: '❌ Config bulunamadı.', components: [] });
      }
      const modal = new ModalBuilder()
        .setCustomId(`aichat:editmodal:${idx}`)
        .setTitle(`✏️ Hesap #${idx + 1} — Düzenle`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('channels').setLabel('Kanal ID\'leri (virgül ile)')
            .setPlaceholder('123..., 456...').setStyle(TextInputStyle.Short)
            .setValue(cfg.config.channelIds.join(', ')).setRequired(true)),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('persona').setLabel('Kişilik / system prompt (isteğe bağlı)')
            .setPlaceholder('Samimi bir gamer arkadaş gibi konuş.').setStyle(TextInputStyle.Paragraph)
            .setValue(cfg.config.systemPrompt || '').setRequired(false)),
      );
      return interaction.showModal(modal);
    }

    if (action === 'sec') {
      const idx = Number(interaction.values[0]);
      const modal = new ModalBuilder()
        .setCustomId(`aichat:modal:${idx}`)
        .setTitle('🤖 AI Chat Kurulumu');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('channels').setLabel('Kanal ID\'leri (virgül ile)')
            .setPlaceholder('123..., 456...').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('persona').setLabel('Kişilik / system prompt (isteğe bağlı)')
            .setPlaceholder('Samimi bir gamer arkadaş gibi konuş.').setStyle(TextInputStyle.Paragraph).setRequired(false)),
      );
      return interaction.showModal(modal);
    }
  },

  // ══════════════════════════════════════════════════════════════════
  // MODAL YANITLARI
  // ══════════════════════════════════════════════════════════════════
  async onModalSubmit(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    // ── API key kaydetme ────────────────────────────────────────
    if (action === 'keymodal') {
      const provider = parts[1];
      const rawKey = interaction.fields.getTextInputValue('api_key').trim();
      await interaction.deferReply({ ephemeral: true });
      const test = await validateKey(provider, rawKey);
      if (!test.ok) {
        return interaction.editReply({
          embeds: [errorEmbed(`❌ **${provider === 'groq' ? 'Groq' : 'Gemini'}** key geçersiz: ${test.reason}\nKey kaydedilmedi.`)],
        });
      }
      setUserKey(userId, provider, rawKey);
      const embed = new EmbedBuilder()
        .setTitle('🔑 API Key Kaydedildi')
        .setColor(COLORS.success)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> ✅ **Sağlayıcı:** \`${provider === 'groq' ? 'Groq' : 'Gemini'}\``,
          `> 🔑 **Key:** \`${maskKey(rawKey)}\``,
          `> 🔒 **Depolama:** \`AES-256-GCM\` şifreli`,
          '',
          `> Artık **AI Chat Başlat** ile sohbet görevi kurabilirsin.`,
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── Yeni config veya düzenle ────────────────────────────────
    const isEdit = action === 'editmodal';
    const idx = Number(isEdit ? parts[1] : action);

    const rawChannels = interaction.fields.getTextInputValue('channels');
    const channelIds = rawChannels.split(/[\n, ]+/).map(s => s.trim()).filter(s => /^\d{5,}$/.test(s));
    const persona = interaction.fields.getTextInputValue('persona')?.trim() || '';

    if (channelIds.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('Geçerli kanal ID girmediniz!')], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    if (isEdit && isAiRunning(userId, idx)) {
      try { stopAiChat(userId, idx); } catch {}
    }

    try {
      await startAiChat(userId, idx, {
        channelIds,
        systemPrompt: persona || 'Sen normal bir Discord kullanıcısısın. Kısa, doğal ve samimi cevap ver. Türkçe konuş.',
      });
      const embed = new EmbedBuilder()
        .setTitle(isEdit ? '✏️ AI Chat Güncellendi' : '🤖 AI Chat Başlatıldı')
        .setColor(COLORS.success)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 🧠 **Hesap:** \`#${idx + 1}\``,
          `> 💬 **Kanal(lar):** ${channelIds.map(c => `<#${c}>`).join(', ')}`,
          `> 🎭 **Kişilik:** \`${(persona || 'varsayılan').slice(0, 80)}\``,
          '',
          `> ♾️ *Reboot sonrası otomatik geri gelir.*`,
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed(`AI chat başlatılamadı: ${err.message}`)] });
    }
  },
};
