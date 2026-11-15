// src/index.js
import { Client, Collection, GatewayIntentBits, Partials, ChannelType } from 'discord.js';
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
import { startSubscriptionChecker } from './utils/subscriptionChecker.js';

dotenv.config();

let playtimeStarted = false; 

// ── Tek-instance kilidi ─────────────────────────────────────────
import os from 'node:os';
const LOCK_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'bot.lock');
try {
  if (fs.existsSync(LOCK_PATH)) {
    const oldPid = parseInt(fs.readFileSync(LOCK_PATH, 'utf8').trim(), 10);
    if (oldPid && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0); 
        console.error(`❌ Bot zaten çalışıyor (PID ${oldPid})! İkinci kopya başlatılmaz.`);
        process.exit(1);
      } catch { }
    }
  }
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  fs.writeFileSync(LOCK_PATH, String(process.pid), 'utf8');
} catch (err) {
  console.warn('⚠️ Kilit dosyası yazılamadı:', err.message);
}
process.on('exit', () => { try { if (fs.readFileSync(LOCK_PATH, 'utf8').trim() === String(process.pid)) fs.unlinkSync(LOCK_PATH); } catch {} });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 🚨 BOT AYARLARI VE İZİNLER (EKran görüntüsüne göre tamamen doğru)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages, 
  ],
  partials: [Partials.Message, Partials.Channel, Partials.DirectMessage],
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
    if (command.aliases) {
      for (const alias of command.aliases) {
        client.commands.set(alias, command);
      }
    }
  }
}

console.log(`📦 ${client.commands.size} komut yüklendi.`);

// ── customId yönlendirmesi ──────────────────────────────────────────────────
const CUSTOM_ID_ROUTES = {
  vault: 'hesaplarim', aktif: 'online', tokensil: 'tokensil', owo: 'owo', autotyper: 'autotyper',
  voiceafk: 'voiceafk', otoreact: 'otoreact', autoleave: 'autoleave', joiner: 'joiner',
  profilechanger: 'profilechanger', friendcleaner: 'friendcleaner', checker: 'checker',
  otomesaj: 'otomesaj', dmsender: 'dmsender', giveawayfarmer: 'giveawayfarmer',
  nitrosniper: 'nitrosniper', aichat: 'aichat', boostcheck: 'boostcheck', template: 'template',
  mobil: 'mobil', surem: 'surem', otobump: 'otobump', mcafk: 'mcafk', spotify: 'spotify',
  rolver: 'rolver', rolal: 'rolal', rol: 'rol', code: 'code', sespaneli: 'sespaneli',
  resimtopla: 'resimtopla', // 🚨 Resim toplama paneli eklendi
  vaultsettings: 'vaultsettings',
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

  startPeriodicPush();
  startSubscriptionChecker(client);

  try {
    resetLiveKeys(); 
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

  setTimeout(registerExistingSessions, 30 * 1000);
  setTimeout(() => {
    processPendingAwards().catch(err => console.error('[Playtime] Bekleyen rol dağıtımı hatası:', err.message));
  }, 45 * 1000);
});

// ── Prefix komutları ────────────────────────────────────────────────────────
const PREFIX = '!';
const CODE_REDEEM_CHANNEL_ID = 'BURAYA_KOD_KANALI_ID'; // ⬅️ BURAYA KODUN KULLANILACAĞI KANALIN ID'SİNİ YAZ

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

// ── DM ÜZERİNDEN MEDYA TOPLAMA SİSTEMİ (ORTAK HAVUZ) ──
if (message.channel.type === ChannelType.DM) {
  const dmCollector = await import('./utils/dmCollector.js');
  const ownerId = dmCollector.activeOwnerId;

  // Eğer aktif bir oturum varsa (Sahip, Başlat butonuna bastıysa)
  if (ownerId) {
    let downloadedCount = 0;
    
    // 1. DOSYA EKLERİNİ (RESİM/DOSYA) KONTROL ET
    if (message.attachments.size > 0) {
      for (const att of message.attachments.values()) {
        try {
          await dmCollector.downloadAttachment(ownerId, att);
          console.log(`[DM Collector] İndirildi (Ek): ${att.name} | Gönderen: ${message.author.tag}`);
          downloadedCount++;
        } catch (err) {
          console.error('[DM Collector] İndirme hatası (Ek):', err);
        }
      }
    }

    // 2. GÖMÜLÜ (EMBED) RESİMLERİ KONTROL ET (İletilen mesajlar veya linkler için)
    if (message.embeds.length > 0) {
      for (const embed of message.embeds) {
        const imageUrl = embed.image?.url || embed.thumbnail?.url;
        if (imageUrl) {
          try {
            const fakeAttachment = { url: imageUrl, name: `embed_${Date.now()}.jpg` };
            await dmCollector.downloadAttachment(ownerId, fakeAttachment);
            console.log(`[DM Collector] İndirildi (Embed): ${fakeAttachment.name} | Gönderen: ${message.author.tag}`);
            downloadedCount++;
          } catch (err) {
            console.error('[DM Collector] İndirme hatası (Embed):', err);
          }
        }
      }
    }

    // 3. İLETİLEN (REPLY/FORWARD) MESAJLARI KONTROL ET
    if (message.reference && message.reference.messageId) {
      try {
        const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
        if (repliedMsg.attachments.size > 0) {
          for (const att of repliedMsg.attachments.values()) {
            await dmCollector.downloadAttachment(ownerId, att);
            console.log(`[DM Collector] İndirildi (İletilen): ${att.name} | Gönderen: ${message.author.tag}`);
            downloadedCount++;
          }
        }
      } catch (e) {}
    }

    if (downloadedCount > 0) {
      const total = dmCollector.getUserImageCount(ownerId);
      await message.reply(`✅ **${downloadedCount}** dosya havuza eklendi! (Toplam: **${total}**)`);
    } else if (message.content.trim().length > 0) {
      await message.reply('⚠️ Dosya algılanamadı! Lütfen resmi **dosya olarak (+ butonu ile)** gönderin. Link atarsanız bot göremez.');
    }
  } else {
    // Oturum yoksa sadece bilgi ver, kimseye kaydetme
    // await message.reply('⚠️ Şu an kimse resim toplamıyor.');
  }
  return;
}

  // ── KOD KULLANMA (Sadece Belirlenen Kanalda ve RX- ile başlıyorsa) ──
  if (message.channel.id === CODE_REDEEM_CHANNEL_ID && message.content.startsWith('RX-')) {
    const codeCommand = client.commands.get('code');
    if (codeCommand) {
      try {
        await codeCommand.execute(message, [message.content.trim()]);
      } catch (err) {
        console.error('❌ Kod kullanma hatası:', err);
      }
    }
    return; 
  }
  
  // Sosyal medya doğrulama sistemi
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

// ── Process-seviyesi güvenlik ──────────────
process.on('unhandledRejection', (err) => {
  console.error('⚠️ [UnhandledRejection]', err);
});

process.on('uncaughtException', (err) => {
  console.error('💥 [UncaughtException] Bot ayakta kalmaya devam ediyor:', err);
});

// ── Buluttan state indir ve giriş yap ────────────────────────────
if (isCloudEnabled()) {
  pullFromCloud()
    .catch(err => console.error('[CloudStore] Bulut indirilemedi, lokal data ile devam:', err.message))
    .finally(() => client.login(process.env.DISCORD_TOKEN));
} else {
  client.login(process.env.DISCORD_TOKEN);
}

// ── ⏱️ Süre motoru ─────────────
function startPlaytimeEngine() {
  if (playtimeStarted) return;
  playtimeStarted = true;

  setInterval(() => {
    try { heartbeat(); } catch (err) { console.error('[Playtime] heartbeat hatası:', err.message); }
  }, 30 * 1000);

  setInterval(() => {
    try {
      // BUG FIX: sadece liveKeys'teki değil, playtime.json'daki TÜM kullanıcılar
      // taranır — böylece reboot recovery ile geri gelen modüller de
      // (markStart çağrılmadan) süre motoruna yeniden kaydedilir.
      const users = new Set([...listTrackedUsers(), ...getPlaytimeUsers()]);
      for (const userId of users) {
        try {
          syncUser(userId);
        } catch (userErr) {}
      }
    } catch (err) {
      console.error('[Playtime] genel senkron hatası:', err.message);
    }
  }, 60 * 1000);
}

function registerExistingSessions() {
  try {
    const users = getPlaytimeUsers();
    let active = 0;
    for (const userId of users) {
      try {
        // syncUser async — fire-and-forget, hata izole edilir
        Promise.resolve(syncUser(userId)).then(res => {
          if (res && Array.isArray(res.active)) {
            active += res.active.length;
          }
        }).catch(() => {});
      } catch (userErr) {
        console.warn(`[Playtime] ${userId} başlangıç kaydı yapılamadı:`, userErr.message);
      }
    }
    setTimeout(() => {
      if (active > 0) console.log(`⏱️ [Playtime] ${active} canlı sistem süre motoruna kaydedildi.`);
    }, 15 * 1000);
  } catch (err) {
    console.error('[Playtime] recovery kayıt hatası:', err.message);
  }
}

// ── Graceful shutdown ──────────────────
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
