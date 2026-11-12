// src/commands/otoreact.js — 🥵 REXAL — Premium Oto React Modülü
// Vault'taki seçili hesap(lar)la hedef mesaja toplu reaksiyon basar.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { loginVaultAccount, destroyClient, sleep, UNICODE_EMOJIS, getGuildCustomEmojis, buildReportLines } from '../utils/selfbotHelpers.js';
import { getTokens } from '../utils/tokenStore.js';
import { COLORS, E, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('Reaction Storm Engine');
const EMOJI_DELAY_MS = 1200;  // emoji arası
const ACCOUNT_DELAY_MS = 2000; // hesaplar arası
const MAX_REACTIONS = 20;      // Discord mesaj başı reaksiyon limiti

// Çalışan işleri takip (aynı mesaja üst üste başlatmayı önlemek için)
const runningJobs = new Set();

async function runReactJob(ownerId, targetMessageUrl, useCustomEmojis) {
  const tokens = getTokens(ownerId);
  const valid = tokens.map((t, i) => ({ t, i })).filter(({ t }) => t.status !== 'gecersiz');

  // Mesaj linkini çöz: https://discord.com/channels/<guild>/<channel>/<message>
  const m = targetMessageUrl.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (!m) throw new Error('Mesaj linki formatı hatalı! Örnek: https://discord.com/channels/GUILD/KANAL/MESAJ');
  const [, guildId, channelId, messageId] = m;

  const reports = [];

  // Emoji havuzunu ilk hesaptan al
  let pool = [...UNICODE_EMOJIS];
  if (useCustomEmojis) {
    const probe = await loginVaultAccount(ownerId, valid[0]?.i ?? 0);
    if (probe.success) {
      const customs = getGuildCustomEmojis(probe.client, guildId);
      if (customs.length > 0) pool = [...customs, ...UNICODE_EMOJIS];
      destroyClient(probe.client);
    }
  }

  for (let a = 0; a < valid.length; a++) {
    const { i } = valid[a];
    if (a > 0) await sleep(ACCOUNT_DELAY_MS);

    const login = await loginVaultAccount(ownerId, i);
    if (!login.success) {
      reports.push({ tokenIndex: i, ok: false, error: login.error });
      continue;
    }

    let reacted = 0;
    try {
      const channel = await login.client.channels.fetch(channelId).catch(() => null);
      if (!channel) throw new Error('Kanal bulunamadı (hesap o sunucuda olmayabilir)');
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (!msg) throw new Error('Mesaj bulunamadı');

      const existing = new Set(msg.reactions.cache.keys());
      for (const emoji of pool) {
        if (reacted >= MAX_REACTIONS || existing.size + reacted >= MAX_REACTIONS) break;
        try {
          await msg.react(emoji);
          reacted++;
          await sleep(EMOJI_DELAY_MS);
        } catch (err) {
          if (/rate|limit/i.test(err.message)) await sleep(2500);
        }
      }
      reports.push({ tokenIndex: i, username: login.username, ok: true, summary: `${reacted} reaksiyon basıldı`, reacted });
    } catch (err) {
      reports.push({ tokenIndex: i, username: login.username, ok: true, error: err.message });
    } finally {
      destroyClient(login.client); // ♾️ sıfır iz — RAM'den temizle
    }
  }

  return reports;
}

export default {
  name: 'otoreact',
  aliases: ['otoreaksiyon', 'autoreact', 'react'],
  description: 'REXAL — Premium Oto React Modülü Kontrol Paneli',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(0xe91e63)
      .setAuthor({ name: `${BRAND.name} • Reaction Storm Engine ${BRAND.version}` })
      .setTitle(`🥵 REXAL — Premium Oto React Modülü`)
      .setDescription([
        UX.header,
        UX.footerLine,
        '',
        statusLine([['🌐', 'Sistem', 'Hazır'], ['😵', 'Mod', 'Toplu Reaksiyon'], ['♾️', 'İz', 'Sıfır']]),
        '',
        section('Oto React Nedir?'),
        `Belirttiğin hedef mesaja, kasadaki selfbot hesapların üzerinden otomatik olarak sunucuya özel emojiler ve popüler unicode emojilerle **toplu reaksiyon** gönderir.`,
        '',
        section('Gelişmiş Özellikler & Güvenlik'),
        `> ${UX.dot2} ${bullet('⏱️', 'Rate-Limit Koruması', 'Emoji arası `1.2sn`, hesap arası `2sn` akıllı gecikme')}`,
        `> ${UX.dot2} ${bullet('🎯', 'Maksimum Reaksiyon', 'Hesap başı maks `20` benzersiz emoji (Discord limiti)')}`,
        `> ${UX.dot2} ${bullet('🧠', 'Akıllı Algılama', 'Sunucunun özel emojilerini tespit eder, boşlukları doldurur')}`,
        `> ${UX.dot2} ${bullet('♾️', 'Sıfır İz', 'İşlem bitince oturumlar kapanır, tokenlar RAM’den silinir')}`,
        '',
        section('Kontrol Paneli'),
        `Aşağıdaki butona tıklayarak reaksiyon basma sihirbazını başlatabilirsin.`,
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('otoreact:baslat').setLabel('Oto React Başlat').setEmoji('🥵').setStyle(ButtonStyle.Success),
      ),
    ];

    await message.reply({ embeds: [embed], components: rows });
  },

  async onButton(interaction) {
    if (runningJobs.has(interaction.user.id)) {
      return interaction.reply({ content: '⚠️ Zaten devam eden bir reaksiyon işiniz var, bitmesini bekleyin.', ephemeral: true });
    }
    if (getTokens(interaction.user.id).length === 0) {
      return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId('otoreact:modal')
      .setTitle('Oto React — Reaksiyon Sihirbazı');

    const msgInput = new TextInputBuilder()
      .setCustomId('message_url')
      .setLabel('Hedef Mesaj Linki')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://discord.com/channels/ID/KANAL/MESAJ')
      .setRequired(true);

    const hesapInput = new TextInputBuilder()
      .setCustomId('hesaplar')
      .setLabel('Hesap numaraları (boş=tümü) ör: 1,2,3')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Boş bırakırsan kasadaki TÜM geçerli hesaplar kullanılır')
      .setRequired(false);

    const customInput = new TextInputBuilder()
      .setCustomId('use_custom')
      .setLabel('Sunucu emojileri kullanılsın mı? (evet/hayır)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('evet — sunucunun özel emojileri de basılır')
      .setValue('evet')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(msgInput),
      new ActionRowBuilder().addComponents(hesapInput),
      new ActionRowBuilder().addComponents(customInput),
    );

    return interaction.showModal(modal);
  },

  async onModalSubmit(interaction) {
    const messageUrl = interaction.fields.getTextInputValue('message_url').trim();
    const hesapRaw = interaction.fields.getTextInputValue('hesaplar').trim();
    const useCustom = interaction.fields.getTextInputValue('use_custom').toLowerCase().includes('evet');

    const tokens = getTokens(interaction.user.id);
    let indices = tokens.map((_, i) => i).filter(i => tokens[i].status !== 'gecersiz');
    if (hesapRaw) {
      const wanted = hesapRaw.split(/[, ]+/).map(x => parseInt(x, 10) - 1).filter(n => !isNaN(n));
      indices = indices.filter(i => wanted.includes(i));
      if (indices.length === 0) {
        return interaction.reply({ embeds: [errorEmbed('Belirtilen hesap numaraları geçersiz!')], ephemeral: true });
      }
    }

    if (!/channels\/\d+\/\d+\/\d+/.test(messageUrl)) {
      return interaction.reply({ embeds: [errorEmbed('Mesaj linki formatı hatalı!\nÖrnek: `https://discord.com/channels/GUILD/KANAL/MESAJ`')], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    runningJobs.add(interaction.user.id);

    try {
      const reports = await runReactJob(interaction.user.id, messageUrl, useCustom);
      const totalReacts = reports.reduce((s, r) => s + (r.reacted || 0), 0);

      const embed = new EmbedBuilder()
        .setTitle(`🥵 Oto React Raporu`)
        .setColor(COLORS.success)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 🎯 **Hedef:** ${messageUrl}`,
          `> 👥 **Hesap Sayısı:** \`${reports.length}\`  🔥 **Toplam Reaksiyon:** \`${totalReacts}\``,
          ``,
          buildReportLines(reports),
          `\`${THIN_DIVIDER}\``,
          `> ♾️ *Tüm oturumlar kapatıldı — sıfır iz bırakıldı.*`,
        ].join('\n'))
        .setFooter(FOOTER())
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(`İşlem hatası: ${err.message}`)] });
    } finally {
      runningJobs.delete(interaction.user.id);
    }
  },
};
