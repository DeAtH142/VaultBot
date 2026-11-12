// src/commands/template.js — 🏗️ PRO Sunucu Template Motoru
// `!template` → TÜM kanalları + rolleri siler, gelişmiş profesyonel bir sunucu yapısı kurar:
// kategoriler, kanallar (konumlarda kullanım kılavuzu), emoji-büyük-harf isimler, rol izinleri.
// ⚠️ YIKICI İŞLEM — onay butonu zorunlu.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits, OverwriteType, Colors,
} from 'discord.js';
import { COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine } from '../utils/embeds.js';
import { sleep } from '../utils/selfbotHelpers.js';

const FOOTER = () => BRAND.footer('Server Architect Engine');
const API_PAUSE_MS = 350; // Discord rate-limit nefesi

// ── 🎭 ROL TASARIMI ─────────────────────────────────────────────────────
// Sıra önemli: aşağıdan yukarıya oluşturulur (son oluşturulan en tepede).
const ROLE_PLAN = [
  {
    name: '🔇 Susturulmuş',
    color: 0x4f545c,
    perms: [],
    note: 'Mute rolü — tüm kanallarda konuşma kapalı',
  },
  {
    name: '👥 Üye',
    color: 0x99aab5,
    perms: ['ViewChannel', 'SendMessages', 'AddReactions', 'ReadMessageHistory',
      'UseExternalEmojis', 'AttachFiles', 'EmbedLinks', 'Connect', 'Speak',
      'UseVAD', 'CreatePublicThreads', 'SendMessagesInThreads', 'UseApplicationCommands', 'ChangeNickname'],
    note: 'Standart üye paketi',
  },
  {
    name: '🎉 Çekilişçi',
    color: 0xf1c40f,
    perms: ['ViewChannel', 'SendMessages', 'AddReactions', 'ReadMessageHistory'],
    note: 'Çekiliş kanallarına erişim',
  },
  {
    name: '🌟 VIP',
    color: 0xe91e63,
    perms: ['ViewChannel', 'SendMessages', 'AddReactions', 'ReadMessageHistory',
      'UseExternalEmojis', 'AttachFiles', 'EmbedLinks', 'Connect', 'Speak', 'UseVAD',
      'MoveMembers', 'Stream', 'PrioritySpeaker'],
    note: 'VIP lounge + ekstra yetkiler',
  },
  {
    name: '💼 Yetkili',
    color: 0x3498db,
    perms: ['ViewChannel', 'SendMessages', 'ManageMessages', 'ManageThreads',
      'TimeoutMembers', 'KickMembers', 'ModerateMembers', 'ViewAuditLog',
      'MentionEveryone', 'AddReactions', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks'],
    note: 'Mesaj yönetimi + kick + timeout',
  },
  {
    name: '🛡️ Moderatör',
    color: 0x9b59b6,
    perms: ['ViewChannel', 'SendMessages', 'ManageMessages', 'ManageThreads',
      'ManageNicknames', 'ManageRoles', 'TimeoutMembers', 'KickMembers', 'BanMembers',
      'ModerateMembers', 'ViewAuditLog', 'MentionEveryone', 'MoveMembers', 'MuteMembers',
      'DeafenMembers', 'AddReactions', 'ReadMessageHistory', 'ManageChannels'],
    note: 'Genel sunucu moderasyonu',
  },
  {
    name: '⚙️ Yönetici',
    color: 0xe67e22,
    perms: ['ViewChannel', 'SendMessages', 'ManageChannels', 'ManageRoles',
      'ManageGuild', 'ManageWebhooks', 'ManageMessages', 'ManageThreads',
      'ManageNicknames', 'ManageEmojisAndStickers', 'KickMembers', 'BanMembers',
      'ModerateMembers', 'ViewAuditLog', 'MentionEveryone', 'AddReactions',
      'ReadMessageHistory', 'CreateInvite', 'ManageEvents', 'ViewCreatorMonetizationExpressions'],
    note: 'Sunucu ayarları (Administrator değil — kritik onayı kapsamaz)',
  },
  {
    name: '👑 KURUCU',
    color: 0xf1c40f,
    perms: ['Administrator'],
    note: 'Tam yetki — dokunulmaz',
  },
];

// ── 🏛️ KANAL MİMARİSİ ──────────────────────────────────────────────────
// topic alanları = kullanım kılavuzu (kanal açıklamasında görünür)
const STRUCTURE_PLAN = [
  {
    category: '👑 KURULUM VE DUYURULAR',
    catTopic: '≫ Yönetim katmanı — sadece üst kademe görünür ≪',
    staffOnly: 'admin',
    channels: [
      { name: '📢│duyuru-merkezi', topic: '「 📢 DUYURU MERKEZİ 」\n\n▸ Bu kanalda SADECE yetkililer duyuru paylaşır.\n▸ Her üye mesajları okur ama yazamaz.\n▸ Önemli değişiklikler buradan duyurulur.\n▸ Bildirimlerin açık olsun: 🔔' },
      { name: '📜│sunucu-kuralları', topic: '「 📜 KURALLAR 」\n\n1️⃣ Saygılı ol — hakaret yok.\n2️⃣ Spam / flood yasak.\n3️⃣ Reklam yasak (DM dahil).\n4️⃣ NSFW içerik yasak.\n5️⃣ Yetkiliye karşı gelme.\n6️⃣ Her kanal kendi konusundadır — başka konu oraya yazılmaz.\n\n▸ İhlal = uyarı → timeout → kick → ban.' },
      { name: '🔐│yönetim-odası', topic: '「 🔐 YÖNETİM ODASI 」\n\n▸ Sadece KURUCU + YÖNETİCİ görünür.\n▸ İç politikalar, kararlar, altyapı notları.\n▸ Ekran görüntüsü paylaşılmaz.' },
      { name: '🧾│staff-log', topic: '「 🧾 STAFF LOG 」\n\n▸ Moderasyon kayıtları buraya yazılır.\n▸ Kim, ne zaman, hangi sebep?\n▸ Format: [@üye] [aksiyon] [sebep]' },
      { name: '💬│staff-sohbet', topic: '「 💬 STAFF SOHBET 」\n\n▸ Yetkili ekibin koordinasyon alanı.\n▸ Rol davranışları burada görüşülür.' },
    ],
  },
  {
    category: '🌟 GENEL MERKEZ',
    catTopic: '≫ Herkese açık ana sosyal alan ≫',
    channels: [
      { name: '🖐️│hoşgeldin', topic: '「 🖐️ HOŞ GELDİN 」\n\n▸ Sunucuya yeni katılanları buradan karşılarız.\n▸ @Üye rolü otomatik verilir.\n▸ Tanışmak için #chat-grafik kanalına geç.\n▸ Rol seçimi için #rol-al kanalına göz at.' },
      { name: '💬│sohbet-grafik', topic: '「 💬 GENEL SOHBET 」\n\n▸ Serbest konuşma alanı.\n▸ Konu dışına çıkma — off-topic kanal var.\n▸ Spam değil, sohbet.' },
      { name: '🤖│bot-komutları', topic: '「 🤖 BOT KOMUTLARI 」\n\n▸ Tüm bot komutlarını BURADA kullan.\n▸ Diğer kanallarda bot komutu yazmak spam sayılır.\n▸ Komut rehberi sabit mesajlarda olabilir.' },
      { name: '🧠│off-topic', topic: '「 🧠 OFF-TOPIC 」\n\n▸ Günlük hayat, boş konuşma, random paylaşım.\n▸ Ana sohbeti kirletmemek için buradaysan burada kal.' },
      { name: '🖼️│medya-paylaşım', topic: '「 🖼️ MEDYA PAYLAŞIM 」\n\n▸ Görsel, video, meme paylaşımı.\n▸ NSFW = anında ban.\n▸ Flood yok — mesaj başına 1-3 medya.' },
      { name: '💡│öneri-kutusu', topic: '「 💡 ÖNERİ KUTUSU 」\n\n▸ Sunucuyu daha iyi yapmak için fikir ver.\n▸ Format: [BAŞLIK] → [DETAY] → [BEKLENEN ETKİ]\n▸ Çöp/boş öneriler silinir.' },
    ],
  },
  {
    category: '🔐 REXAL HESAP MERKEZİ',
    catTopic: '≫ Token kasası ve hesap yönetim bölgesi ≫',
    staffOnly: null,
    channels: [
      { name: '🔒│hesaplarim', topic: '「 🔒 HESAPLARIM 」\n\n▸ !hesaplarim yazarak REXAL Token Kasası panelini aç.\n▸ Buradan token ekle / sil / denetle / yedekle.\n▸ 🔐 Tokenlar AES-256-GCM ile şifrelidir, güvenlidir.\n▸ 🔎 Denetle butonu ile geçerlilik kontrolü yap.\n▸ ⚠️ Token kimseyle paylaşma, ekran görüntüsü alma.' },
      { name: '➕│token-ekle', topic: '「 ➕ TOKEN EKLE 」\n\n▸ !tokenekle yazarak hızlı token ekleme.\n▸ Toplu eklemek için !hesaplarim panelindeki Token Ekle modalını kullan.\n▸ Ekledikten sonra kasada gözükmesi 1-2 sn sürebilir.\n▸ 🧹 Geçersizleri temizle: !checker kullan.' },
      { name: '🗑️│token-sil', topic: '「 🗑️ TOKEN SİL 」\n\n▸ !tokensil yazarak token silme.\n▸ Hesap numarası girerek tek tek sil.\n▸ 💔 Geçersizler otomatik temizlenir: !checker temizle.\n▸ Silmeden önce yedek al: !hesaplarim Yedek İndir.' },
      { name: '📊│hesap-durumu', topic: '「 📊 HESAP DURUMU 」\n\n▸ !online yazarak aktif/pasif hesap listesi.\n▸ 🟢 Aktif  ⚪ Pasif  💔 Geçersiz\n▸ Hesap durumlarını kasadan takip et.\n▸ Sorun varsa !checker ile denetle.' },
      { name: '🎫│destek-talebi', topic: '「 🎫 DESTEK TALEBİ 」\n\n▸ Sistem hatası, hesap problemi, öneri → buradan bildir.\n▸ Format: [KONU] → [HATA/DETAY] → [EKRAN GÖRÜNTÜSÜ]\n▸ Destek ekibi 24 saat içinde dönüş yapar.' },
    ],
  },
  {
    category: '🤖 REXAL OTOMASYON PANELLERİ',
    catTopic: '≫ Tüm REXAL otomasyon modüllerinin panelleri ≫',
    staffOnly: null,
    channels: [
      { name: '🧠│owo-panel', topic: '「 🧠 OWO PANELİ 」\n\n▸ !owo yazarak OwO otomasyon panelini aç.\n▸ Oto-quest, oto-gem, akıllı sell, kazanç takibi.\n▸ ⚠️ Çok agresif ayar ban riski taşır.\n▸ Reboot sonrası otomatik devam eder.' },
      { name: '⌨️│autotyper', topic: '「 ⌨️ AUTOTYPER 」\n\n▸ !autotyper yazarak otomatik yazma panelini aç.\n▸ Hesapların belirli kanallarda yazması.\n▸ Mesaj havuzu + interval ayarlanabilir.\n▸ ♾️ Reboot recovery desteklidir.' },
      { name: '🎙️│voice-afk', topic: '「 🎙️ VOICE AFK 」\n\n▸ !voiceafk yazarak ses AFK panelini aç.\n▸ Hesaplar ses kanalına girer ve AFK kalır.\n▸ Reconnect otomatik, çevrimdışı olmaz.' },
      { name: '🥵│oto-react', topic: '「 🥵 OTO REACT 」\n\n▸ !otoreact yazarak toplu reaksiyon panelini aç.\n▸ Hedef mesaja tüm kasadaki hesaplar reaksiyon basar.\n▸ Emojiler sunucudan otomatik çekilir.' },
      { name: '🌌│profile-changer', topic: '「 🌌 PROFILE CHANGER 」\n\n▸ !profilechanger yazarak profil değiştirme panelini aç.\n▸ Avatar, bio, banner toplu değişiklik.\n▸ ⚠️ Değişiklik geri alınamaz, dikkatli kullan.' },
      { name: '🛡️│joiner', topic: '「 🛡️ JOINER 」\n\n▸ !joiner yazarak token joiner panelini aç.\n▸ Davet linki ile toplu sunucu katılımı.\n▸ Hız ve delay ayarı var, agresif olma.' },
      { name: '⚡│friend-cleaner', topic: '「 ⚡ FRIEND CLEANER 」\n\n▸ !friendcleaner yazarak arkadaş temizleme panelini aç.\n▸ Exclude listesi destekli — önemli kişileri koru.\n▸ Silme işlemi geri alınamaz!' },
      { name: '🚪│auto-leave', topic: '「 🚪 AUTO LEAVE 」\n\n▸ !autoleave yazarak sunucudan toplu çıkış paneli aç.\n▸ Sunucu listesi DM mesajında görünür.\n▸ Hız: 1 sn güvenli mod.' },
      { name: '🪄│otoreact-config', topic: '「 🪄 OTO REACT CONFIG 」\n\n▸ Reaksiyon emojilerini özelleştir.\n▸ Maks reaksiyon sayısı ayarlanabilir (Discord limiti 20).\n▸ Unicode + custom emoji havuzu.' },
    ],
  },
  {
    category: '🎁 REXAL AKTİF SİSTEMLER',
    catTopic: '≫ Zamanlanmış ve sürekli çalışan sistemler ≫',
    staffOnly: null,
    channels: [
      { name: '🕐│otomesaj', topic: '「 🕐 OTO MESAJ 」\n\n▸ !otomesaj yazarak zamanlanmış mesaj panelini aç.\n▸ Belirli kanala dakika bazlı mesaj atar.\n▸ Mesaj havuzu + jitter (doğal görünüm).\n▸ ⚠️ Agresif interval = ban riski.' },
      { name: '💌│dm-sender', topic: '「 💌 DM SENDER 」\n\n▸ !dmsender yazarak toplu DM panelini aç.\n▸ Hedef listesi + şablon havuzu.\n▸ Round-robin dağıtım — tek hesap dokatmaz.\n▸ {@user} etiketi kullanılabilir.' },
      { name: '🎉│giveaway-farmer', topic: '「 🎉 GIVEAWAY FARMER 」\n\n▸ !giveawayfarmer yazarak giveaway katılım panelini aç.\n▸ Hesaplar sürekli dinlemede.\n▸ 🎉 reaksiyonu görünce oto katılır.\n▸ Raporda katılım sayısı görünür.' },
      { name: '🪙│nitro-sniper', topic: '「 🪙 NITRO SNIPER 」\n\n▸ !nitrosniper yazarak nitro sniper panelini aç.\n▸ discord.gift kodlarını anlık yakalar.\n▸ Claim başarı / başarısızlık raporu.' },
      { name: '🤖│ai-chat', topic: '「 🤖 AI CHAT 」\n\n▸ !aichat yazarak AI sohbet panelini aç.\n▸ Groq + Gemini (kendi keyini eklemen gerek).\n▸ Bağlamlı hafıza + kişilik ayarı.\n▸ 🔑 Key panelenden eklenir, güvenli.' },
      { name: '📣│boost-check', topic: '「 📣 BOOST CHECK 」\n\n▸ !boostcheck yazarak boost envanterini aç.\n▸ Hangi hesap hangi sunucuyu boostluyor.\n▸ Başlangıç tarihi dahil.' },
      { name: '🔎│checker', topic: '「 🔎 TOKEN CHECKER 」\n\n▸ !checker yazarak token denetleyiciyi aç.\n▸ Tüm tokenlerin geçerliliğini kontrol et.\n▸ Geçersizleri tek tuşla temizle.\n▸ Sağlık raporu al.' },
    ],
  },
  {
    category: '🎮 OYUN VE EĞLENCE',
    catTopic: '≫ Oyun, çekiliş, eğlence bölgesi ≫',
    channels: [
      { name: '🎉│çekiliş', topic: '「 🎉 ÇEKİLİŞ 」\n\n▸ Giveaway mesajları buraya düşer.\n▸ 🎉 reaksiyonuna basarak katıl.\n▸ Birden fazla hesap = kalıcı yasak.\n▸ Kazananlar #kazananlar kanalında açıklanır.' },
      { name: '🏆│kazananlar', topic: '「 🏆 KAZANANLAR 」\n\n▸ Çekiliş kazananlarının listesi.\n▸ Ödül 48 saat içinde teslim edilmezse yenisine geçer.' },
      { name: '🎲│mini-oyunlar', topic: '「 🎲 MİNİ OYUNLAR 」\n\n▸ /rps, /ship, /8ball gibi bot oyunları.\n▸ Hazır olma: skor tabelası burada.' },
      { name: '🎵│muzik-sohbet', topic: '「 🎵 MÜZİK 」\n\n▸ Dinlediğin şarkıları paylaş.\n▸ Bot komutları #bot-komutlarındadır.' },
      { name: '🎤│ses-loki', type: 'voice', topic: '「 🎤 SES LOKİ 」\n\n▸ Genel ses sohbeti.\n▸ Mikrofon izni ÜYE rolünde açık.' },
      { name: '🎧│müzik-odası', type: 'voice', topic: '「 🎧 MÜZİK ODASI 」\n\n▸ Müzik botu ile birlikte dinleme odası.' },
    ],
  },
  {
    category: '💎 VIP LOUNGE',
    catTopic: '≫ VIP üyelere özel premium bölge ≫',
    staffOnly: 'vip',
    channels: [
      { name: '💎│vip-lounge', topic: '「 💎 VIP LOUNGE 」\n\n▸ Sadece @VIP ve üstü rol erişebilir.\n▸ Erken erişim, özel çekilişler, özel sohbet.' },
      { name: '🎰│vip-çekiliş', topic: '「 🎰 VIP ÇEKİLİŞ 」\n\n▸ Sadece VIP üyelere özel çekilişler.\n▸ Ödüller daha yüksek değerli.' },
      { name: '🔊│vip-ses', type: 'voice', topic: '「 🔊 VIP SES 」\n\n▸ VIP özel ses kanalı.' },
    ],
  },
  {
    category: '📚 KAYNAK VE REHBERLER',
    catTopic: '≫ Bilgi arşivi — herkes okur ≫',
    channels: [
      { name: '📖│rehberler', topic: '「 📖 REHBERLER 」\n\n▸ Sunucu kullanımı, bot kurulumu, genel rehberler.\n▸ Yeni başlayanlar BURADAN başlar.' },
      { name: '🔗│faydalı-linkler', topic: '「 🔗 FAYDALI LİNKLER 」\n\n▸ Resmî linkler ve araçlar.\n▸ Kısaltma linki / reklam içeriği yasak.' },
      { name: '❓│soru-cevap', topic: '「 ❓ SORU-CEVAP 」\n\n▸ Teknik veya genel sorular.\n▸ Sorunun cevabı #rehberlerde olabilir, önce ona bak.\n▸ Format: [SORU] → [DENEDİĞİN ÇÖZÜM]' },
    ],
  },
  {
    category: '🔇 SESSİZ BÖLGE',
    catTopic: '≫ Sadece çalışma / dinlenme ≫',
    channels: [
      { name: '🌙│sessiz-sohbet', topic: '「 🌙 SESSİZ SOHBET 」\n\n▸ Bugün ne yaptın, nasıl hissediyorsun.\n▸ Az mesaj, öz konuşma.' },
      { name: '☕│sesli-çalışma', type: 'voice', topic: '「 ☕ ÇALIŞMA ODASI 」\n\n▸ Ortam sesi açık şekilde birlikte çalışma.' },
    ],
  },
];

// Rol map — staffOnly'e göre kim ne görür?
// Model: DEFAULT-DENY — @everyone'e ViewChannel DENY verilir, rollere allow.
// Kanallar overwrite KOYMADIĞI için kategoriden izinleri otomatik miras alır (Discord sync).
function buildOverwritesFor(cat, roles, guildEveryone, mutedRole) {
  const overwrites = [
    { id: guildEveryone.id, deny: ['ViewChannel', 'SendMessages'] },
  ];

  const find = (frag) => roles.find(r => r.name.includes(frag));
  const founder = find('KURUCU');
  const admin = find('Yönetici');
  const mod = find('Moderatör');
  const staff = find('Yetkili');
  const vip = find('VIP');
  const member = find('Üye');
  const gaw = find('Çekilişçi');

  const FULL_ACCESS = ['ViewChannel', 'SendMessages', 'AddReactions', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks', 'UseApplicationCommands'];
  const VIEW_ONLY = ['ViewChannel', 'ReadMessageHistory', 'AddReactions'];

  // Yetkili katmanı her kategoride tam erişim
  for (const r of [founder, admin, mod, staff].filter(Boolean)) {
    overwrites.push({ id: r.id, allow: FULL_ACCESS });
  }

  if (cat.staffOnly === 'admin') {
    // sadece kurucu + yönetici — diğer tüm rolleri deny
    for (const r of [mod, staff, vip, member, gaw].filter(Boolean)) {
      overwrites.push({ id: r.id, deny: ['ViewChannel'] });
    }
  } else if (cat.staffOnly === 'vip') {
    // VIP tam erişim; Üye/Çekilişçi hiçbir şey göremez
    for (const r of [vip].filter(Boolean)) {
      overwrites.push({ id: r.id, allow: FULL_ACCESS });
    }
    for (const r of [member, gaw].filter(Boolean)) {
      overwrites.push({ id: r.id, deny: ['ViewChannel'] });
    }
  } else {
    // herkese açık kategori — Üye/Çekilişçi/VIP tam erişim
    for (const r of [member, gaw, vip].filter(Boolean)) {
      overwrites.push({ id: r.id, allow: FULL_ACCESS });
    }
  }

  // Mute rolü her kategoride susturulur
  if (mutedRole) {
    overwrites.push({ id: mutedRole.id, deny: ['SendMessages', 'AddReactions', 'Speak', 'CreatePublicThreads'] });
  }

  return overwrites;
}

async function wipeGuild(guild) {
  const channels = [...guild.channels.cache.values()];
  for (const ch of channels) {
    try { await ch.delete().catch(() => { }); await sleep(API_PAUSE_MS); } catch { }
  }
  const roles = [...guild.roles.cache.values()].filter(r => !r.managed && r.id !== guild.id && r.editable);
  for (const r of roles) {
    try { await r.delete('Template reset').catch(() => { }); await sleep(API_PAUSE_MS); } catch { }
  }
}

async function buildServer(guild) {
  const report = { roles: 0, categories: 0, channels: 0, failed: [] };

  // 1) Roller
  const roles = [];
  for (const def of ROLE_PLAN) {
    try {
      const role = await guild.roles.create({
        name: def.name,
        colors: { primaryColor: def.color },
        permissions: def.perms,
        reason: 'REXAL Template — rol kurulumu',
      });
      roles.push(role);
      report.roles++;
    } catch (err) {
      report.failed.push(`Rol: ${def.name} — ${err.message}`);
    }
    await sleep(API_PAUSE_MS);
  }

  const mutedRole = roles.find(r => r.name.includes('Susturulmuş'));
  const everyone = guild.roles.everyone;

  // @everyone varsayılan yetkileri kıs
  try {
    await everyone.setPermissions([
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory,
    ], 'REXAL Template — default kilidi');
  } catch (err) { report.failed.push(`@everyone kilidi — ${err.message}`); }

  // 2) Kategoriler + kanallar
  for (const cat of STRUCTURE_PLAN) {
    try {
      const overwrites = buildOverwritesFor(cat, roles, everyone, mutedRole);
      const catCh = await guild.channels.create({
        name: cat.category,
        type: ChannelType.GuildCategory,
        reason: 'REXAL Template',
      });
      // Kategoriler topic desteklemez — deneyelim, olmazsa sessiz geç
      await catCh.setTopic(cat.catTopic).catch(() => { });
      // Kategori overwrite'ları kategoride uygula
      await catCh.permissionOverwrites.set(overwrites, 'REXAL Template').catch(() => { });
      report.categories++;

      for (const cDef of cat.channels) {
        await sleep(API_PAUSE_MS);
        try {
          const ch = await guild.channels.create({
            name: cDef.name,
            type: cDef.type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText,
            topic: cDef.type === 'voice' ? undefined : cDef.topic,
            parent: catCh.id,
            reason: 'REXAL Template',
          });
          // Kanallara ayrı overwrite KOYMUYORUZ — kategoriden otomatik miras alır (sync)
          report.channels++;
        } catch (err) {
          report.failed.push(`Kanal: ${cDef.name} — ${err.message}`);
        }
      }
    } catch (err) {
      report.failed.push(`Kategori: ${cat.category} — ${err.message}`);
    }
    await sleep(API_PAUSE_MS);
  }

  // 3) Susturulmuş rolünü tüm kanallara bağla (kategori overwrite'ları zaten kapsıyor — yeterli)
  return { report, roles };
}

// Karşılama / kurallar embed'leri
function buildWelcomeEmbed(guild) {
  return new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle('╔══════ ✦ WELCOME ✦ ══════╗')
    .setDescription([
      `# ✦ 𝐖 𝐄 𝐋 𝐂 𝐎 𝐌 𝐄 ✦`,
      `### 🌟 **__${guild.name.toUpperCase()}__** 🌟`,
      `\`${THIN_DIVIDER}\``,
      `> 👑 **${guild.name}** ailesine hoş geldin!`,
      `> 🔍 Kuralları oku: 📜│sunucu-kuralları`,
      `> 🎭 Rol seç: 🎉│çekiliş + 💎 VIP bölgesi`,
      `> 💬 Tanış: 💬│sohbet-grafik`,
      ``,
      `╚══════ ✦ İYİ VAKİT GEÇİR ✦ ══════╝`,
    ].join('\n'))
    .setFooter({ text: 'REXAL SYSTEMS • Server Architect' })
    .setTimestamp();
}

function buildRulesEmbed() {
  return new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle('╔══════ ✦ KURALLAR ✦ ══════╗')
    .setDescription([
      `# 📜 𝐊 𝐔 𝐑 𝐀 𝐋 𝐋 𝐀 𝐑`,
      `\`${THIN_DIVIDER}\``,
      `> 1️⃣ **SAYGI** — Herkese karşı saygılı ol.`,
      `> 2️⃣ **SPAM** — Flood/spam yasak.`,
      `> 3️⃣ **REKLAM** — Hiçbir yerde reklam yok.`,
      `> 4️⃣ **NSFW** — Anında kalıcı ban.`,
      `> 5️⃣ **KONU** — Her kanal kendi konusunda.`,
      `> 6️⃣ **YETKİLİ** — Yetkilinin sözü geçerli.`,
      ``,
      `╚═══ ✦ İHLAL = CEZA ✦ ═══╝`,
    ].join('\n'))
    .setFooter({ text: 'REXAL SYSTEMS • Server Architect' })
    .setTimestamp();
}

export default {
  name: 'template',
  aliases: ['templat', 'sunucukur', 'protemplate'],
  description: 'REXAL — Pro Sunucu Template Motoru (YIKICI)',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.danger)
      .setAuthor({ name: `${BRAND.name} • Server Architect ${BRAND.version}` })
      .setTitle('🏗️ REXAL — Pro Sunucu Template Motoru')
      .setDescription([
        UX.header, UX.footerLine, '',
        statusLine([['🏗️', 'Mod', 'Yıkıcı'], ['🧱', 'Katman', '8 Kategori'], ['🎭', 'Rol', '8 Tier']]),
        '',
        section('⚠️ Bu Komut Neler Yapar?'),
        `> ${UX.dot2} ${bullet('💣', 'Silir', 'Bu sunucudaki TÜM kanalları ve rolleri SILER')}`,
        `> ${UX.dot2} ${bullet('🎭', 'Roller', '9 tier rol hiyerarşisi + izin matrisi kurar')}`,
        `> ${UX.dot2} ${bullet('🏛️', 'Kategoriler', '8 kategori, 30+ kanal, her kanalda kullanım kılavuzu')}`,
        `> ${UX.dot2} ${bullet('🔐', 'İzinler', 'Rol bazlı görünürlük + kanal bazlı yazma kilidi')}`,
        '',
        section('Kurulacak Kategoriler'),
        STRUCTURE_PLAN.map(c => `> ${c.category}`).join('\n'),
        '',
        `> 💣 **BU İŞLEM GERİ ALINAMAZ!** Her şey silinecek ve yeniden kurulacak.`,
        `> ✅ Sadece komutu yazan kişi onaylayabilir.`,
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    await message.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`template:onay:${message.author.id}`).setLabel('HER ŞEYİ SİL VE KUR').setEmoji('💣').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`template:iptal:${message.author.id}`).setLabel('İptal').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
      )],
    });
  },

  async onButton(interaction, action) {
    // customId: template:<aksiyon>:<komutuYazanId> — sadece o kişi onaylayabilir
    const ownerId = action[1];
    if (interaction.user.id !== ownerId) {
      return interaction.reply({ content: '❌ Bu onay sadece komutu yazan kişiye açık.', ephemeral: true });
    }

    if (action[0] === 'iptal') {
      return interaction.update({ content: '✅ İptal edildi — hiçbir şey değişmedi.', embeds: [], components: [] });
    }

    if (action[0] === 'onay') {
      const guild = interaction.guild;
      if (!guild) return interaction.reply({ content: '❌ Bu komut sadece sunucuda çalışır.', ephemeral: true });

      const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
      if (!me || !me.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ Bot bu işlem için **Administrator** yetkisine ihtiyaç duyar.', ephemeral: true });
      }

      await interaction.update({ content: '🏗️ **Template kurulumu başlıyor...** İlerlemeyi DMden takip et, bu birkaç dakika sürebilir.', embeds: [], components: [] });

      // Kanallar silineceği için ilerleme raporlarını DM'e gönderiyoruz
      const dm = await interaction.user.createDM().catch(() => null);
      const dmProgress = async (msg) => { if (dm) await dm.send(msg).catch(() => { }); };

      try {
        // 1) Yık
        await dmProgress('🗑️ **1/3** Eski kanallar ve roller siliniyor...');
        await wipeGuild(guild);
        await sleep(2000);

        // 2) Kur
        await dmProgress('🏗️ **2/3** Yeni rol/kategori/kanal mimarisi kuruluyor...');
        const { report } = await buildServer(guild);

        // 3) Welcome + rules
        await dmProgress('✨ **3/3** Karşılama panelleri yazılıyor...');
        const welcome = guild.channels.cache.find(c => c.name.includes('hoşgeldin'));
        const rules = guild.channels.cache.find(c => c.name.includes('kuralları'));
        if (welcome) await welcome.send({ embeds: [buildWelcomeEmbed(guild)] }).catch(() => { });
        if (rules) await rules.send({ embeds: [buildRulesEmbed()] }).catch(() => { });

        // 4) Komutu yazana KURUCU rolü ver — yoksa hiçbir kanalı göremez!
        try {
          const founderRole = guild.roles.cache.find(r => r.name.includes('KURUCU'));
          const memberRole = guild.roles.cache.find(r => r.name.includes('Üye'));
          const me = await guild.members.fetch(interaction.user.id);
          if (founderRole) await me.roles.add(founderRole, 'REXAL Template — kurucu rolü');
          if (memberRole) await me.roles.add(memberRole, 'REXAL Template — üye rolü');
          await dmProgress('👑 **Sana KURUCU ve Üye rolleri verildi!** Kanalları artık görebilirsin.');
        } catch (err) {
          await dmProgress(`⚠️ Rol atama hatası: ${err.message} — rolü elle ver: Sunucu Ayarları > Roller`);
        }

        const summary = new EmbedBuilder()
          .setTitle('🏗️ Template Kurulumu Tamamlandı!')
          .setColor(COLORS.success)
          .setDescription([
            `\`${THIN_DIVIDER}\``,
            `> 🎭 **Rol:** \`${report.roles}/${ROLE_PLAN.length}\` kuruldu`,
            `> 🏛️ **Kategori:** \`${report.categories}/${STRUCTURE_PLAN.length}\` kuruldu`,
            `> 💬 **Kanal:** \`${report.channels}\` kuruldu`,
            report.failed.length > 0
              ? `\n⚠️ **Bazı parçalar kurulamadı** (yetki/Discord limiti):\n${report.failed.slice(0, 5).map(f => `> ${f}`).join('\n')}`
              : `\n> ✅ **Sıfır hata — mükemmel kurulum!**`,
            '',
            `> 🎁 Karşılama ve kurallar panelleri otomatik yazıldı.`,
            `> ♾️ *Sunucu artık PRO seviyede.*`,
          ].join('\n'))
          .setFooter(FOOTER())
          .setTimestamp();

        // Final raporu: yeni kurulan ilk yazılabilir kanala + DM'e
        const anyChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.viewable);
        if (anyChannel) await anyChannel.send({ embeds: [summary] }).catch(() => { });
        if (dm) await dm.send({ embeds: [summary] }).catch(() => { });
      } catch (err) {
        console.error('[Template] Kurulum hatası:', err);
        await dmProgress(`❌ Kurulum hatası: ${err.message}`);
      }
    }
  },
};
