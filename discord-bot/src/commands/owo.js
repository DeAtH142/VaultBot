// src/commands/owo.js — v3.1 (Para & W Transferi Eklendi)
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

// ── Para/W Ayar Parser ────────────────────────────────────────────────
// Format: "para:75,5000,50 w:200,100"
// para: YÜZDE,MIN_BAKİYE,EVERY_HUNT
// w:    EVERY_HUNT,MIKTAR (miktar default 100)
function parseParaAyar(raw) {
  const result = { para: null, w: null };
  if (!raw || !raw.trim()) return result;
  const parts = raw.trim().toLowerCase().split(/\s+/);
  for (const part of parts) {
    if (part.startsWith('para:')) {
      const vals = part.slice(5).split(',').map(Number);
      const [percent, min, every] = vals;
      if (Number.isFinite(percent) && percent > 0 && percent <= 100 &&
          Number.isFinite(every) && every > 0) {
        result.para = {
          percent,
          min: Number.isFinite(min) && min > 0 ? min : 5000,
          every: Math.floor(every),
        };
      }
    } else if (part.startsWith('w:')) {
      const vals = part.slice(2).split(',').map(Number);
      const [every, amount] = vals;
      if (Number.isFinite(every) && every > 0) {
        result.w = {
          every: Math.floor(every),
          amount: Number.isFinite(amount) && amount > 0 ? amount : 100,
        };
      }
    }
  }
  return result;
}

function formatParaAyar(p) {
  if (!p) return '';
  const parts = [];
  if (p.para) parts.push(`para:${p.para.percent},${p.para.min},${p.para.every}`);
  if (p.w) parts.push(`w:${p.w.every},${p.w.amount}`);
  return parts.join(' ');
}

export default {
  name: 'owo',
  aliases: ['owooto', 'owobot'],
  description: 'REXAL ✦ OwO Premium Otomasyon Kontrol Paneli',

  async execute(message) {
    const embed = createMainOwoEmbed();
    const rows = createMainControlRows();
    await message.reply({ embeds: [embed], components: rows });
  },

  // ── Buton Etkileşimleri (DEĞİŞMEDİ) ─────────────────────────────────
  async onButton(interaction, actionParts) {
    const action = actionParts[0];

    if (action === 'sec') {
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
          `> ${E.money} **Para & W Transferi** de aynı formda ayarlanır`,
          `> ${E.dot} \`para:75,5000,50\` → her 50 huntta %75 (bakiye > 5000 ise)`,
          `> ${E.dot} \`w:200,100\` → her 200 huntta 100 cowoncy`,
          `> ${E.dot} Tek form → **tüm hesaplara** otomatik uygulanır`,
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
      const configs = getUserOwoConfigs(interaction.user.id);
      if (configs.length === 0) {
        return interaction.reply({ content: '📭 Şu anda yapılandırılmış OwO otomasyonunuz bulunmuyor.', ephemeral: true });
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
      const configs = getUserOwoConfigs(interaction.user.id);
      if (configs.length === 0) {
        return interaction.reply({ content: '📭 Henüz çalışan veya kaydedilmiş bir OwO otomasyonu yok.', ephemeral: true });
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
        // Para/W özeti
        if (cfg.paraAyar?.para) {
          lines.push(`> 💰 **Para Transferi:** Her \`${cfg.paraAyar.para.every}\` huntta %\`${cfg.paraAyar.para.percent}\` (min \`${cfg.paraAyar.para.min}\`)`);
        }
        if (cfg.paraAyar?.w) {
          lines.push(`> 🎁 **W Send:** Her \`${cfg.paraAyar.w.every}\` huntta \`${cfg.paraAyar.w.amount}\` cowoncy`);
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

  // ── Menü Seçimleri ──────────────────────────────────────────────────
  async onSelect(interaction, actionParts) {
    const action = actionParts[0];

    if (action === 'hesapayari') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      const existing = getOwoConfig(interaction.user.id, tokenIndex) || {};

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

      // 🆕 target_id artık para/w/cookie/clover için ortak alıcı
      const targetInput = new TextInputBuilder()
        .setCustomId('target_id')
        .setLabel('Alıcı DC ID (para/w/cookie/clover)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Varsayılan: ${interaction.user.id} (kendi ID'n)`)
        .setValue(existing.targetId || interaction.user.id)
        .setRequired(false);

      // 🆕 Para/W ayarları
      const paraInput = new TextInputBuilder()
        .setCustomId('para_ayar')
        .setLabel('Para/W (para:%,min,every | w:every,amount)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('para:75,5000,50 veya w:200,100 veya ikisi')
        .setValue(formatParaAyar(existing.paraAyar))
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
        new ActionRowBuilder().addComponents(paraInput),
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

  // ── Modal Yanıtı ─────────────────────────────────────────────────────
  async onModalSubmit(interaction, actionParts) {
    const tokenIndex = parseInt(actionParts[0] === 'modal' ? actionParts[1] : actionParts[0], 10);

    const channelRaw = interaction.fields.getTextInputValue('channel_ids');
    const captchaKey = interaction.fields.getTextInputValue('captcha_key');
    const targetIdRaw = interaction.fields.getTextInputValue('target_id');
    const paraRaw = interaction.fields.getTextInputValue('para_ayar');
    const commandsRaw = interaction.fields.getTextInputValue('commands');

    const channelIds = channelRaw.split(/[, ]+/).filter(Boolean);
    const commands = commandsRaw
      ? commandsRaw.split(',').map(c => c.trim()).filter(Boolean)
      : ['owo hunt', 'owo battle', 'owo pray'];

    // Para/W parse et
    const paraAyar = parseParaAyar(paraRaw);
    const hasPara = paraAyar.para !== null || paraAyar.w !== null;

    // Format geçerli mi?
    if (paraRaw.trim() && !hasPara) {
      return interaction.reply({
        embeds: [errorEmbed(
          '❌ **Geçersiz Para/W formatı!**\n' +
          '> Örnek: `para:75,5000,50` veya `w:200,100` veya `para:75,5000,50 w:200,100`\n' +
          '> Boş bırakırsan transfer **kapalı** olur.'
        )],
        ephemeral: true,
      });
    }

    // Alıcı ID — varsayılan panel sahibi
    const targetId = targetIdRaw.trim() || interaction.user.id;

    await interaction.deferReply({ ephemeral: true });

    // 1) Mevcut hesabı kaydet
    saveOwoConfig(interaction.user.id, tokenIndex, {
      channelIds,
      captchaKey,
      targetId,
      commands,
      enabled: true,
      paraAyar,
    });

    // 2) Para/W ayarı varsa TÜM hesaplara uygula (tek ayar → çoklu bot)
    let syncedCount = 0;
    if (hasPara || targetIdRaw.trim()) {
      const all = getUserOwoConfigs(interaction.user.id);
      for (const other of all) {
        if (other.tokenIndex === tokenIndex) continue;
        const { tokenIndex: _ti, ...otherCfg } = other;
        saveOwoConfig(interaction.user.id, other.tokenIndex, {
          ...otherCfg,
          targetId,
          paraAyar,
        });
        syncedCount++;
      }
    }

    // 3) Mevcut hesabı başlat (mevcut davranış)
    const res = await startOwoAutomation(interaction.user.id, tokenIndex);
    if (!res.success) {
      return interaction.editReply({
        embeds: [errorEmbed(`Otomasyon başlatılamadı:\n\`${res.error}\``)],
      });
    }

    // 4) Rapor
    const paraInfo = paraAyar.para
      ? `> 💰 **Para:** Her \`${paraAyar.para.every}\` huntta bakiye > \`${paraAyar.para.min}\` ise %\`${paraAyar.para.percent}\` gönderir`
      : '';
    const wInfo = paraAyar.w
      ? `> 🎁 **W Send:** Her \`${paraAyar.w.every}\` huntta \`${paraAyar.w.amount}\` cowoncy gönderir`
      : '';
    const targetInfo = `> 🎯 **Alıcı:** \`${targetId}\` (<@${targetId}>)`;

    const embed = new EmbedBuilder()
      .setTitle(`${E.lightning} OwO Otomasyonu Başlatıldı!`)
      .setColor(COLORS.success)
      .setDescription([
        `\`${DIVIDER}\``,
        `> 👤 **Hesap:** \`${res.username}\``,
        `> 📺 **Kanallar:** \`${channelIds.join(', ')}\``,
        `> 🎮 **Komutlar:** \`${commands.join(', ')}\``,
        `> 🕐️ **Anti-Ban:** \`Aktif (16-21s Jitter)\``,
        `> 🎯 **Oto-Quest:** \`Aktif\` | 💎 **Oto-Gem:** \`Aktif\``,
        `> ${E.money} **Akıllı Sell:** \`Aktif\``,
        '',
        ...(paraInfo || wInfo ? [`${E.money} **Para & W Transferi**`, paraInfo, wInfo, targetInfo, ''] : []),
        ...(syncedCount > 0 ? [`> 🔄 **${syncedCount}** diğer hesaba da uygulandı (otomatik restart için panelden "Yeniden Başlat")`, ''] : []),
        `${E.chart} **Kazanç takibi başladı!** Durdurduğunda oturum raporu otomatik gönderilecek.`,
        `\`${DIVIDER}\``,
      ].filter(Boolean).join('\n'))
      .setFooter({ text: 'REXAL OwO Premium v3.1 | Ultra Farm Engine' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

// ── Ana Görsel Embed (v3.1 — Para/W bilgisi eklendi) ───────────────
export function createMainOwoEmbed() {
  return new EmbedBuilder()
    .setTitle(`${E.bow}  REXAL ✦ OwO PREMIUM OTOMASYON v3.1`)
    .setColor(0x7289da)
    .setDescription([
      `\`${DIVIDER}\``,
      `> ${E.rocket} **Durum:** \`AKTİF\`  ${E.gear} **Motor:** \`PRO v3\`  ${E.fire} **Mod:** \`Ultra Farm\``,

      `${E.brain} **NE YAPAR?**`,
      'Tokenlerini OwO ekonomisinde **tam otomatik farm** moduna sokar.',
      'Hunt, Battle, Quest, Gem, Sell, Daily — hepsi insan simülasyonuyla.',

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

      `${E.money} **PARA & W TRANSFERİ** (YENİ)`,
      `> ${E.dot} \`para:75,5000,50\` → her 50 huntta %75 (bakiye > 5000 ise)`,
      `> ${E.dot} \`w:200,100\` → her 200 huntta 100 cowoncy`,
      `> ${E.dot} Tek form ile **tüm hesaplara** otomatik uygulanır`,
      `> ${E.dot} Alıcı: senin DC ID'n (varsayılan)`,

      `\`${DIVIDER}\``,

      `${E.target} **Kontrol paneli aşağıda ↓**  *(Hesap eklemek için \`!hesaplarim\`)*`,
    ].join('\n'))
    .setFooter({ text: 'REXAL SYSTEMS | Ultra Premium Engine v3.1' })
    .setTimestamp();
}

// ── Ana Kontrol Butonları (DEĞİŞMEDİ) ──────────────────────────────
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
