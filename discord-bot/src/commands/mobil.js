
// src/commands/mobil.js 📱 REXAL Mobil Status Modülü
// Hesapları Android istemcisi olarak bağlar — profilde mobil tik (📱) görünür.
// Panel: adım adım kılavuz + hızlı kurulum akışı + canlı durum raporu.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  startMobileStatus, stopMobileStatus, isMobileStatusRunning,
  getUserMobileStatusSessions, getMobileStatusStats,
} from '../utils/mobileStatusRunner.js';
import { COLORS, errorEmbed, BRAND, UX, section, bullet, statusLine, THIN_DIVIDER } from '../utils/embeds.js';
import { markStart, markStop } from '../utils/playtimeHooks.js';

const FOOTER = () => BRAND.footer('Mobil Status Engine');

const STATUS_OPTIONS = [
  { label: 'Çevrimiçi (Online)', value: 'online', emoji: '🟢', description: 'Yeşil nokta + mobil tik' },
  { label: 'Boşta (Idle)', value: 'bosta', emoji: '🌙', description: 'Ay ikonu + mobil tik' },
  { label: 'Rahatsız Etme (DND)', value: 'rahatsiz', emoji: '🔴', description: 'Kırmızı ikon + mobil tik' },
  { label: 'Görünmez (Invisible)', value: 'gorunmez', emoji: '👻', description: 'Gri ikon + mobil tik (offline görünür)' },
];

const STATUS_ICONS = { online: '🟢', bosta: '🌙', rahatsiz: '🔴', gorunmez: '👻' };

// ── Ana panel embed'i (kapsamlı kılavuz içerir) ─────────────────────────────
function buildMainEmbed(userId) {
  const tokens = getTokens(userId);
  const sessions = getUserMobileStatusSessions(userId);
  const active = sessions.filter(s => isMobileStatusRunning(userId, s.tokenIndex));

  const aktifLines = active.length
    ? active.map((s) => {
      const t = tokens[s.tokenIndex];
      const icon = STATUS_ICONS[s.targetStatus] || '❓';
      const min = Math.floor((Date.now() - new Date(s.updatedAt || Date.now())) / 60000);
      return `> 📱 **${t?.label || t?.username || `Hesap #${s.tokenIndex + 1}`}** ${icon} \`${s.targetStatus}\`${s.customStatus ? ` — 💬 *"${s.customStatus}"*` : ''}`;
    }).join('\n')
    : '> ⚫ *Aktif mobil oturum yok — aşağıdaki akışla 30 saniyede bağlanır!*';

  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setAuthor({ name: `${BRAND.name} ⬢ Mobil Status Engine ${BRAND.version}` })
    .setDescription([
      UX.header,
      `## 📱 REXAL Mobil Status Modülü`,
      `*${UX.arrow} Hesaplarının profilinde **mobil tik** görünür — gerçekte telefonda gibi*`,
      UX.footerLine,
      '',
      statusLine([['📲', 'Platform', 'Android'], ['🔒', 'Algı', 'Gerçekçi'], ['♻️', 'Recovery', 'Aktif'], ['💓', 'Keep-Alive', '5dk']]),
      '',
      section('Bu Ne İşe Yarar?'),
      'Normal bot/farm hesapları **masaüstünden** bağlı görünür — bu büyük bir şüphe işaretidir.',
      'Bu modül hesabı Discord\'un **Android uygulaması** gibi bağlar: profilinde yeşil mobil tik çıkar,',
      'herkes "adam telefonda bakıyor" der. Farm algısını ciddi düşürür.',
      '',
      section('📘 NASIL KULLANILIR? (30 saniyelik kurulum)'),
      `> ${UX.dot2} **ADIM 1** — Önce kasan hesap olsun: \`!hesaplarim\` yaz → "Token Ekle" → token yapıştır.`,
      `> ${UX.dot2} **ADIM 2** — Aşağıdaki **🚀 Hızlı Kurulum** butonuna bas.`,
      `> ${UX.dot2} **ADIM 3** — Listeden hangi hesabı mobil bağlayacaksan onu seç.`,
      `> ${UX.dot2} **ADIM 4** — Durum tipi seç: 🟢 Online / 🌙 Boşta / 🔴 DND / 👻 Görünmez.`,
      `> ${UX.dot2} **ADIM 5** — İstersen bir **durum yazısı** gir (örn: *"uykudayım"*), istemezsen boş bırak.`,
      `> ${UX.dot2} **ADIM 6** — Bitti! Panel onayı gelir, profilinde 📱 tik belirir.`,
      '',
      `💡 *İpucu:* Aynı hesabı tekrar bağlarsan üzerine yazar — önce durdurmene gerek yok.`,
      `💡 *İpucu:* Bot restart olsa bile oturumlar otomatik geri gelir (Reboot Recovery).`,
      `💡 *İpucu:* Bağlantı koparsa bot kendi kendine yeniden bağlanmayı dener (5 denemeye kadar).`,
      '',
      section('📱 Aktif Mobil Oturumlar'),
      aktifLines,
    ].join('\n'))
    .setFooter(FOOTER())
    .setTimestamp();
}

const MAIN_BUTTONS = () => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mobil:sec').setLabel('Hızlı Kurulum').setEmoji('🚀').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('mobil:durdur').setLabel('Oturum Kapat').setEmoji('🔌').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('mobil:rapor').setLabel('Detaylı Rapor').setEmoji('📊').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('mobil:kilavuz').setLabel('Yardım / SSS').setEmoji('❓').setStyle(ButtonStyle.Secondary),
  ),
];

export default {
  name: 'mobil',
  aliases: ['mobilestatus', 'mobilstatus', 'mobiltik'],
  description: 'REXAL 📱 Mobil Status Modülü Kontrol Paneli',

  async execute(message) {
    await message.reply({ embeds: [buildMainEmbed(message.author.id)], components: MAIN_BUTTONS() });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;
    const tokens = getTokens(userId);

    // ── Yardım / SSS ──
    if (action === 'kilavuz') {
      const embed = new EmbedBuilder()
        .setTitle('❓ Mobil Status — Yardım & SSS')
        .setColor(COLORS.info)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          section('Neden mobil tik görünmüyor?'),
          '> • Hesap **gerçekten mobil** gözükmesi 1-2 dk sürebilir, bekle.',
          '> • Profiline **başka bir hesaptan** bak — kendi istemcinden eski görünüm cache\'lenir.',
          '> • Hesap birden fazla yerde açıksa (masaüstü vs) en son bağlanan platform kazanır.',
          '',
          section('"An invalid token was provided" hatası'),
          '> Kasadaki token geçersiz/ölmüş. `!hesaplarim` → Denetle ile kontrol et,',
          '> geçersizse yeni token ekle.',
          '',
          section('"Mobil giriş zaman aşımı" hatası'),
          '> Discord bağlantısı yavaş. Tekrar dene; olmuyorsa internetini kontrol et.',
          '',
          section('Mobil tik yanında durum yazısı görünmüyor'),
          '> Kurulumda durum yazısını boş bırakmışsındır. `Hızlı Kurulum` ile hesabı',
          '> yeniden seç, bu kez yazıyı doldur — üzerine yazar, önce durdurmana gerek yok.',
          '',
          section('Birden fazla hesabı aynı anda mobil yapmak'),
          '> Mümkün! `Hızlı Kurulum` akışını her hesap için tekrarla.',
          '> `Detaylı Rapor` ile hepsini tek listede görürsün.',
          '',
          section('Mobil oturumu tamamen kapatmak'),
          '> `🔌 Oturum Kapat` → hesabı seç. Böylece hesap tamamen çevrimdışı olur,',
          '> artık mobil tik görünmez.',
          '',
          section('Veriler güvende mi?'),
          '> Tokenler AES-256-GCM ile şifreli, panel sadece sana özel. Kasa DM\'ne gelir.',
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── Hızlı kurulum: hesap seç ──
    if (action === 'sec') {
      if (tokens.length === 0) {
        return interaction.reply({
          content: '📦 Kasanızda hesap yok!\n\n**Nasıl eklersin?**\n> 1️⃣ `!hesaplarim` yaz\n> 2️⃣ "✨ Token Ekle" butonuna bas\n> 3️⃣ Tokenini yapıştır → 30 saniye sonra buraya geri dön!',
          ephemeral: true,
        });
      }
      const options = tokens.slice(0, 25).map((t, i) => ({
        label: `${i + 1}. ${t.label || t.username || `Hesap ${i + 1}`}`.slice(0, 100),
        description: isMobileStatusRunning(userId, i) ? '✅ Mobil oturum aktif — yeniden seçersen üzerine yazar' : '💤 Bağlı değil',
        value: String(i),
        emoji: isMobileStatusRunning(userId, i) ? '📱' : '💤',
      }));
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mobil:statusmodal')
          .setPlaceholder('📱 Mobil bağlamak istediğin hesabı seç...')
          .addOptions(options),
      );
      return interaction.reply({ content: '**🚀 ADIM 1/3 — Hesap seç:**', components: [row], ephemeral: true });
    }

    // ── Oturum kapat ──
    if (action === 'durdur') {
      const sessions = getUserMobileStatusSessions(userId).filter(s => isMobileStatusRunning(userId, s.tokenIndex));
      if (sessions.length === 0) {
        return interaction.reply({ content: '📭 Aktif mobil oturumunuz yok. Önce `🚀 Hızlı Kurulum` ile bağlan.', ephemeral: true });
      }
      const options = sessions.map(s => {
        const t = tokens[s.tokenIndex];
        return {
          label: `${t?.label || t?.username || `Hesap ${s.tokenIndex + 1}`}`.slice(0, 100),
          description: `${STATUS_ICONS[s.targetStatus] || '❓'} ${s.targetStatus}${s.customStatus ? ` — "${s.customStatus}"` : ''} kapatmak için seç`,
          value: String(s.tokenIndex),
          emoji: '🔌',
        };
      });
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mobil:durduronay')
          .setPlaceholder('🔌 Kapatmak istediğin mobil oturumu seç...')
          .addOptions(options),
      );
      return interaction.reply({ content: '**🔌 Hangi mobil oturumu kapatalım?**', components: [row], ephemeral: true });
    }

    // ── Detaylı rapor ──
    if (action === 'rapor') {
      const sessions = getUserMobileStatusSessions(userId);
      if (sessions.length === 0) {
        return interaction.reply({
          content: '📭 Hiç mobil status oturumun yok.\n\n**Başlamak için:**\n> `🚀 Hızlı Kurulum` butonuna bas → hesap seç → durum seç. Her şey 3 adımda!',
          ephemeral: true,
        });
      }

      const lines = sessions.map((s) => {
        const running = isMobileStatusRunning(userId, s.tokenIndex);
        const t = tokens[s.tokenIndex];
        const icon = STATUS_ICONS[s.targetStatus] || '❓';
        const durumMetni = { online: 'Çevrimiçi', bosta: 'Boşta', rahatsiz: 'Rahatsız Etme', gorunmez: 'Görünmez' }[s.targetStatus] || s.targetStatus;
        return [
          `> ${running ? '📱' : '⭕'} **${t?.label || t?.username || `Hesap #${s.tokenIndex + 1}`}**`,
          `> ↳ ${icon} Durum: \`${durumMetni}\`  •  Bağlantı: \`${running ? 'Sağlıklı ✅' : 'Koptu ⚠️'}\``,
          s.customStatus ? `> ↳ 💬 Durum yazısı: *" ${s.customStatus}"*` : null,
          '',
        ].filter(Boolean).join('\n');
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('📊 Mobil Status — Detaylı Rapor')
        .setColor(COLORS.vault)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          lines,
          `\`${THIN_DIVIDER}\``,
          `> ♻️ **Reboot Recovery:** aktif — bot yeniden başlasa bile hepsi geri gelir`,
          `> 💓 **Keep-Alive:** 5 dakikada bir presence tazelenir`,
        ].join('\n'))
        .setFooter(FOOTER())
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  async onSelect(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    // ADIM 2/3: durum tipi seçim ekranı
    if (action === 'statusmodal') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`mobil:statussec:${tokenIndex}`)
          .setPlaceholder('🎨 Profilinde hangi durum görünsün?')
          .addOptions(STATUS_OPTIONS),
      );
      return interaction.update({
        content: '**ADIM 2/3 — Durum tipini seç:**\n> 🟢 Online = yeşil  •  🌙 Boşta = ay  •  🔴 DND = kırmızı  •  👻 Görünmez = gri',
        components: [row],
      });
    }

    // ADIM 3/3: durum yazısı modalı
    // NOT: showModal çağrısı 3 saniye içinde yapılmalı, aksi halde "Unknown
    // interaction" (10062) hatası gelir. O yüzden modem OLMADAN hemen açılır.
    if (action === 'statussec') {
      const tokenIndex = parseInt(parts[1], 10);
      const chosen = interaction.values[0];
      const modal = new ModalBuilder()
        .setCustomId(`mobil:modal:${tokenIndex}:${chosen}`)
        .setTitle('📱 Mobil Status — Son Adım');

      const customInput = new TextInputBuilder()
        .setCustomId('custom_status')
        .setLabel('Durum yazısı (isteğe bağlı)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Örn: Uykudayım 😴 — boş bırakırsan yazı eklenmez')
        .setRequired(false)
        .setMaxLength(60);

      modal.addComponents(new ActionRowBuilder().addComponents(customInput));
      return interaction.showModal(modal);
    }

    // Kapatma onayı
    if (action === 'durduronay') {
      const tokenIndex = parseInt(interaction.values[0], 10);
      stopMobileStatus(userId, tokenIndex);
      markStop(userId, 'mobil', tokenIndex); // ⏱️
      await interaction.update({
        content: `✅ **Hesap #${tokenIndex + 1} mobil oturumu kapatıldı.**\n> Hesap artık çevrimdışı görünür. Yeniden bağlamak için \`🚀 Hızlı Kurulum\`.`,
        components: [],
      });
    }
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'modal') return;
    const userId = interaction.user.id;
    const tokenIndex = parseInt(parts[1], 10);
    const chosenStatus = parts[2] || 'online';
    const customStatus = interaction.fields.getTextInputValue('custom_status');

    await interaction.deferReply({ ephemeral: true });

    const tokens = getTokens(userId);
    const t = tokens[tokenIndex];
    if (!t) {
      return interaction.editReply({ embeds: [errorEmbed('Hesap bulunamadı — kasadan silinmiş olabilir. `!hesaplarim` ile kontrol et.')] });
    }

    const res = await startMobileStatus(userId, tokenIndex, t, chosenStatus, customStatus);
    if (res.success) markStart(userId, 'mobil', tokenIndex); // ⏱️
    if (!res.success) {
      return interaction.editReply({ embeds: [errorEmbed(`Mobil bağlantı kurulamadı:\n\`${res.error}\`\n\n**Çözüm önerileri:**\n> • Token geçersiz olabilir → \`!hesaplarim\` → Denetle\n> • İnternet bağlantını kontrol et\n> • 1-2 dakika sonra tekrar dene`)] });
    }

    const durumMetni = { online: 'Çevrimiçi', bosta: 'Boşta', rahatsiz: 'Rahatsız Etme', gorunmez: 'Görünmez' }[chosenStatus] || chosenStatus;
    const embed = new EmbedBuilder()
      .setTitle(res.alreadyRunning ? '📱 Mobil Status Güncellendi!' : '📱 Mobil Status Aktif!')
      .setColor(COLORS.success)
      .setDescription([
        `\`${THIN_DIVIDER}\``,
        `> 👤 **Hesap:** \`${res.username}\``,
        `> ${STATUS_ICONS[chosenStatus]} **Durum:** \`${durumMetni}\``,
        customStatus ? `> 💬 **Durum Yazısı:** *" ${customStatus}"*` : '> 💬 Durum yazısı: yok',
        `> 📱 **Platform:** \`Android\` — 1-2 dk içinde mobil tik görünür`,
        '',
        `> ♻️ Reboot Recovery: \`Aktif\`  •  💓 Keep-Alive: \`5dk\`  •  🔁 Auto-Reconnect: \`Aktif\``,
        '',
        `*⚠️ Profil değişikliği 1-2 dakika sürebilir. Başka bir hesaptan bakarak kontrol et.*`,
        `*Değiştirmek istersen: aynı akışı tekrar izle — üzerine yazar.*`,
        `\`${THIN_DIVIDER}\``,
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
