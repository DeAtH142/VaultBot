// src/commands/yardim.js
import { EmbedBuilder } from 'discord.js';
import { E, DIVIDER } from '../utils/embeds.js';

// ── Kategori bazlı eksiksiz komut rehberi ─────────────────────────────────
const SECTIONS = [
  {
    title: '🔑 Hesap Kasası & Yönetim',
    emoji: '🔑',
    desc: 'Tokenleri ekle, sil, denetle. Her şeyin temeli burası.',
    lines: [
      ['`!hesaplarim`', '`vault`, `kasa`, `tokens`', '**Token Kasası paneli** — Popup formla toplu token ekle/sil, tek tuşla sağlık denetimi, yedek TXT indir, canlı durum listesi.'],
      ['`!tokenekle <token> [label]`', '`settoken`, `addtoken`', 'Tek tokenı doğrudan kasaya ekler. AES-256-GCM ile şifreli saklanır.'],
      ['`!tokensil <label>`', '`deltoken`, `removetoken`', 'Kasadan hesap siler.'],
      ['`!checker`', '`denetle`, `kontrol`', '**Token Denetleyici paneli** — Tüm tokenleri toplu kontrol eder; geçersizleri tek tuşla temizler, sağlık raporu verir.'],
      ['`!profilechanger`', '`profil`, `pchanger`', '**Profil Değiştirici** — Kasadaki hesapların avatar / banner / kullanıcı adı / bio güncelleme.'],
    ],
  },
  {
    title: '🟢 Çevrimiçi & Durum Sistemleri',
    emoji: '🟢',
    desc: 'Hesapları 7/24 canlı tutar, durumlarını yönetir.',
    lines: [
      ['`!online`', '`aktif`, `onlinetut`, `presence`', '**Online Tutma paneli** — Tüm kasayı tek panel üzerinden 7/24 Online / DND / Idle / Görünmez yapar. Reboot recovery destekli.'],
      ['`!afk on` / `!afk off`', '`afkmod`', 'AFK koruyucu — botun kanalda periyodik typing atarak aktif kalmasını sağlar.'],
      ['`!mobil`', '`mobilestatus`, `mobiltik`', '**Mobil Status** — Hesapları Android istemcisi olarak bağlar; profilde 📱 mobil tik görünür. Bot algısını düşürür, 4 durum modu + custom status + reboot recovery.'],
    ],
  },
  {
    title: '⚔️ Ekonomi & Farm Modülleri',
    emoji: '⚔️',
    desc: 'OwO farm motoru ve otomatik kazanç araçları.',
    lines: [
      ['`!owo`', '`owooto`, `owobot`', '**OwO Premium Otomasyon v3** — Hunt, Battle, Quest, Gem, Sell, Daily. İnsan simülasyonu (16-21s jitter), kanal rotasyonu, auto-sleep, 2Captcha entegrasyonu, canlı istatistik + oturum raporu.'],
      ['`!nitrosniper`', '`sniper`, `nitro`', '**Nitro Sniper** — DM/kanallarda geçen nitro kodlarını milisaniyeler içinde oto claim eder.'],
      ['`!giveawayfarmer`', '`giveaway`, `gaw`', '**Giveaway Farmer** — 🎉 reaksiyonlu çekilişleri otomatik yakalar, hesaplar sürekli dinlemede.'],
      ['`!otobump`', '`bump`, `autobump`', '**🚀 Oto Bump (Premium)** — DISBOARD / MEE6 / BLMP otomatik bump. Bump botunun cevabını **okuyup** gerçek cooldown\'u öğrenir; 1-45 sn jitter, yedek kanal, kalıcı istatistik, reboot recovery.'],
      ['`!boostcheck`', '`boostlar`, `boost`', 'Kasadaki hesapların sunucu boost durumlarını listeler.'],
    ],
  },
  {
    title: '📢 Mesaj & Aktivite Motorları',
    emoji: '📢',
    desc: 'Otomatik mesaj, typing, sohbet ve tepki sistemleri.',
    lines: [
      ['`!autotyper`', '`typer`, `ototyper`', '**AutoTyper** — Seçili hesapla kanallarda 8 sn döngülü "Yazıyor..." simülasyonu. Reboot recovery dahil.'],
      ['`!otomesaj`', '`otopost`, `autopost`', '**Oto Mesaj/Post** — Belirlenen kanala dakika bazlı aralıkla, rastgele mesaj havuzundan post atar. Jitter + reboot recovery.'],
      ['`!otoreact`', '`react`, `autoreact`', '**Premium Oto React** — Hedef mesaja kasadaki tüm hesaplarla toplu reaksiyon. Rate-limit koruması, akıllı emoji algılama.'],
      ['`!aichat`', '`ai`, `sohbetbot`', '**AI Chat Botu** — Hesapların belirli kanallarda AI ile sohbet etmesi. Groq + Gemini fallback, bağlamsal hafıza, kişilik ayarı. Panelinden API key girilir.'],
    ],
  },
  {
    title: '📨 DM & Davet Araçları',
    emoji: '📨',
    desc: 'Toplu DM, sunucuya çekim, çıkış ve temizlik.',
    lines: [
      ['`!dmsender`', '`topludm`, `bulkdm`', '**Toplu DM Sender** — Kasadaki hesaplarla round-robin DM kampanyası. `{@user}` şablon etiketi + rate koruması.'],
      ['`!joiner`', '`tokenjoiner`', '**Token Joiner** — Hesapları invite linkiyle sunucuya sokar. OAuth2 akışı, 1.5 sn güvenli hız.'],
      ['`!autoleave`', '`otocik`, `cikis`', '**Auto-Leave** — Hesabın bulunduğu sunucuları listeler / toplu çıkış yapar. Liste DM\'e düşer, 1 sn hız.'],
      ['`!friendcleaner`', '`arkadastemizle`', '**Arkadaş Temizleyici** — Tüm geçerli hesapların arkadaş listesini temizler (muaf liste dahil).'],
    ],
  },
  {
    title: '🔊 Ses & Sunucu Yönetimi',
    emoji: '🔊',
    desc: 'Ses kanalı AFK, panel kurulumu ve sunucu şablonu.',
    lines: [
      ['`!voiceafk`', '`sesafk`', '**Ses AFK paneli** — Hesapları ses kanalına bağlar, koparsa otomatik geri sokar (max 10 deneme, bulamazsa vazgeçer). Tüm hesapları tek panelde yönet.'],
      ['`!kur <panel|hepsi>`', '`setup`, `paneller`', 'Belirlediğin kanala sabit panelleri kalıcı kurar. Liste: `!kur liste`'],
      ['`!template`', '`sunucukur`', '⚠️ **YIKICI** — Sunucuyu komple yeniden kurar: 9 tier rol, 8 kategori, 30+ kanal, kılavuzlar + rol izin matrisi.'],
    ],
  },
  {
    title: '⏱️ Süre & Rol İlerlemesi',
    emoji: '⏱️',
    desc: 'Aktif kullanım süreni ve rollerini takip eder.',
    lines: [
      ['`!surem`', '`sürem`, `playtime`, `ilerleme`', '**Kişisel ilerleme kartı** — Aktif sistemlerken geçen birleşik süre, sıradaki role kalan süre, rol geçmişi. Birden fazla sistem aynı anda açıksa süre **tek kez** sayılır.'],
      ['`!surem panel`', '—', 'Butonlu detaylı panel: anlık durum yenileme, canlı sistemler, rol yol haritası.'],
      ['`!surem roller`', '`tiers`, `roadmap`', '10 aşamalı rol hedefi tablosu (5 → 35 sa ek süre, toplam 196 sa).'],
      ['`!surem kurallar`', '`rules`', 'Sistemin kuralları: gerçek başlangıç, birleşim hesabı, bot kapalıyken süre sayılmaması.'],
    ],
  },
  {
    title: 'ℹ️ Genel Komutlar',
    emoji: 'ℹ️',
    desc: 'Yardım ve sistem bilgisi.',
    lines: [
      ['`!yardim`', '`help`, `komutlar`', 'Bu menüyü açar.'],
    ],
  },
];

export default {
  name: 'yardim',
  aliases: ['yardım', 'help', 'komutlar'],
  description: 'Tüm komutları listeler.',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setAuthor({
        name: 'REXAL SYSTEMS — Komut Rehberi',
        iconURL: message.client.user.displayAvatarURL({ dynamic: true }),
      })
      .setTitle('📖 Tüm Selfbot Komutları')
      .setColor(0x3498db)
      .setDescription([
        `Merhaba <@${message.author.id}>! **${message.client.commands.size} yüklü komut** — kategorilere ayrılmış tam rehber:`,
        '',
        DIVIDER,
        '**📌 Nasıl kullanılır?** Komutlar `!` prefix ile çalışır (örn: `!owo`). Parantez içindekiler aynı komutun kısaltmalarıdır.',
        '',
      ].join('\n'));

    for (const sec of SECTIONS) {
      embed.addFields({
        name: `${sec.emoji} ${sec.title}`,
        value: [
          `> *${sec.desc}*`,
          '',
          ...sec.lines.map(([cmd, aliases, desc]) =>
            `**${cmd}**\n> ↳ (${aliases}) ${desc}`,
          ),
        ].join('\n'),
        inline: false,
      });
    }

    embed.addFields({
      name: '💡 İpuçları',
      value: [
        `> ${E.check} Hesap eklemek için önce \`!hesaplarim\` → **Token Ekle**`,
        `> ${E.check} Panellerde alt taraftaki butonlarla işlem yapılır`,
        `> ${E.check} Bot kapansa bile oturumlar **Reboot Recovery** ile geri gelir`,
        `> ${E.rocket} \`!otobump\` ile sunucunu otomatik bump'la büyüt`,
        `> ${E.clock} Süre ilerlemen **Firestore'da** tutulur — \`!surem\` ile takip et`,
        `> ⚠️ \`!template\` komutu sunucuyu komple sıfırlar — dikkat!`,
      ].join('\n'),
    });

    embed.setFooter({ text: 'REXAL SYSTEMS • Güçlü AES-256-GCM Şifreleme' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};
