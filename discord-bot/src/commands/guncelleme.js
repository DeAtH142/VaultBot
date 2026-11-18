// src/commands/guncelleme.js
// 📜 !guncelleme — Bot güncelleme notlarını markalı Discord embed'i olarak atar.
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { COLORS, BRAND, E, THIN_DIVIDER, UX } from '../utils/embeds.js';

const CHANGELOG = [
  {
    version: 'v4.1',
    title: 'MEGA GÜNCELLEME',
    color: COLORS.gold,
    sections: [
      {
        name: '🏆 YENİ VIP TIER SİSTEMİ',
        value: [
          '> 🏮 **1. Mina** — `3` kapasite • 🚨 VIP Webhook',
          '> 🌲 **2. Sueda** — `7` kapasite • 🚨 VIP Webhook',
          '> 🌷 **3. Lidya** — `14` kapasite • 🚨 + 📊 İstatistik',
          '> 💜 **4. Hilal** — `20` kapasite • 🚨 + 📊 İstatistik',
          '> ☄️ **5. Zoktay** — `25` kapasite • 🚨 + 📊 + 🛡️ Anti-Ban',
          '> 💛 **6. Esin** — `50` kapasite • 🚨 + 📊 + 🛡️ Anti-Ban',
          '',
          '**🔧 Değişen komutlar:**',
          '> ▸ `!sürem` • `!hesaplarim` • `owo sistemi` → artık **sadece 6 paketi** gösteriyor',
          '> ▸ 🐛 FIX: sabit `4` kapasite → artık **paketin gerçek kapasitesi**',
        ].join('\n'),
      },
      {
        name: '🚨 VIP WEBHOOK BİLDİRİMLERİ (tüm paketler)',
        value: [
          '> ▸ 📬 `!hesaplarim` paneline **«VIP Webhook Bildirimi»** butonu geldi',
          '> ▸ 🔔 Bildirimler: 💔 token koptu • ✅ kurtarıldı • 🚀 sistem başladı • 💥 hata • ⏰ paket bitiyor',
          '> ▸ 🎀 Kendi özel kanalına şık embed ile anlık rapor!',
        ].join('\n'),
      },
      {
        name: '📊 `!kasaistatistik` (Lidya ve üstü)',
        value: [
          '> ▸ ⏱️ Toplam bot süren • 🔥 en çok kullandığın sistem (▓▓▓░░ grafik)',
          '> ▸ 🔑 Token stabilite tablosu 🟢🟡🔴 • 🏆 kazanım sayacı',
        ].join('\n'),
      },
      {
        name: '🛡️ `!guvenlimod` Anti-Ban (Zoktay + Esin)',
        value: [
          '> ▸ ⚡ Komut aralıkları ~**1.75-2.1x** yavaşlatılır + insansı jitter',
          '> ▸ 🎛️ Tek butonla aç/kapa — **default: AÇIK**',
        ].join('\n'),
      },
      {
        name: '🔐 MERKEZİ CONFIG',
        value: [
          '> ▸ 📦 **PACKAGES** → 6 paket tek yerden yönetim',
          '> ▸ 🎨 **EMOJILER** → dev portal emojilerin',
          '> ▸ 👥 **SELFBOT_USERS** → 15 selfbot komutuna kimlik bazlı yetki 🔒',
          '> ▸ ⚠️ Erişim ≠ Kapasite — kapasite paketten gelir!',
        ].join('\n'),
      },
      {
        name: '⏱️ SÜRE MOTORU — BÜYÜK BUG FİX',
        value: [
          '> ▸ 💥 Bug: bot aç-kapa sonrası `!sürem` «süre sayılmıyor» gösteriyordu → **çözüldü**',
          '> ▸ 🎖️ Yeni takip edilen sistemler: ⛏️ MC AFK (Aternos) • 📺 Streamer Yayın',
        ].join('\n'),
      },
      {
        name: '🤖 OWO CAPTCHA ÇÖZÜCÜ — 5 BUG FİX',
        value: [
          '> ▸ 💥 JSON → **form-urlencoded** (görev hiç oluşmuyordu!)',
          '> ▸ 💥 Zaman aşımı 75 sn → **3 dakika**',
          '> ▸ 💥 Redirect takibi + görsel arama artık **5 farklı yerde** 🔍',
          '> ▸ 📡 Yeni loglar: `🤖 Görsel bulundu → ⏳ Çözülüyor → ✅ Bot devam!`',
        ].join('\n'),
      },
      {
        name: '🧹 HATA TEMİZLİĞİ & EMBED REVİZYONU',
        value: [
          '> ▸ 🔧 `sespaneli.js` archiver çökmesi fix 💥',
          '> ▸ 🎨 16 komut düz metin → **markalı embed** (`rolver, rol, rolal, code, vaultsettings...`)',
          '> ▸ ✅ **152 komut** hatasız yükleniyor ',
        ].join('\n'),
      },
    ],
  },
];

export default {
  name: 'guncelleme',
  aliases: ['güncelleme', 'changelog', 'yenilikler', 'updates'],
  description: 'Bot güncelleme notlarını gösterir',

  async execute(message) {
    const pages = buildPages();
    let page = 0;

    const msg = await message.reply({
      embeds: [renderPage(pages, page, message.author)],
      components: pages.length > 1 ? navComponents(pages.length, page) : [],
    });

    if (pages.length <= 1) return;

    const collector = msg.createMessageComponentCollector({ time: 5 * 60 * 1000 });
    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) {
        return i.reply({ content: '❌ Bu panel sana ait değil!', ephemeral: true });
      }
      if (i.customId === 'gc_prev') page = (page - 1 + pages.length) % pages.length;
      if (i.customId === 'gc_next') page = (page + 1) % pages.length;
      await i.update({ embeds: [renderPage(pages, page, message.author)], components: navComponents(pages.length, page) });
    });
    collector.on('end', () => msg.edit({ components: [] }).catch(() => { }));
  },
};

function buildPages() {
  const pages = [];
  for (const release of CHANGELOG) {
    // Her release'i bölümlere göre 6000 karakter limitine sığdır (embed toplam limiti)
    let fields = [];
    let total = 0;
    for (const sec of release.sections) {
      const size = sec.name.length + sec.value.length;
      if (total + size > 5600 && fields.length > 0) {
        pages.push({ release, fields });
        fields = [];
        total = 0;
      }
      fields.push(sec);
      total += size;
    }
    if (fields.length) pages.push({ release, fields });
  }
  return pages;
}

function renderPage(page, author) {
  const { release, fields } = page;
  // Selfbot'ta author bazen partial User döner — displayAvatarURL olmayabilir
  const icon = typeof author?.displayAvatarURL === 'function'
    ? author.displayAvatarURL({ dynamic: true })
    : undefined;
  return new EmbedBuilder()
    .setAuthor({
      name: `${BRAND.name} • Güncelleme Notları`,
      ...(icon ? { iconURL: icon } : {}),
    })
    .setColor(release.color)
    .setTitle(`${E.rocket}  REXAL — ${release.title} ${release.version}`)
    .setDescription([
      UX.header,
      `> ✨ Botuna eklenen **tüm yenilikler, fix'ler ve sistemler**`,
      UX.footerLine,
    ].join('\n'))
    .addFields(fields.map(f => ({ name: f.name, value: f.value })))
    .setFooter(BRAND.footer(`Sayfa güncel • ${release.version}`))
    .setTimestamp();
}

function navComponents(pageCount, page) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gc_prev').setLabel('◀ Önceki').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('gc_page').setLabel(`Sayfa ${page + 1}/${pageCount}`).setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('gc_next').setLabel('Sonraki ▶').setStyle(ButtonStyle.Secondary),
  )];
}
