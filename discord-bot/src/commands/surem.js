// src/commands/surem.js — ⏱️ REXAL Süre & Rol İlerlemesi Paneli
//
//   !surem           → kişisel ilerleme kartı
//   !surem panel     → detaylı panel (butonlu)
//   !surem roller    → 10 aşamalı rol yol haritası
//   !surem kurallar  → sistemin nasıl çalıştığı
import { EmbedBuilder } from 'discord.js';
import { getUserProgress, fmtHours, getPendingAwards, resolveAward } from '../utils/playtimeStore.js';
import { processAwards } from '../utils/awardQueue.js';
import { roleBotStatus, isRoleBotEnabled, getTierRoleMap } from '../utils/roleAwarder.js';

import {
  createProgressEmbed,
  createTierRoadmapEmbed,
  createPlaytimeHelpEmbed,
  createProgressComponents,
  proBar,
  COLORS,
  BRAND,
  E,
  UX,
  DIVIDER,
} from '../utils/embeds.js';



function statusSummary(progress) {
  return `${E.clock} **${fmtHours(progress.totalSec)}** sayıldı · ${E.trophy} **${progress.tierIndex}/${progress.tierCount}** rol`;
}

export default {
  name: 'surem',
  aliases: ['sürem', 'surem', 'süre', 'playtime', 'ilerleme', 'puanim'],
  description: 'Süre & rol ilerleme sistemi',

  async execute(message, args = []) {
    const sub = (args[0] || '').toLowerCase();
    const user = message.author;
    const progress = getUserProgress(user.id);

    if (sub === 'yardim' || sub === 'help') {
      return message.reply({ embeds: [createPlaytimeHelpEmbed()] });
    }

    if (sub === 'roller' || sub === 'tiers' || sub === 'roadmap') {
      return message.reply({ embeds: [createTierRoadmapEmbed(user, progress)] });
    }

    if (sub === 'kurallar' || sub === 'rules') {
      const embed = new EmbedBuilder()
        .setAuthor({ name: `${BRAND.name} • Kurallar`, iconURL: brandIcon(user) })
        .setColor(COLORS.info)
        .setTitle(`${E.shield}  SÜRE SİSTEMİ — KURALLAR`)
        .setDescription([
          UX.header,
          `${bullet(E.check, 'Tek Sayaç', 'Aynı anda birden fazla uygun sistem açıksa zaman aralığı **tek kez** sayılır.')}`,
          `${bullet(E.check, 'Gerçek Başlangıç', 'Süre, modül gerçekten çalışmaya başladığı an açılır; hata varsa açılmaz.')}`,
          `${bullet(E.check, 'Gerçek Bitiş', 'Durdurma başarılıysa oturum kapanır ve süre korunur.')}`,
          `${bullet(E.check, 'Birleşim Örneği', '09:00–15:00 + 12:00–17:00 → **8 saat** (11 değil, 6 de değil).')}`,
          `${bullet(E.warning, 'Bot Kapalı = Süre Yok', 'Canlılık damgası (lastSeen) ile offline süre asla eklenmez.')}`,
          `${bullet(E.crown, 'Eşik Sıfırlaması', 'Bir rolün eşiği dolunca sayaç sıfırdan başlar; toplam süre kalıcıdır.')}`,
          `> ${E.info} Toplam hedef: \`196 saat\` (10 rol)`,
        ].join('\n'))
        .setFooter(BRAND.footer('REXAL Time Engine'))
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'rolver' || sub === 'award' || sub === 'rolever') {
      const pending = getPendingAwards(user.id);
      if (pending.length === 0) {
        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.info)
            .setTitle(`${E.check} Bekleyen rol yok`)
            .setDescription(`Sıradaki rol için kalan süren: \`${progress.remainingText}\``)
            .setFooter(BRAND.footer('REXAL Time Engine'))],
        });
      }

      if (!isRoleBotEnabled()) {
        return message.reply({
          embeds: [new EmbedBuilder()
            .setColor(COLORS.danger)
            .setTitle(`${E.warning} Rol botu yapılandırılmamış`)
            .setDescription([
              `Kazanımların kaydedildi ama rol verilemiyor:`,
              `> \`DISCORD_TOKEN\` eksik — rol dağıtımı aynı bot ile yapılır.`,
              '',
              '**GitHub → Settings → Secrets → Actions:**',
              '```',
              'ROLE_SERVER_ID = sunucu ID',
              'ROLE_TIER_IDS  = 1:ROL,2:ROL,...,10:ROL',
              '```',
              '> 1. discord.com/developers → New Application → Bot → Reset Token',
              `> 2. **Manage Roles** yetkisiyle davet et`,
              `> 3. Bot rolünü, verilecek rollerin ÜSTÜNE taşı`,
              `> 4. \`ROLE_TIER_IDS\`: 1 = **5 saatlik** rol, 10 = **35 saatlik** rol`,
              '',
              `Bekleyen: ${pending.map(p => `tier ${p.tier}`).join(', ')}`,
            ].join('\n'))
            .setFooter(BRAND.footer('REXAL Role Engine'))],
        });
      }

      const wait = await message.reply({ content: '🎖️ Roller veriliyor...' });
      const results = await processAwards(user.id, pending, (uid, tier, res) => {
        try { resolveAward(uid, tier, res); } catch { }
      });

      const lines = results.map(r => r.awarded
        ? `> ${E.check} **Tier ${r.tier}** — rol verildi${r.dm ? '' : ' (DM gönderilemedi)'}`
        : r.alreadyHad
          ? `> ${E.check} **Tier ${r.tier}** — rol zaten vardı`
          : `> ${E.cross} **Tier ${r.tier}** — \`${r.error}\``);

      const okCount = results.filter(r => r.success).length;
      return wait.edit({
        embeds: [new EmbedBuilder()
          .setColor(okCount > 0 ? COLORS.success : COLORS.danger)
          .setTitle(`${okCount > 0 ? E.trophy : E.warning} Rol Dağıtım Raporu`)
          .setDescription([
            `\`${DIVIDER}\``,
            ...lines,
            `\`${DIVIDER}\``,
            '',
            okCount > 0
              ? `> ${E.sparkle} Profiline bir göz at — yeni rolün orada!`
              : `> ${E.info} Ayarları kontrol et: \`!surem rolver\` yeniden anlatır.`,
          ].join('\n'))
          .setFooter(BRAND.footer('REXAL Role Engine'))
          .setTimestamp()],
      });
    }

    if (sub === 'canli' || sub === 'hesap' || sub === 'live') {
      const now = Date.now();
      const lines = progress.liveSessions.length === 0
        ? ['> `⚫` *Şu anda süre sayılan sistem yok.*']
        : progress.liveSessions.map(s => {
          const [src, idx] = s.key.split(':');
          return `> ${sourceEmoji(src)} **${sourceLabel(src)} #${Number(idx) + 1}** · \`${fmtHHMMSS((now - s.start) / 1000)}\``;
        });
      const embed = new EmbedBuilder()
        .setAuthor({ name: `${BRAND.name} • Canlı Sistemler`, iconURL: brandIcon(user) })
        .setColor(progress.live ? COLORS.success : COLORS.gray)
        .setTitle(`${E.lightning}  CANLI SÜRE OTURUMLARI (${progress.liveSessions.length})`)
        .setDescription([
          UX.header,
          `> ${E.online} **Blok başlangıcı:** ${progress.live ? `\`${new Date(Math.min(...progress.liveSessions.map(s => s.start))).toLocaleTimeString('tr-TR')}\`` : '*Beklemede*'}`,
          UX.footerLine,
          '',
          ...lines,
          '',
          `${E.chart} **Toplanan:** \`${fmtHours(progress.cumulativeSec)}\` / \`${progress.requiredText}\` ${proBar(progress.progressPct, 10)}`,
          '',
          `*Detaylı panel:* \`!surem panel\``,
        ].join('\n'))
        .setFooter(BRAND.footer('REXAL Time Engine'))
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // Varsayılan / panel
    const embed = createProgressEmbed(user, progress);
    const components = sub === 'panel' || sub === 'p'
      ? createProgressComponents()
      : [];

    const reply = await message.reply({ embeds: [embed], components });
    if (components.length === 0) {
      await reply.react('⏱️').catch(() => { });
    }
  },

  // ── Panel butonları ─────────────────────────────────────────────────────
  async onButton(interaction, parts) {
    const action = parts[0];
    const user = interaction.user;
    const progress = getUserProgress(user.id);

    if (action === 'refresh') {
      return interaction.update({
        embeds: [createProgressEmbed(user, progress)],
        components: createProgressComponents(),
      });
    }

    if (action === 'roller') {
      return interaction.reply({ embeds: [createTierRoadmapEmbed(user, progress)], ephemeral: true });
    }

    if (action === 'canli') {
      const now = Date.now();
      const lines = progress.liveSessions.length === 0
        ? ['> `⚫` *Şu anda süre sayılan sistem yok.*']
        : progress.liveSessions.map(s => {
          const [src, idx] = s.key.split(':');
          return `> ${sourceEmoji(src)} **${sourceLabel(src)} #${Number(idx) + 1}** · \`${fmtHHMMSS((now - s.start) / 1000)}\``;
        });

      const embed = new EmbedBuilder()
        .setAuthor({ name: `${BRAND.name} • Canlı Sistemler`, iconURL: brandIcon(user) })
        .setColor(progress.live ? COLORS.success : COLORS.gray)
        .setTitle(`${E.lightning}  CANLI SÜRE OTURUMLARI`)
        .setDescription([
          UX.header,
          ...lines,
          UX.footerLine,
          '',
          `${statusSummary(progress)}`,
        ].join('\n'))
        .setFooter(BRAND.footer('REXAL Time Engine'))
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (action === 'kurallar') {
      return interaction.reply({ embeds: [createPlaytimeHelpEmbed()], ephemeral: true });
    }
  },
};

// ── küçük yardımcılar ────────────────────────────────────────────────────
function brandIcon(user) {
  try { return user.displayAvatarURL({ dynamic: true }); } catch { return undefined; }
}

function sourceEmoji(src) {
  return {
    online: '🟢', owo: '⚔️', autotyper: '⌨️', voiceafk: '🔊', mobil: '📱',
    aichat: '🤖', voicerec: '🎙️', spotify: '🎵', otomesaj: '📢', senaryo: '🎬',
  }[src] || '🔹';
}

function sourceLabel(src) {
  return {
    online: 'Online Tutma', owo: 'OwO', autotyper: 'AutoTyper', voiceafk: 'Ses AFK',
    mobil: 'Mobil Status', aichat: 'AI Chat', voicerec: 'Ses Kayıt', spotify: 'Spotify',
    otomesaj: 'Oto Mesaj', senaryo: 'Senaryo',
  }[src] || src;
}

function fmtHHMMSS(sec) {
  const t = Math.max(0, Math.floor(sec));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
}
