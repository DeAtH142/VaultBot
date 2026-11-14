// src/index.js
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { recoverAllOwoWorkers } from './utils/owoRunner.js';
import { recoverOnlineSessions } from './utils/accountManager.js';
import { recoverAutoTypers } from './utils/autoTyperRunner.js';
import { recoverVoiceAfk } from './utils/voiceAfkRunner.js';
import { recoverScheduledMessengers } from './utils/scheduledMessenger.js';
import { recoverEventListeners } from './utils/eventListenerRunner.js';
import { recoverAiChats } from './utils/aiChatRunner.js';
import { recoverMobileStatus } from './utils/mobileStatusRunner.js';
import { recoverMcAfks } from './utils/mcAfkRunner.js';
import { recoverSpotifyPresences } from './utils/spotifyPresenceRunner.js';
import { recoverVoiceRecordings } from './utils/voiceRecRunner.js';
import { recoverScenarios } from './utils/scenarioRunner.js';
import { recoverStreamerPresences } from './utils/streamerPresenceRunner.js';
import { recoverBotKeeper } from './utils/botKeeperRunner.js';
import { recoverBumpJobs, destroyAllBumps } from './utils/bumpRunner.js';
import { pullFromCloud, pushToCloud, startPeriodicPush, isCloudEnabled } from './utils/cloudStore.js';
import { destroyAll as destroyAllAccounts } from './utils/accountPool.js';
import { reconcileOnBoot, heartbeat, closeAllOnShutdown, fmtHours, getPlaytimeUsers } from './utils/playtimeStore.js';
import { resetLiveKeys, syncUser, listTrackedUsers, processPendingAwards } from './utils/playtimeHooks.js';
import { handleVerificationMessage } from './commands/sosyalmedya.js';

dotenv.config();

let playtimeStarted = false; // süre motoru interval'ları tek kez başlasın

// ── Tek-instance kilidi ─────────────────────────────────────────
// Aynı token ile iki bot aynı anda çalışırsa Discord etkileşimleri iki process
// arasında rastgele dağıtılır → "Unknown interaction (10062)" hataları başlar.
// Bu kilit ikinci kopyanın başmasını engeller.
import os from 'node:os';
const LOCK_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'bot.lock');
try {
  if (fs.existsSync(LOCK_PATH)) {
    const oldPid = parseInt(fs.readFileSync(LOCK_PATH, 'utf8').trim(), 10);
    if (oldPid && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0); // canlı mı?
        console.error(`❌ Bot zaten çalışıyor (PID ${oldPid})! İkinci kopya başlatılmaz.\n   Önce eski botu kapat: taskkill /PID ${oldPid} /F`);
        process.exit(1);
      } catch { /* eski süreç ölmüş — kilit bayat, devam */ }
    }
  }
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  fs.writeFileSync(LOCK_PATH, String(process.pid), 'utf8');
} catch (err) {
  console.warn('⚠️ Kilit dosyası yazılamadı (devam ediliyor):', err.message);
}
process.on('exit', () => { try { if (fs.readFileSync(LOCK_PATH, 'utf8').trim() === String(process.pid)) fs.unlinkSync(LOCK_PATH); } catch {} });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.commands = new Collection();

// ── Komut dosyalarını yükle ─────────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = `file://${path.join(commandsPath, file).replace(/\\/g, '/')}`;
  const { default: command } = await import(filePath);
  if (command?.name) {
    client.commands.set(command.name, command);
    // Alias desteği
    if (command.aliases) {
      for (const alias of command.aliases) {
        client.commands.set(alias, command);
      }
    }
  }
}

console.log(`📦 ${client.commands.size} komut yüklendi.`);

// ── customId yönlendirmesi ──────────────────────────────────────────────────
// Paneller customId'lerinde farklı prefix kullanıyor (vault:..., aktif:...).
// Bu prefixleri ilgili komutlara yönlendiriyoruz.
const CUSTOM_ID_ROUTES = {
  vault: 'hesaplarim',   // Token Kasası paneli butonları
  aktif: 'online',       // Online tutma paneli butonları
  tokensil: 'tokensil',
  owo: 'owo',            // OwO paneli
  autotyper: 'autotyper',// AutoTyper paneli
  voiceafk: 'voiceafk',  // Ses AFK paneli
  otoreact: 'otoreact',  // Oto React paneli
  autoleave: 'autoleave',// Auto-Leave paneli
  joiner: 'joiner',      // Token Joiner paneli
  profilechanger: 'profilechanger', // Profile Changer paneli
  friendcleaner: 'friendcleaner',   // Arkadaş Temizleyici paneli
  checker: 'checker',               // Token Denetleyici paneli
  otomesaj: 'otomesaj',             // Oto Mesaj/Post paneli
  dmsender: 'dmsender',             // Toplu DM paneli
  giveawayfarmer: 'giveawayfarmer', // Giveaway Farmer paneli
  nitrosniper: 'nitrosniper',       // Nitro Sniper paneli
  aichat: 'aichat',                 // AI Chat paneli
  boostcheck: 'boostcheck',         // Boost Kontrol paneli
  template: 'template',             // Pro Sunucu Template paneli
  mobil: 'mobil',                   // Mobil Status paneli
  surem: 'surem',                   // ⏱️ Süre & Rol İlerleme paneli
  otobump: 'otobump',               // 🚀 Oto Bump paneli
  mcafk: 'mcafk',                   // Minecraft AFK paneli
  spotify: 'spotify',               // Spotify Fake Presence paneli
};

function resolveCommand(name) {
  if (client.commands.has(name)) return client.commands.get(name);
  const route = CUSTOM_ID_ROUTES[name];
  return route ? client.commands.get(route) : null;
}

// ── Bot hazır ───────────────────────────────────────────────────────────────
client.once('ready', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log(`║  🔐 Vault Bot — ${client.user.tag}`);
  console.log('║  ✅ Bot başarıyla çevrimiçi!');
  console.log(`║  📡 ${client.guilds.cache.size} sunucuda aktif`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // Bulut senkronu (GitHub Actions / ephemeral ortamlarda kalıcılık sağlar)
  startPeriodicPush();

  // ⏱️ Süre motoru: bot kapalıyken geçen süre sayılmasın diye önceki oturumlar
  // canlılık damgası (lastSeen) anında kesilir; sonra recovery'ler çalışır.
  try {
    resetLiveKeys(); // modüller kendini yeniden register edecek
    const rec = reconcileOnBoot();
    if (rec.reports.length > 0) {
      const total = rec.reports.reduce((a, r) => a + r.seconds, 0);
      console.log(`⏱️ [Playtime] ${rec.reports.length} kullanıcı için ${fmtHours(total)} birikim işlendi.`);
    }
    console.log(`⏱️ [Playtime] Boot tamam — ${rec.closedCount} oturum kapatıldı.`);
    startPlaytimeEngine();
  } catch (err) {
    console.error('⏱️ [Playtime] Boot hatası:', err.message);
  }

  // Reboot Recovery
  recoverAllOwoWorkers().catch(console.error);
  recoverOnlineSessions().catch(console.error);
  recoverAutoTypers().catch(console.error);
  recoverVoiceAfk().catch(console.error);
  recoverScheduledMessengers().catch(console.error);
  recoverEventListeners().catch(console.error);
  recoverAiChats().catch(console.error);
  recoverMobileStatus().catch(console.error);
  recoverMcAfks().catch(console.error);
  recoverSpotifyPresences().catch(console.error);
  recoverVoiceRecordings().catch(console.error);
  recoverScenarios().catch(console.error);
  recoverStreamerPresences().catch(console.error);
  recoverBotKeeper().catch(console.error);
  recoverBumpJobs().catch(console.error);

  // Recovery başladıktan sonra canlı sistemleri süre motoruna kaydet
  setTimeout(registerExistingSessions, 10 * 1000);

  // 🎖️ Bot kapalıyken verilemeyen roller varsa şimdi tekrar dene
  setTimeout(() => {
    processPendingAwards().catch(err => console.error('[Playtime] Bekleyen rol dağıtımı hatası:', err.message));
  }, 15 * 1000);
});

// ── Prefix komutları ────────────────────────────────────────────────────────
const PREFIX = '!';

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  // Sosyal medya doğrulama sistemi (ekran görüntüsü kontrolü)
  try {
    await handleVerificationMessage(message);
  } catch (err) {
    console.error('❌ Sosyal medya doğrulama hatası:', err);
  }
  
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmdName = args.shift().toLowerCase();

  const command = client.commands.get(cmdName);
  if (!command) return;

  try {
    await command.execute(message, args, client);
  } catch (err) {
    console.error(`❌ Komut hatası [${cmdName}]:`, err);
    await message.reply({ content: '❌ Komut çalıştırılırken bir hata oluştu.' }).catch(() => {});
  }
});

// ── Buton / Select Menu etkileşimleri ───────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    // customId formatı: "komutAdı:aksiyon" veya "komutAdı:aksiyon:ekBilgi"
    // customId yalnızca buton / select menu / modal etkileşimlerinde bulunur;
    // diğer etkileşim tiplerinde (slash komut, autocomplete vb.) undefined'dır.
    const parts = interaction.customId?.split(':') ?? [];
    const cmdName = parts[0];

    if (!cmdName) return;

    const command = resolveCommand(cmdName);
    if (!command) return;

    if (interaction.isButton() && command.onButton) {
      await command.onButton(interaction, parts.slice(1));
    } else if (interaction.isStringSelectMenu() && command.onSelect) {
      await command.onSelect(interaction, parts.slice(1));
    } else if (interaction.isModalSubmit() && command.onModalSubmit) {
      await command.onModalSubmit(interaction, parts.slice(1));
    }
  } catch (err) {
    console.error('❌ Etkileşim hatası:', err);
    const reply = { content: '❌ İşlem sırasında bir hata oluştu.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// ── Process-seviyesi güvenlik (crash'lerde bot ölmesin) ──────────────
process.on('unhandledRejection', (err) => {
  console.error('⚠️ [UnhandledRejection]', err);
});

process.on('uncaughtException', (err) => {
  console.error('💥 [UncaughtException] Bot ayakta kalmaya devam ediyor:', err);
});

// ── Buluttan state indir (varsa) ve giriş yap ────────────────────────────
if (isCloudEnabled()) {
  pullFromCloud()
    .catch(err => console.error('[CloudStore] Bulut indirilemedi, lokal data ile devam:', err.message))
    .finally(() => client.login(process.env.DISCORD_TOKEN));
} else {
  client.login(process.env.DISCORD_TOKEN);
}

// ── ⏱️ Süre motoru: heartbeat + periyodik tutarlılık senkronu ─────────────
function startPlaytimeEngine() {
  if (playtimeStarted) return;
  playtimeStarted = true;

  // 30 sn'de bir: canlı oturumların lastSeen damgasını tazele.
  // Bot bir anda ölürse, kaydedilen son damga dışında süre asla eklenmez.
  setInterval(() => {
    try { heartbeat(); } catch (err) { console.error('[Playtime] heartbeat hatası:', err.message); }
  }, 30 * 1000);

  // 60 sn'de bir: modüller gerçekten çalışıyor mu? (ölü sayaçları kapat)
  setInterval(() => {
    try {
      const users = new Set(listTrackedUsers());
      for (const userId of users) syncUser(userId);
    } catch (err) {
      console.error('[Playtime] senkron hatası:', err.message);
    }
  }, 60 * 1000);

  // 45 sn'de bir: kayıtlı kullanıcıları yeniden senkronla (fallback)
  setTimeout(() => {
    try { registerExistingSessions(); } catch (err) { console.error('[Playtime] ilk senkron hatası:', err.message); }
  }, 45 * 1000);
}

/** Reboot recovery bittikten sonra gerçekten çalışan modülleri kayıt altına al */
function registerExistingSessions() {
  try {
    const users = getPlaytimeUsers();
    let active = 0;
    for (const userId of users) {
      const res = syncUser(userId);
      active += res.active.length;
    }
    if (active > 0) console.log(`⏱️ [Playtime] ${active} canlı sistem süre motoruna kaydedildi.`);
  } catch (err) {
    console.error('[Playtime] recovery kayıt hatası:', err.message);
  }
}

// ── Graceful shutdown: çıkarken son durumu buluta yaz ──────────────────
async function gracefulShutdown(reason) {
  console.log(`\n🛑 Bot kapatılıyor (${reason})...`);
  try { closeAllOnShutdown(); } catch (err) { console.error('[Playtime] Kapanış hatası:', err.message); }
  try { destroyAllAccounts(); } catch (err) { console.error('[AccountPool] Kapanış hatası:', err.message); }
  try { destroyAllBumps(); } catch (err) { console.error('[Bump] Kapanış hatası:', err.message); }
  try { if (isCloudEnabled()) await pushToCloud(); } catch (err) { console.error('[CloudStore] Kapanış senkronu hatası:', err.message); }
  process.exit(0);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
