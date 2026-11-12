// src/commands/aichat.js — 🤖 AI Chat Botu (Groq / Gemini)
// Seçili hesabın belirli kanallarda ChatGPT benzeri AI ile konuşması.
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } from 'discord.js';
import { COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine } from '../utils/embeds.js';
import { getTokens } from '../utils/tokenStore.js';
import { startAiChat, stopAiChat, isAiRunning, getAiConfigs, availableProviders } from '../utils/aiChatRunner.js';
import { getUserKeys, setUserKey, clearUserKey, validateKey, maskKey } from '../utils/aiKeyStore.js';

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
    const providers = availableProviders(message.author.id);
    const keys = getUserKeys(message.author.id);
    const embed = new EmbedBuilder()
      .setColor(COLORS.purple)
      .setAuthor({ name: `${BRAND.name} • AI Conversation Engine ${BRAND.version}` })
      .setTitle('🤖 REXAL — AI Chat Botu')
      .setDescription([
        UX.header, UX.footerLine, '',
        statusLine([
          ['🌐', 'Sistem', providers.length ? 'Hazır' : 'Key Bekliyor'],
          ['🧠', 'Motor', providers.length ? providers.join(' + ') : 'Key ekle'],
        ]),
        '',
        section('API Key Durumu'),
        `> 🔑 **Groq:** ${keys.groq ? `'` + maskKey(keys.groq) + `'` : '*eklenmemiş*'}`,
        `> 🔑 **Gemini:** ${keys.gemini ? `'` + maskKey(keys.gemini) + `'` : '*eklenmemiş*'}`,
        '',
        section('Ne Yapar?'),
        'Seçili hesap, belirlediğin kanallarda AI ile **doğal sohbet eder** — spam/aktivite görünmek için mükemmel.',
        'Kanal başına son `12` mesaj hatırlanır (bağlamlı konuşma).',
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('🧠', 'Bağlamlı Hafıza', 'Kanal başı son 12 mesaj — kopuk robot cevabı yok')}`,
        `> ${UX.dot2} ${bullet('🎭', 'Kişilik Ayarı', 'Kendi system prompt\'unu yaz, istediğin karakterde olsun')}`,
        `> ${UX.dot2} ${bullet('⌨️', 'Doğal Tempo', 'Cevaptan önce typing + rastgele gecikme')}`,
        `> ${UX.dot2} ${bullet('🔁', 'Çift Motor', 'Groq → Gemini fallback zinciri')}`,
        '',
        section('Kontrol Paneli'),
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('aichat:keygroq').setLabel('Groq Key Ekle').setEmoji('⚡').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('aichat:keygemini').setLabel('Gemini Key Ekle').setEmoji('💎').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('aichat:keysil').setLabel('Keyleri Sil').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('aichat:baslat').setLabel('AI Chat Başlat').setEmoji('🤖').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('aichat:durum').setLabel('Durum').setEmoji('📋').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('aichat:durdur').setLabel('Durdur').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        ),
      ],
    });
  },

  async onButton(interaction, action) {
    const userId = interaction.user.id;
    const tokens = getTokens(userId);

    if (action[0] === 'durum') {
      const configs = getAiConfigs(userId);
      if (configs.length === 0) return interaction.reply({ content: '📭 Aktif AI chat yok.', ephemeral: true });
      const lines = configs.map(c => fmtConfig(c, isAiRunning(userId, c.tokenIndex))).join('\n\n');
      const embed = new EmbedBuilder().setTitle('📋 AI Chat Görevleri').setColor(COLORS.info)
        .setDescription(lines.slice(0, 4000)).setFooter(FOOTER()).setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action[0] === 'durdur') {
      const configs = getAiConfigs(userId);
      if (configs.length === 0) return interaction.reply({ content: '📭 Aktif AI chat yok.', ephemeral: true });
      return interaction.reply({
        content: 'Durdurulacak hesabı seç:',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('aichat:durdursec')
            .addOptions(configs.map(c => ({ label: `Hesap #${c.tokenIndex + 1}`, value: String(c.tokenIndex), emoji: '🟢' })))
            .setPlaceholder('🔍 Hesap seç...'),
        )], ephemeral: true,
      });
    }

    // ── API Key yönetimi ────────────────────────────────────────────────
    if (action[0] === 'keygroq' || action[0] === 'keygemini') {
      const provider = action[0] === 'keygroq' ? 'groq' : 'gemini';
      const modal = new ModalBuilder().setCustomId(`aichat:keymodal:${provider}`).setTitle(`${provider === 'groq' ? '⚡ Groq' : '💎 Gemini'} API Key`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('api_key').setLabel('API Key (gizli tut!)')
            .setPlaceholder(provider === 'groq' ? 'gsk_...' : 'AIza...')
            .setStyle(TextInputStyle.Short).setRequired(true)),
      );
      return interaction.showModal(modal);
    }

    if (action[0] === 'keysil') {
      clearUserKey(interaction.user.id, 'groq');
      clearUserKey(interaction.user.id, 'gemini');
      return interaction.reply({ content: '🗑️ Tüm AI keyleriniz silindi.', ephemeral: true });
    }

    if (action[0] === 'baslat') {
      if (providers.length === 0) {
        return interaction.reply({ content: '❌ Önce API key eklemelisiniz! Yukarıdaki **Groq Key Ekle** veya **Gemini Key Ekle** butonunu kullanın.', ephemeral: true });
      }
      if (tokens.length === 0) return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
      return interaction.reply({
        content: 'Hangi hesap AI olarak konuşacak?',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('aichat:sec')
            .addOptions(tokens.map((t, i) => ({
              label: `${i + 1}. ${t.username || t.label || `Hesap ${i + 1}`}`,
              value: String(i),
              emoji: isAiRunning(userId, i) ? '🟢' : (t.status === 'gecersiz' ? '💔' : '⚪'),
            })))
            .setPlaceholder('🔍 Hesap seç...'),
        )], ephemeral: true,
      });
    }
  },

  async onSelect(interaction, action) {
    if (action[0] === 'durdursec') {
      const idx = Number(interaction.values[0]);
      const ok = stopAiChat(interaction.user.id, idx);
      return interaction.update({ content: ok ? `⏹️ Hesap #${idx + 1} AI chat durduruldu.` : '❌ Görev bulunamadı.', components: [] });
    }

    if (action[0] === 'sec') {
      const idx = Number(interaction.values[0]);
      const modal = new ModalBuilder().setCustomId(`aichat:modal:${idx}`).setTitle('🤖 AI Chat Kurulumu');
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

  async onModalSubmit(interaction, action) {
    // ── API key kaydetme modalı ────────────────────────────────────────
    if (action[0] === 'keymodal') {
      const provider = action[1]; // 'groq' | 'gemini'
      const rawKey = interaction.fields.getTextInputValue('api_key').trim();
      await interaction.deferReply({ ephemeral: true });
      const test = await validateKey(provider, rawKey);
      if (!test.ok) {
        return interaction.editReply({ embeds: [errorEmbed(`❌ **${provider === 'groq' ? 'Groq' : 'Gemini'}** key geçersiz: ${test.reason}\nKey kaydedilmedi.`)] });
      }
      setUserKey(interaction.user.id, provider, rawKey);
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

    const idx = Number(action[0]);
    const channelIds = interaction.fields.getTextInputValue('channels').split(/[\n, ]+/).map(s => s.trim()).filter(s => /^\d{5,}$/.test(s));
    const persona = interaction.fields.getTextInputValue('persona')?.trim() || '';

    if (channelIds.length === 0) return interaction.reply({ embeds: [errorEmbed('Geçerli kanal ID girmediniz!')], ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    try {
      await startAiChat(interaction.user.id, idx, {
        channelIds,
        systemPrompt: persona || 'Sen normal bir Discord kullanıcısısın. Kısa, doğal ve samimi cevap ver. Türkçe konuş.',
      });
      const embed = new EmbedBuilder()
        .setTitle('🤖 AI Chat Başlatıldı')
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
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(`AI chat başlatılamadı: ${err.message}`)] });
    }
  },
};
