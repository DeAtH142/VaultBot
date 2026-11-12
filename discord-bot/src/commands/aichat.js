// src/commands/aichat.js — 🤖 AI Chat Botu (Groq / Gemini / OpenAI) — Pro Panel v3
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} from 'discord.js';
import {
  COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine,
} from '../utils/embeds.js';
import { getTokens } from '../utils/tokenStore.js';

import * as aiRunner from '../utils/aiChatRunner.js';
const {
  startAiChat, stopAiChat, isAiRunning, getAiConfigs, availableProviders,
  getWorkingModels, getModelStats,
} = aiRunner;
const removeAiConfig = typeof aiRunner.removeAiConfig === 'function'
  ? aiRunner.removeAiConfig
  : () => false;

import {
  getUserKeys, setUserKeyAndDiscover, clearUserKey, validateKey, maskKey,
} from '../utils/aiKeyStore.js';

const FOOTER = () => BRAND.footer('AI Conversation Engine');

function fmtConfig(cfg, running) {
  const modelInfo = cfg.provider && cfg.model
    ? `>    🤖 **Model:** \`${cfg.provider}:${cfg.model}\``
    : '';
  return [
    `> ${running ? '🟢' : '⚪'} **Hesap #${cfg.tokenIndex + 1}**`,
    `>    💬 **Kanal(lar):** ${cfg.config.channelIds.map(c => `<#${c}>`).join(', ')}`,
    `>    🧠 **Kişilik:** ${cfg.config.systemPrompt ? `\`${cfg.config.systemPrompt.slice(0, 60)}…\`` : '*varsayılan*'}`,
    modelInfo,
    `>    📨 **Gönderilen cevap:** \`${cfg.stats?.replies ?? 0}\``,
  ].filter(Boolean).join('\n');
}

function modelStatsLine() {
  const stats = ['groq', 'gemini', 'openai'].map(p => {
    const s = getModelStats(p);
    const name = p === 'groq' ? 'Groq' : p === 'gemini' ? 'Gemini' : 'OpenAI';
    return `> 📊 **${name}:** \`${s.active}\` aktif / \`${s.total}\` toplam`;
  }).join('\n');
  return stats;
}

export default {
  name: 'aichat',
  aliases: ['ai', 'sohbetbot', 'chatgpt'],
  description: 'REXAL — AI Sohbet Botu (Groq / Gemini / OpenAI)',

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
        `> 🔑 **OpenAI:** ${keys.openai ? `\`${maskKey(keys.openai)}\`` : '*eklenmemiş*'}`,
        '',
        section('Model İstatistikleri'),
        modelStatsLine(),
        '',
        section('Ne Yapar?'),
        'Seçili hesap, belirlediğin kanallarda AI ile **doğal sohbet eder**.',
        'Kanal başına son `12` mesaj hatırlanır.',
        '',
        section('Kontrol Paneli'),
        `> ${UX.dot2} 🤖 **Başlat** — Hesap seç → model seç → form doldur`,
        `> ${UX.dot2} 📋 **Durum & Düzenle** — Configleri gör / düzenle`,
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
          new ButtonBuilder().setCustomId('aichat:keyopenai').setLabel('OpenAI Key').setEmoji('🧠').setStyle(ButtonStyle.Primary),
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
    if (action.startsWith('key')) {
      const provider = action === 'keygroq' ? 'groq' : action === 'keygemini' ? 'gemini' : 'openai';
      const modal = new ModalBuilder()
        .setCustomId(`aichat:keymodal:${provider}`)
        .setTitle(`${provider === 'groq' ? '⚡ Groq' : provider === 'gemini' ? '💎 Gemini' : '🧠 OpenAI'} API Key`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('api_key').setLabel('API Key (gizli tut!)')
            .setPlaceholder(provider === 'groq' ? 'gsk_...' : provider === 'openai' ? 'sk-...' : 'AIza...')
            .setStyle(TextInputStyle.Short).setRequired(true)),
      );
      return interaction.showModal(modal);
    }

    if (action === 'keysil') {
      clearUserKey(userId, 'groq');
      clearUserKey(userId, 'gemini');
      clearUserKey(userId, 'openai');
      return interaction.reply({ content: '🗑️ Tüm AI keyleriniz silindi.', ephemeral: true });
    }

    // ── AI Chat Başlat (akış: hesap → provider → model → modal) ──
    if (action === 'baslat') {
      if (providers.length === 0) {
        return interaction.reply({ content: '❌ Önce API key eklemelisiniz! Yukarıdaki **Groq Key**, **Gemini Key** veya **OpenAI Key** butonunu kullanın.', ephemeral: true });
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
          : `⚠️ Hesap #${idx + 1} durduruldu fakat config silinemedi.`,
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

    // ── Hesap seçildi → sağlayıcı seçimine geç ───────────────────
    if (action === 'sec') {
      const idx = Number(interaction.values[0]);
      const providers = availableProviders(userId);

      if (providers.length === 0) {
        return interaction.update({ content: '❌ Önce API key ekleyin.', components: [] });
      }

      // Tek sağlayıcı varsa doğrudan model seçimine atla
      if (providers.length === 1) {
        const p = providers[0].toLowerCase() === 'groq' ? 'groq' : providers[0].toLowerCase() === 'gemini' ? 'gemini' : 'openai';
        return this.showModelSelect(interaction, userId, idx, p);
      }

      // Birden fazla sağlayıcı varsa seçim yap
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`aichat:providersec:${idx}`)
          .setPlaceholder('🧠 Sağlayıcı seç...')
          .addOptions(providers.map(p => {
            const key = p.toLowerCase() === 'groq' ? 'groq' : p.toLowerCase() === 'gemini' ? 'gemini' : 'openai';
            const stats = getModelStats(key);
            return {
              label: `${p} (${stats.active}/${stats.total} model)`.slice(0, 100),
              value: key,
              emoji: key === 'groq' ? '⚡' : key === 'gemini' ? '💎' : '🧠',
            };
          })),
      );
      return interaction.update({ content: '🧠 **Hangi AI sağlayıcısını kullanacaksın?**', components: [row] });
    }

    // ── Sağlayıcı seçildi → model seçimi ────────────────────────
    if (action === 'providersec') {
      const idx = Number(parts[1]);
      const provider = interaction.values[0];
      return this.showModelSelect(interaction, userId, idx, provider);
    }

    // ── Model seçildi → modal ───────────────────────────────────
    if (action === 'modelsec') {
      const idx = Number(parts[1]);
      const provider = parts[2];
      const model = interaction.values[0];
      const tokens = getTokens(userId);
      const name = tokens[idx]?.username || tokens[idx]?.label || `Hesap #${idx + 1}`;

      const modal = new ModalBuilder()
        .setCustomId(`aichat:modal:${idx}:${provider}:${model}`)
        .setTitle(`🤖 ${name} — AI Chat`.slice(0, 45));

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

  // ── Model seçim menüsünü göster ───────────────────────────────
  async showModelSelect(interaction, userId, tokenIndex, provider) {
    const working = getWorkingModels(provider);
    const stats = getModelStats(provider);

    if (working.length === 0) {
      return interaction.update({
        content: [
          `❌ **${provider}** için çalışan model bulunamadı.`,
          `> 📊 Test edilen: \`${stats.total}\` | Çalışan: \`0\``,
          '> 💡 API key\'i yeniden ekleyerek modelleri test ettirebilirsin.',
        ].join('\n'),
        components: [],
      });
    }

    // Max 25 seçenek (Discord limiti)
    const options = working.slice(0, 25).map(m => ({
      label: m.slice(0, 100),
      value: m,
      emoji: provider === 'groq' ? '⚡' : provider === 'gemini' ? '💎' : '🧠',
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`aichat:modelsec:${tokenIndex}:${provider}`)
        .setPlaceholder(`🤖 ${provider} modeli seç (${working.length} aktif)`)
        .addOptions(options),
    );

    return interaction.update({
      content: [
        `📊 **${provider}** — \`${stats.active}\` aktif / \`${stats.total}\` toplam model`,
        `> Aşağıdan bir model seç:`,
      ].join('\n'),
      components: [row],
    });
  },

  // ══════════════════════════════════════════════════════════════════
  // MODAL YANITLARI
  // ══════════════════════════════════════════════════════════════════
  async onModalSubmit(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    // ── API Key kaydetme ────────────────────────────────────────
    if (action === 'keymodal') {
      const provider = parts[1];
      const rawKey = interaction.fields.getTextInputValue('api_key').trim();
      await interaction.deferReply({ ephemeral: true });

      const test = await validateKey(provider, rawKey);
      if (!test.ok) {
        return interaction.editReply({
          embeds: [errorEmbed(`❌ **${provider}** key geçersiz: ${test.reason}\nKey kaydedilmedi.`)],
        });
      }

      // Key + otomatik model keşfi
      const discovery = await setUserKeyAndDiscover(userId, provider, rawKey);

      const modelLine = discovery.success
        ? `> 🧪 **Test edilen:** \`${discovery.total}\` | ✅ **Çalışan:** \`${discovery.working.length}\`\n> 💡 Çalışan modeller kaydedildi. "AI Chat Başlat" ile kullanabilirsin.`
        : `> ⚠️ Model keşfi: \`${discovery.error}\`\n> Key kaydedildi, modeller daha sonra test edilebilir.`;

      const embed = new EmbedBuilder()
        .setTitle('🔑 API Key Kaydedildi')
        .setColor(COLORS.success)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> ✅ **Sağlayıcı:** \`${provider === 'groq' ? 'Groq' : provider === 'gemini' ? 'Gemini' : 'OpenAI'}\``,
          `> 🔑 **Key:** \`${maskKey(rawKey)}\``,
          `> 🔒 **Depolama:** \`AES-256-GCM\` şifreli`,
          '',
          modelLine,
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── AI Chat başlatma (modal) ────────────────────────────────
    // customId: aichat:modal:{idx}:{provider}:{model}
    const idx = Number(parts[1]);
    const provider = parts[2];
    const model = parts[3];

    if (!Number.isInteger(idx) || idx < 0) {
      return interaction.reply({ content: '❌ Geçersiz hesap numarası.', ephemeral: true });
    }

    const rawChannels = interaction.fields.getTextInputValue('channels');
    const channelIds = rawChannels.split(/[\n, ]+/).map(s => s.trim()).filter(s => /^\d{5,}$/.test(s));
    const persona = interaction.fields.getTextInputValue('persona')?.trim() || '';

    if (channelIds.length === 0) {
      return interaction.reply({ embeds: [errorEmbed('Geçerli kanal ID girmediniz!')], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const tokens = getTokens(userId) || [];
    if (!tokens[idx]) {
      return interaction.editReply({
        embeds: [errorEmbed(`❌ Hesap #${idx + 1} bulunamadı.`)],
      });
    }

    try {
      await startAiChat(userId, idx, {
        channelIds,
        systemPrompt: persona || 'Sen normal bir Discord kullanıcısısın. Kısa, doğal ve samimi cevap ver. Türkçe konuş.',
        provider,
        model,
      });
      const embed = new EmbedBuilder()
        .setTitle('🤖 AI Chat Başlatıldı')
        .setColor(COLORS.success)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 🧠 **Hesap:** \`#${idx + 1}\` — \`${tokens[idx].username || tokens[idx].label || 'isimsiz'}\``,
          `> 🤖 **Model:** \`${provider}:${model}\``,
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
