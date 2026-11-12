// src/commands/owo.js
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  saveOwoConfig,
  getOwoConfig,
  getUserOwoConfigs,
  deleteOwoConfig,
} from '../utils/owoStore.js';
import {
  startOwoAutomation,
  stopOwoAutomation,
  isOwoRunning,
  getWorkerStats,
  getLastSessionReport,
} from '../utils/owoRunner.js';
import { COLORS, E, DIVIDER, errorEmbed } from '../utils/embeds.js';

export default {
  name: 'owo',
  aliases: ['owooto', 'owobot'],
  description: 'REXAL ✦ OwO Premium Otomasyon Kontrol Paneli',

  async execute(message) {
    const embed = createMainOwoEmbed();
    const rows = createMainControlRows();
    await message.reply({ embeds: [embed], components: rows });
  },

  // ── Buton Etkileşimleri ──────────────────────────────────────────────────
  async onButton(interaction, actionParts) {
    const action = actionParts[0];

    if (action === 'sec') {
      // Havuzdan hesap seçme menüsü
      const tokens = getTokens(interaction.user.id);
      if (tokens.length === 0) {
        return interaction.reply({
          content: '📦 Havuzunuzda hiç hesap/token kayıtlı değil! Önce `!hesaplarim` panelinden `!tokenekle` ile ekleyin.',
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`👤 Hesap Seçimi (${tokens.length} hesap bulundu)`)
        .setColor(0x3498db)
        .setDescription([
          `> ${E.check} **Çalışan hesaplar menüde işaretli**`,
          '> Bir hesap seçince ayar ekranı (form) açılacak.',
          '',
          DIVIDER,
        ].join('\n'));

      const options = tokens.map((t, i) => {
        const running = isOwoRunning(interaction.user.id, i);
        return {
          label: t.label || `Hesap ${i + 1}`,
          description: running ? '✅ Zaten çalışıyor' : '⭕ Hazır (Durduruldu)',
          value: String(i),
          emoji: running ? '▶️' : '💤',
        };
      });

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('owo:hesapayari')
          .setPlaceholder("OwO Premium'da çalıştırmak istediğin hesabı seç...")
          .addOptions(options),
      );

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    } else if (action === 'kaldir') {
      // Otomasyonu durdurma menüsü
      const configs = getUserOwoConfigs(interaction.user.id);
      if (configs.length === 0) {
        return interaction.reply({
          content: '📭 Şu anda yapılandırılmış OwO otomasyonunuz bulunmuyor.',
          ephemeral: true,
        });
      }

      const options = configs.map((cfg) => {
        const running = isOwoRunning(interaction.user.id, cfg.tokenIndex);
        return {
          label: `Hesap #${cfg.tokenIndex + 1}`,
          description: running ? '⏳ Çalışıyor — Durdurmak için seç' : '⭕ Zaten durmuş',
          value: String(cfg.tokenIndex),
          emoji: '🛑',
        };
      });

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('owo:kaldironay')
          .setPlaceholder('Otomasyondan kaldırmak istediğin hesabı seç...')
          .addOptions(options),
      );

      await interaction.reply({
        content: '🛑 **Kaldırmak veya durdurmak istediğin hesabı seç:**',
        components: [row],
        ephemeral: true,
      });
    } else if (action === 'rapor') {
      // Durum Raporu
      const configs = getUserOwoConfigs(interaction.user.id);
      if (configs.length === 0) {
        return interaction.reply({
          content: '📭 Henüz çalışan veya kaydedilmiş bir OwO otomasyonu yok.',
          ephemeral: true,
        });
      }

      const reportLines = configs.map((cfg) => {
        const running = isOwoRunning(interaction.user.id, cfg.tokenIndex);
        const live = running ? getWorkerStats(interaction.user.id, cfg.tokenIndex) : null;
        const last = !running ? getLastSessionReport(interaction.user.id, cfg.tokenIndex) : null;

        const lines = [
          `> ${running ? '✅' : '⭕'} **Hesap #${cfg.tokenIndex + 1}** — ${running ? 'Çalışıyor' : 'Durduruldu'}`,
          `> 📺 Kanallar: \`${cfg.channelIds.join(', ')}\``,
        ];

        if (live) {
          lines.push(
            `> 🏹 Hunt: \`${live.hunts}\` | ⚔️ Battle: \`${live.battles}\` | 🐾 Hayvan: \`${live.animalsCaught}\``,
            `> 🎯 Quest: \`${live.questsGrabbed}\` | 💎 Gem: \`${live.gemsEquipped}\` | 💰 Sell: \`${live.sells}\``,
            `> 🐮 Cowoncy Değişim: \`${live.cowoncyDelta === null ? '?' : (live.cowoncyDelta >= 0 ? '+' : '') + live.cowoncyDelta.toLocaleString('tr-TR')}\``,
          );
          if (live.isSleeping) lines.push('> 😴 *Şu anda Auto-Sleep modunda dinleniyor...*');
        } else if (last) {
          const delta = last.cowoncyDelta;
          lines.push(
            `> Son oturum: \`${last.durationText}\` | 🏹 Hunt: \`${last.hunts}\` | 🐾 Hayvan: \`${last.animalsCaught}\``,
            `> 💰 Cowoncy: \`${delta === null ? '?' : (delta >= 0 ? '+' : '') + delta.toLocaleString('tr-TR')}\``,
          );
        }

        return lines.join('\n');
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('📊 OwO Otomasyon Durum Raporu')
        .setColor(COLORS.vault)
        .setDescription(reportLines)
        .setFooter({ text: 'REXAL OwO Premium | Canlı İstatistikler' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (action === 'restart') {
      // Tümünü Yeniden Başlat (sessiz: rapor üretmeden)
      // deferReply EN BAŞTA olmalı — selfbot login'ler 3sn interaction süresini öldürür
      await interaction.deferReply({ ephemeral: true });
      const configs = getUserOwoConfigs(interaction.user.id);

      let started = 0;
      for (const cfg of configs) {
        cfg.enabled = true;
        saveOwoConfig(interaction.user.id, cfg.tokenIndex, cfg);
        const res = await startOwoAutomation(interaction.user.id, cfg.tokenIndex);
        if (res.success) started++;
      }

      await interaction.editReply({
        content: `🔄 **${started} adet** hesap otomasyonu başarıyla yeniden başlatıldı!`,
      });
    }
  },

  // ── Menü Seçimleri ───────────────────────────────────────────────────────
  async onSelect(interaction, actionParts) {
    const action = actionParts[0];

    if (action === 'hesapayari') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      const existing = getOwoConfig(interaction.user.id, tokenIndex) || {};

      // POPUP FORM (Modal) Aç
      const modal = new ModalBuilder()
        .setCustomId(`owo:modal:${tokenIndex}`)
        .setTitle('OwO Premium Ayarları');

      const channelInput = new TextInputBuilder()
        .setCustomId('channel_ids')
        .setLabel('Kanal ID (virgülle ayırarak birden fazla)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('123456789012345678, 987654321098765432')
        .setValue(existing.channelIds ? existing.channelIds.join(', ') : '')
        .setRequired(true);

      const captchaInput = new TextInputBuilder()
        .setCustomId('captcha_key')
        .setLabel('2Captcha API Key (opsiyonel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Boş bırakırsan manuel çözmen gerekir')
        .setValue(existing.captchaKey || '')
        .setRequired(false);

      const targetInput = new TextInputBuilder()
        .setCustomId('target_id')
        .setLabel('Hedef ID (cookie/clover için, opsiyonel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Boş bırakılabilir')
        .setValue(existing.targetId || '')
        .setRequired(false);

      const commandsInput = new TextInputBuilder()
        .setCustomId('commands')
        .setLabel('Komutlar (virgülle, opsiyonel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('owo hunt, owo battle, owo pray, owo daily')
        .setValue(existing.commands ? existing.commands.join(', ') : 'owo hunt, owo battle, owo pray')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(channelInput),
        new ActionRowBuilder().addComponents(captchaInput),
        new ActionRowBuilder().addComponents(targetInput),
        new ActionRowBuilder().addComponents(commandsInput),
      );

      await interaction.showModal(modal);
    } else if (action === 'kaldironay') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      stopOwoAutomation(interaction.user.id, tokenIndex);
      deleteOwoConfig(interaction.user.id, tokenIndex);

      await interaction.update({
        content: `✅ Hesap #${tokenIndex + 1} otomasyondan kaldırıldı ve durduruldu.`,
        components: [],
      });
    }
  },

  // ── Modal (Form) Yanıtı ──────────────────────────────────────────────────
  async onModalSubmit(interaction, actionParts) {
    const tokenIndex = parseInt(actionParts[0] === 'modal' ? actionParts[1] : actionParts[0], 10);

    const channelRaw = interaction.fields.getTextInputValue('channel_ids');
    const captchaKey = interaction.fields.getTextInputValue('captcha_key');
    const targetId = interaction.fields.getTextInputValue('target_id');
    const commandsRaw = interaction.fields.getTextInputValue('commands');

    const channelIds = channelRaw.split(/[, ]+/).filter(Boolean);
    const commands = commandsRaw
      ? commandsRaw.split(',').map(c => c.trim()).filter(Boolean)
      : ['owo hunt', 'owo battle', 'owo pray'];

    await interaction.deferReply({ ephemeral: true });

    // Ayarları kaydet
    saveOwoConfig(interaction.user.id, tokenIndex, {
      channelIds,
      captchaKey,
      targetId,
      commands,
      enabled: true,
    });

    // Otomasyonu başlat
    const res = await startOwoAutomation(interaction.user.id, tokenIndex);

    if (!res.success) {
      return interaction.editReply({
        embeds: [errorEmbed(`Otomasyon başlatılamadı:\n\`${res.error}\``)],
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`${E.lightning} OwO Otomasyonu Başlatıldı!`)
      .setColor(COLORS.success)
      .setDescription([
        `\`${DIVIDER}\``,
        `> 👤 **Hesap:** \`${res.username}\``,
        `> 📺 **Kanallar:** \`${channelIds.join(', ')}\``,
        `> 🎮 **Komutlar:** \`${commands.join(', ')}\``,
        `> 🕐️ **Anti-Ban Simülasyonu:** \`Aktif (16-21s Jitter)\``,
        `> 🎯 **Oto-Quest:** \`Aktif (Saatlik)\`  💎 **Oto-Gem:** \`Aktif\``,
        `> ${E.money} **Akıllı Sell:** \`Aktif (Bakiye Düştünce)\``,
        '',
        `${E.chart} **Kazanç takibi başladı!** Durdurduğunda oturum raporu otomatik gönderilecek.`,
        `\`${DIVIDER}\``,
      ].join('\n'))
      .setFooter({ text: 'REXAL OwO Premium v3 | Ultra Farm Engine' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

// ── Ana Görsel Embed (ULTRA PREMIUM) ──────────────────────────────────────
export function createMainOwoEmbed() {
  return new EmbedBuilder()
    .setTitle(`${E.bow}  REXAL ✦ OwO PREMIUM OTOMASYON v3.0`)
    .setColor(0x7289da)
    .setDescription([
      `\`${DIVIDER}\``,
      `> ${E.rocket} **Durum:** \`AKTİF\`  ${E.gear} **Motor:** \`PRO v3\`  ${E.fire} **Mod:** \`Ultra Farm\``,

      `${E.brain} **NE YAPAR?**`,
      'Tokenlerini OwO ekonomisinde **tam otomatik farm** moduna sokar.',
      'Hunt, Battle, Quest, Gem, Sell, Daily — hepsi insan simülasyonuyla.',
      '',
      `${E.sparkle} **PRO ÖZELLİK SETİ**`,
      `> ${E.bow} **Tam Otomasyon** — Hunt, Battle, Cookie, Pray, Daily`,
      '> 🔍 **Oto-Quest** — Otomatik quest alma ve takibi',
      '> 💎 **Oto-Gem** — Envanterden en iyi taşları otomatik kuşanır',
      `> ${E.money} **Akıllı Sell** — Para bitince otomatik \`owo sell all\``,
      '> 🔁 **Kanal Rotasyonu** — Birden fazla kanal arasında dolaşır',
      '> 😴 **Auto-Sleep** — İnsan simülasyonu; periyodik dinlenme',
      '> 🤖 **2Captcha Entegrasyonu** — Captchaları otomatik çözer',
      '> ♻️ **Reboot Recovery** — Bot kapansa bile kaldığı yerden devam eder',
      `> ${E.chart} **Canlı İstatistik** — Hunt, hayvan, quest, gem, cowoncy takibi`,
      '> 📊 **Durunca Kazanç Raporu** — Oturum özeti otomatik gönderilir',

      `\`${DIVIDER}\``,

      `${E.target} **Kontrol paneli aşağıda ↓**  *(Hesap eklemek için \`!hesaplarim\`)*`,
    ].join('\n'))
    .setFooter({ text: 'REXAL SYSTEMS | Ultra Premium Engine' })
    .setTimestamp();
}

export function createMainControlRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('owo:sec')
      .setLabel('Havuzdan Hesap Seç')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('owo:kaldir')
      .setLabel('Hesap Kaldır')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('owo:rapor')
      .setLabel('Durum Raporu')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('owo:restart')
      .setLabel('Tümünü Yeniden Başlat')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}
