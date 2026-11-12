// src/utils/owoRunner.js — PRO EDITION
// OwO otomasyon motoru: oto-quest, oto-gem, akıllı sell, kazanç takibi, earn raporu.
import { Client } from 'discord.js-selfbot-v13';
import { decrypt } from './crypto.js';
import { getToken } from './tokenStore.js';
import { getOwoConfig, getAllOwoConfigs, saveOwoConfig } from './owoStore.js';
import { solve2Captcha } from './captchaSolver.js';
import { parseOwnedGemsFromInventory, selectBestGemsToUse } from './gemManager.js';

// OwO Bot Resmi Discord ID'si
const OWO_BOT_ID = '408785106942164992';

// Çalışan bot oturumları ve state'leri: `${userId}:${tokenIndex}` -> State
const runningWorkers = new Map();

// Durdurulan oturumların son kazanç raporları: `${userId}:${tokenIndex}` -> Report
const lastSessionReports = new Map();

// ── 💾 KALICI İSTATİSTİK DOSYASI ───────────────────────────────────────
// Restart'ta kazanç takibi kaybolmasın diye her işlemde diske yazılır.
import fs from 'node:fs';
import path from 'node:path';

const STATS_DIR = path.join(process.cwd(), 'data');
const STATS_PATH = path.join(STATS_DIR, 'owo_stats.json');

function ensureStatsFile() {
  if (!fs.existsSync(STATS_DIR)) fs.mkdirSync(STATS_DIR, { recursive: true });
  if (!fs.existsSync(STATS_PATH)) fs.writeFileSync(STATS_PATH, '{}', 'utf8');
}

function readStatsStore() {
  ensureStatsFile();
  try {
    return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeStatsStore(store) {
  ensureStatsFile();
  fs.writeFileSync(STATS_PATH, JSON.stringify(store, null, 2), 'utf8');
}

/** Kalıcı istatistikleri yükle (yoksa sıfırdan başla) */
function loadPersistentStats(userId, tokenIndex) {
  const store = readStatsStore();
  const saved = store[`${userId}:${tokenIndex}`];
  if (saved) {
    // "" (boş string) kayıtları null'a çevir — "" - "" = NaN hesap hatalarını önler
    const numOrNull = (v) => (v === '' || v === undefined || v === null || isNaN(v) ? null : Number(v));
    console.log(`📊 [OwORunner] Kalıcı istatistikler yüklendi (${userId}:${tokenIndex}) — ${saved.hunts} hunt kayıtlı.`);
    return {
      hunts: saved.hunts || 0,
      battles: saved.battles || 0,
      questsGrabbed: saved.questsGrabbed || 0,
      gemsEquipped: saved.gemsEquipped || 0,
      sells: saved.sells || 0,
      gambles: saved.gambles || 0,
      loots: saved.loots || 0,
      dailies: saved.dailies || 0,
      prays: saved.prays || 0,
      cookies: saved.cookies || 0,
      checklist: saved.checklist || 0,
      animalsCaught: saved.animalsCaught || 0,
      cowoncyStart: numOrNull(saved.cowoncyStart),
      cowoncyLast: numOrNull(saved.cowoncyLast),
      peakCowoncy: numOrNull(saved.peakCowoncy),
      lowestCowoncy: numOrNull(saved.lowestCowoncy),
      rareFindings: Array.isArray(saved.rareFindings) ? saved.rareFindings.slice(-20) : [],
    };
  }
  return {
    hunts: 0, battles: 0, questsGrabbed: 0, gemsEquipped: 0, sells: 0,
    gambles: 0, loots: 0, dailies: 0, prays: 0, cookies: 0, checklist: 0,
    animalsCaught: 0, cowoncyStart: null, cowoncyLast: null,
    peakCowoncy: null, lowestCowoncy: null, rareFindings: [],
  };
}

/** İstatistikleri diske yaz (throttle'lu — her saniyeden fazla çağrılmasın) */
const statsSaveTimers = new Map();
function savePersistentStats(userId, tokenIndex, stats) {
  const key = `${userId}:${tokenIndex}`;
  if (statsSaveTimers.has(key)) return; // zaten bekleyen kayıt var
  statsSaveTimers.set(key, setTimeout(() => {
    statsSaveTimers.delete(key);
    try {
      const store = readStatsStore();
      store[key] = { ...stats, rareFindings: stats.rareFindings.slice(-20), savedAt: new Date().toISOString() };
      writeStatsStore(store);
    } catch (err) {
      console.error('[OwORunner] İstatistik kaydetme hatası:', err.message);
    }
  }, 5000)); // en fazla 5 saniyede bir diske yaz
}

/** Kalıcı istatistikleri sıfırla (kullanıcı sıfırlama talebi) */
export function resetPersistentStats(userId, tokenIndex) {
  try {
    const store = readStatsStore();
    delete store[`${userId}:${tokenIndex}`];
    writeStatsStore(store);
  } catch {}
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fmt(n) {
  return (n ?? 0).toLocaleString('tr-TR');
}

/** OwO mesajlarındaki "x,xxx" sayılarını yakalar (örn. cowoncy, xp) */
function extractNumber(text, patterns) {
  if (!text) return null;
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1].replace(/[,.\s]/g, ''), 10);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

/** OwO hunt/battle yanıtlarından hayvan & kazanç bilgisi çıkarır */
function parseHuntResult(text) {
  if (!text) return null;
  const res = {
    isHunt: /hunt/i.test(text),
    animals: extractNumber(text, [
      /you found \*\*(\d+)/i,
      /caught \*\*(\d+)/i,
      /\+(\d+)\s*animals/i,
    ]),
    cowoncy: extractNumber(text, [
      /you earned \*\*([\d,.]+)\*\* cowoncy/i,
      /received \*\*([\d,.]+)\*\* cowoncy/i,
    ]),
    xp: extractNumber(text, [/xp/i.test(text) ? /\*\*(\d+)\*\* xp/i : /$^/i]),
    tier: null,
  };
  // Nadirlik tespiti
  for (const [tier, re] of Object.entries({
    gem: /gem(rank)?\s*(animal)?/i,
    mythic: /mythic/i,
    legendary: /legendary/i,
    epic: /epic/i,
    rare: /rare/i,
    uncommon: /uncommon/i,
    hidden: /hidden/i,
  })) {
    if (re.test(text)) { res.tier = tier; break; }
  }
  return res;
}

/** OwO cash/mesajlardan bakiye çıkarır */
function parseCowoncy(text) {
  return extractNumber(text, [
    /you have \*\*([\d,.]+)\*\* cowoncy/i,
    /\*\*([\d,.]+)\*\* cowoncy/i,
    /cowoncy:\s*\*\*([\d,.]+)\*\*/i,
  ]);
}

/**
 * OwO döngüsünü başlat (PRO SEQUENCE)
 */
export async function startOwoAutomation(userId, tokenIndex) {
  const workerKey = `${userId}:${tokenIndex}`;

  // Varsa önce eskisini temizle
  stopOwoAutomation(userId, tokenIndex, { silent: true });

  const config = getOwoConfig(userId, tokenIndex);
  if (!config || !config.enabled || !config.channelIds || config.channelIds.length === 0) {
    return { success: false, error: 'Yapılandırma eksik veya kanal belirtilmemiş!' };
  }

  const tokenObj = getToken(userId, tokenIndex);
  if (!tokenObj) {
    return { success: false, error: 'Hesap tokeni bulunamadı!' };
  }

  try {
    const rawToken = decrypt(tokenObj);
    const client = new Client({ checkUpdate: false });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Discord bağlantı zaman aşımı!')), 15000);

      client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      client.login(rawToken).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const state = {
      client,
      userId,
      tokenIndex,
      config,
      channelIndex: 0,
      running: true,
      commandsCount: 0,
      huntCountSinceSell: 0,
      huntCountSinceGemCheck: 0,
      huntsSinceGamble: 0,
      lastPrayTime: 0,
      lastDailyTime: 0,
      lastQuestTime: 0,
      lastCowoncyCheckTime: 0,
      startTime: Date.now(),
      timer: null,
      isSleeping: false,
      isSolvingCaptcha: false,
      waitingForInventory: false,
      waitingForCowoncy: false,
      latestInventoryText: '',
      latestCowoncyText: '',
      lastCowoncy: null,

      // 📈 KAZANÇ TAKİBİ — kalıcı (restart'ta sıfırlanmaz)
      stats: loadPersistentStats(userId, tokenIndex),
    };

    runningWorkers.set(workerKey, state);

    // ── 🛡️ Mesaj Dinleyicisi: Captcha / Envanter / Cowoncy / Hunt Takibi ────
    client.on('messageCreate', async (msg) => {
      if (msg.author.id !== OWO_BOT_ID) return;

      const content = msg.content || '';
      const lower = content.toLowerCase();
      const mentionsMe = msg.mentions?.users?.has(client.user.id) ||
        lower.includes(client.user.username.toLowerCase()) ||
        lower.includes(client.user.id);

      // A) Envanter Mesajı Yakalama (owo inv)
      // NOT: OwO bazen mention etmeden cevap verir; inventory kelimesi yeterli.
      if (state.waitingForInventory && (mentionsMe || lower.includes('inventory') || lower.includes('envanter'))) {
        state.latestInventoryText = content + '\n' + (msg.embeds?.[0]?.description || '') + '\n' +
          (msg.embeds?.map(e => e.fields?.map(f => f.value).join('\n')).join('\n') || '');
        state.waitingForInventory = false;
        console.log('📦 [OwORunner] Envanter yakalandı, gem analizi yapılıyor...');
      }

      // A2) Gem kullanım cevabı (owo use ...) — taşın gerçekten takıldığını doğrula
      if (mentionsMe && (lower.includes('gem') || lower.includes('use') || lower.includes('equip'))) {
        if (/use[d]?|activat|equipped/i.test(lower) && !/invalid|don't have|not have/i.test(lower)) {
          console.log('💎 [OwORunner] Gem kuşanma onayı alındı!');
        }
      }

      // B) Cowoncy bakiyesi yakalama (owo cowoncy) — mention şart değil
      if (state.waitingForCowoncy && (mentionsMe || lower.includes('cowoncy'))) {
        const bal = parseCowoncy(content + ' ' + (msg.embeds?.[0]?.description || '') + ' ' +
          (msg.embeds?.map(e => e.fields?.map(f => f.value).join(' ')).join(' ') || ''));
        if (bal !== null) {
          state.latestCowoncyText = bal;
          state.waitingForCowoncy = false;
        }
      }

      // C) Hunt / Battle sonucu takibi — mention şart değil;
      // OwO'nun bu hesaba ait hunt/battle cevaplarını her mesajda dene.
      {
        const hunt = parseHuntResult(content);
        if (hunt && (hunt.isHunt || hunt.animals)) {
          if (hunt.animals) {
            state.stats.animalsCaught += hunt.animals;
          }
          if (hunt.tier && hunt.tier !== 'uncommon' && hunt.tier !== 'common') {
            state.stats.rareFindings.push({ tier: hunt.tier, at: Date.now() });
            if (state.stats.rareFindings.length > 20) state.stats.rareFindings.shift();
          }
        }
      }

      // C2) Kalıcı cowoncy takibi — her OwO mesajında bakiye görünürse güncelle
      if (!state.waitingForCowoncy && mentionsMe) {
        const bal = parseCowoncy(content);
        if (bal !== null) {
          state.stats.cowoncyLast = bal;
          if (state.stats.cowoncyStart === null) state.stats.cowoncyStart = bal;
          if (state.stats.peakCowoncy === null || bal > state.stats.peakCowoncy) state.stats.peakCowoncy = bal;
          if (state.stats.lowestCowoncy === null || bal < state.stats.lowestCowoncy) state.stats.lowestCowoncy = bal;
        }
      }

      // D) Captcha veya Güvenlik Uyarısı
      const isCaptchaTrigger = mentionsMe && (
        lower.includes('captcha') ||
        lower.includes('verify') ||
        lower.includes('human') ||
        lower.includes('beep boop') ||
        lower.includes('banned')
      );

      if (isCaptchaTrigger) {
        console.warn(`⚠️ [OwORunner] CAPTCHA ALGISI! (${client.user.tag})`);
        state.isSolvingCaptcha = true;

        if (config.captchaKey && config.captchaKey.trim()) {
          console.log(`[OwORunner] 2Captcha ile otomatik çözülüyor...`);
          const attachment = msg.attachments.first()?.url || msg.embeds[0]?.image?.url;

          if (attachment) {
            const solution = await solve2Captcha(config.captchaKey, attachment);
            if (solution) {
              console.log(`✅ [OwORunner] 2Captcha çözümü gönderiliyor: ${solution}`);
              await sleep(randomBetween(2500, 4500));
              await msg.channel.send(solution).catch(() => { });

              await sleep(5000);
              state.isSolvingCaptcha = false;
              console.log(`✨ [OwORunner] Akıllı Captcha Resume: Kaldığı yerden devam ediliyor.`);
              scheduleNextHuntCycle(workerKey, userId, tokenIndex);
              return;
            }
          }
        }

        console.log(`[OwORunner] Güvenlik için otomasyon durduruldu: ${client.user.tag}`);
        stopOwoAutomation(userId, tokenIndex);
        config.enabled = false;
        saveOwoConfig(userId, tokenIndex, config);
      }
    });

    // ── 🚀 Pro Başlangıç Sırası (PRO Start Sequence) ────────────────────────
    // 1) cowoncy kontrolü (başlangıç bakiyesi) → 2) owo daily → 3) owo quest →
    // 4) owo pray → 5) owo sell all → 6) owo equip → 7) owo inv & gem →
    // 8) hunt/battle döngüsü
    runInitialStartSequence(workerKey, userId, tokenIndex, client, config);

    return { success: true, username: client.user.tag };
  } catch (err) {
    console.error(`[OwORunner] Başlatma hatası (${workerKey}):`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Bot ilk başladığında çalışan otomatik açılış rutini (PRO)
 */
async function runInitialStartSequence(workerKey, userId, tokenIndex, client, config) {
  const worker = runningWorkers.get(workerKey);
  if (!worker || !worker.running) return;

  try {
    const channelId = config.channelIds[0];
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (channel && channel.isText()) {
      console.log(`[OwORunner] PRO başlangıç dizisi çalışıyor: (${client.user.tag})`);

      // 0. Başlangıç bakiyesi
      await channel.send('owo cowoncy').catch(() => { });
      worker.waitingForCowoncy = true;
      await sleep(randomBetween(2200, 3500));
      const startBal = typeof worker.latestCowoncyText === 'number' ? worker.latestCowoncyText : null;
      worker.stats.cowoncyStart = worker.stats.cowoncyStart ?? startBal;
      worker.stats.cowoncyLast = startBal ?? worker.stats.cowoncyStart;
      worker.stats.peakCowoncy = worker.stats.peakCowoncy ?? worker.stats.cowoncyStart;
      worker.stats.lowestCowoncy = worker.stats.lowestCowoncy ?? worker.stats.cowoncyStart;

      // 1. owo daily
      await channel.send('owo daily').catch(() => { });
      worker.stats.dailies++;
      worker.lastDailyTime = Date.now();
      await sleep(randomBetween(2500, 3800));

      // 2. owo quest (günlük quest al)
      await channel.send('owo quest').catch(() => { });
      worker.stats.questsGrabbed++;
      worker.lastQuestTime = Date.now();
      await sleep(randomBetween(2500, 3800));

      // 3. owo pray
      const prayCmd = config.targetId ? `owo pray <@${config.targetId}>` : 'owo pray';
      await channel.send(prayCmd).catch(() => { });
      worker.stats.prays++;
      worker.lastPrayTime = Date.now();
      await sleep(randomBetween(2500, 3800));

      // 4. owo sell all (başlangıç temizliği)
      await channel.send('owo sell all').catch(() => { });
      await sleep(randomBetween(2500, 3800));

      // 5. owo equip (en iyi silahı kuşan)
      await channel.send('owo equip').catch(() => { });
      await sleep(randomBetween(2000, 3200));

      // 6. Envanter kontrolü & En iyi gemleri takma
      await equipBestGems(worker, channel);
    }
  } catch (err) {
    console.error('[OwORunner] Başlangıç dizisi hatası:', err.message);
  }

  // Rutin tamamlandı, ana hunt/battle döngüsüne başla
  scheduleNextHuntCycle(workerKey, userId, tokenIndex);
}

/**
 * Envanteri kontrol eder ve en iyi gemleri kuşanır (owo use ID1 ID2 ID3)
 */
async function equipBestGems(worker, channel) {
  try {
    worker.waitingForInventory = true;
    worker.latestInventoryText = '';

    await channel.send('owo inv').catch(() => { });

    // OwO botunun cevabını bekle (max 4.5 sn)
    for (let i = 0; i < 9; i++) {
      await sleep(500);
      if (worker.latestInventoryText) break;
    }

    if (worker.latestInventoryText) {
      const ownedGems = parseOwnedGemsFromInventory(worker.latestInventoryText);
      const bestGems = selectBestGemsToUse(ownedGems);

      if (bestGems.length > 0) {
        await sleep(randomBetween(2000, 3200));
        const useCmd = `owo use ${bestGems.join(' ')}`;
        console.log(`💎 [OwORunner] En iyi taşlar takılıyor: ${useCmd}`);
        await channel.send(useCmd).catch(() => { });
        worker.stats.gemsEquipped += bestGems.length;
        await sleep(randomBetween(2500, 3500));
        savePersistentStats(worker.userId, worker.tokenIndex, worker.stats);
      } else {
        console.log('[OwORunner] Envanterde kullanılabilir taş bulunamadı.');
      }
    }
  } catch (err) {
    console.error('[OwORunner] Gem kuşanma hatası:', err.message);
  } finally {
    worker.waitingForInventory = false;
  }
}

/**
 * Bakiyeyi sorgular (owo cowoncy) ve state'e işler.
 * Bakiye düşükse otomatik "owo sell all" ve küçük gamble temizliği yapar.
 */
async function checkCowoncy(worker, channel) {
  try {
    worker.waitingForCowoncy = true;
    worker.latestCowoncyText = null;

    await channel.send('owo cowoncy').catch(() => { });
    for (let i = 0; i < 9; i++) {
      await sleep(500);
      if (worker.latestCowoncyText !== null) break;
    }

    const bal = worker.latestCowoncyText;
    if (bal !== null) {
      worker.stats.cowoncyLast = bal;
      if (worker.stats.cowoncyStart === null) worker.stats.cowoncyStart = bal;
      if (worker.stats.peakCowoncy === null || bal > worker.stats.peakCowoncy) {
        worker.stats.peakCowoncy = bal;
      }
      if (worker.stats.lowestCowoncy === null || bal < worker.stats.lowestCowoncy) {
        worker.stats.lowestCowoncy = bal;
      }
      const delta = bal - worker.stats.cowoncyStart;
      console.log(`💰 [OwORunner] Cowoncy: ${fmt(bal)} | Oturum kazancı: ${delta >= 0 ? '+' : ''}${fmt(delta)} (${worker.client.user.tag})`);
      savePersistentStats(worker.userId, worker.tokenIndex, worker.stats);
    }
    return bal;
  } catch (err) {
    console.error('[OwORunner] Cowoncy kontrol hatası:', err.message);
    return null;
  } finally {
    worker.waitingForCowoncy = false;
  }
}

/**
 * Ana Hunt / Battle / Pray / Gamble / Quest / Box Döngüsü (PRO)
 */
async function scheduleNextHuntCycle(workerKey, userId, tokenIndex) {
  const worker = runningWorkers.get(workerKey);
  if (!worker || !worker.running || worker.isSolvingCaptcha) return;

  const config = getOwoConfig(userId, tokenIndex);
  if (!config || !config.enabled) {
    stopOwoAutomation(userId, tokenIndex);
    return;
  }

  // Çift döngüyü engelle
  if (worker.timer) clearTimeout(worker.timer);

  // 1. Auto-Sleep Kontrolü
  if (worker.commandsCount >= randomBetween(75, 100)) {
    worker.isSleeping = true;
    worker.commandsCount = 0;
    const sleepDurationMinutes = randomBetween(3, 6);
    console.log(`💤 [OwORunner] Auto-Sleep devrede: ${worker.client.user.tag} (${sleepDurationMinutes} dakika dinleniyor...)`);

    worker.timer = setTimeout(async () => {
      worker.isSleeping = false;
      console.log(`⏰ [OwORunner] Uykudan uyanıldı: (${worker.client.user.tag}) Kutular açılıyor...`);

      try {
        const sleepChannelId = config.channelIds[0];
        const sleepChannel = await worker.client.channels.fetch(sleepChannelId).catch(() => null);
        if (sleepChannel && sleepChannel.isText()) {
          await sleepChannel.send('owo lb all').catch(() => { });
          worker.stats.loots++;
          await sleep(randomBetween(2500, 3800));
          await sleepChannel.send('owo crate all').catch(() => { });
          await sleep(randomBetween(2500, 3800));

          await equipBestGems(worker, sleepChannel);
        }
      } catch (e) { }

      scheduleNextHuntCycle(workerKey, userId, tokenIndex);
    }, sleepDurationMinutes * 60 * 1000);
    return;
  }

  // 2. Aktif Kanalı Al (Kanal Rotasyonu)
  const channelId = config.channelIds[worker.channelIndex % config.channelIds.length];
  worker.channelIndex++;

  try {
    const channel = await worker.client.channels.fetch(channelId).catch(() => null);

    if (channel && channel.isText()) {
      const now = Date.now();

      // A) 24 Saatte bir owo daily, owo cookie & owo cl (Checklist)
      if (now - worker.lastDailyTime > 24 * 60 * 60 * 1000) {
        worker.lastDailyTime = now;
        await channel.send('owo daily').catch(() => { });
        worker.stats.dailies++;
        await sleep(randomBetween(2000, 3500));

        if (config.targetId) {
          await channel.send(`owo cookie <@${config.targetId}>`).catch(() => { });
          worker.stats.cookies++;
          await sleep(randomBetween(2000, 3500));
        }

        await channel.send('owo cl').catch(() => { });
        worker.stats.checklist++;
        await sleep(randomBetween(2000, 3500));
      }

      // B) ⚡ PRO: OTO-QUEST — Her 1 saatte bir quest al (günlük max 4 quest)
      if (now - worker.lastQuestTime > 60 * 60 * 1000 + randomBetween(20000, 90000)) {
        worker.lastQuestTime = now;
        await channel.send('owo quest').catch(() => {});
        worker.stats.questsGrabbed++;
        savePersistentStats(userId, tokenIndex, worker.stats);
        console.log(`📜 [OwORunner] Oto-Quest: quest alındı (${worker.client.user.tag})`);
        await sleep(randomBetween(2500, 4000));
      }

      // C) 5 Dakikada bir owo pray
      if (now - worker.lastPrayTime > 5 * 60 * 1000 + randomBetween(5000, 25000)) {
        worker.lastPrayTime = now;
        const prayCmd = config.targetId ? `owo pray <@${config.targetId}>` : 'owo pray';
        await channel.send(prayCmd).catch(() => { });
        worker.stats.prays++;
        worker.commandsCount++;
        await sleep(randomBetween(2500, 4200));
      }

      // D) Periyodik owo sell all
      if (worker.huntCountSinceSell >= randomBetween(25, 35)) {
        worker.huntCountSinceSell = 0;
        await channel.send('owo sell all').catch(() => { });
        worker.stats.sells++;
        savePersistentStats(userId, tokenIndex, worker.stats);
        await sleep(randomBetween(2500, 3800));
      }

      // E) Periyodik Gem Yenileme
      if (worker.huntCountSinceGemCheck >= randomBetween(50, 65)) {
        worker.huntCountSinceGemCheck = 0;
        console.log('[OwORunner] Taş süreleri kontrol ediliyor ve en iyileri yenileniyor...');
        await equipBestGems(worker, channel);
      }

      // F) Akıllı Quest / Gamble Simülasyonu
      if (worker.huntsSinceGamble >= randomBetween(15, 20)) {
        worker.huntsSinceGamble = 0;
        await channel.send('owo cf 5').catch(() => { });
        worker.stats.gambles++;
        savePersistentStats(userId, tokenIndex, worker.stats);
        worker.commandsCount++;
        await sleep(randomBetween(2200, 3500));
      }

      // G) 💰 PRO: Bakiye Kontrolü — Her 20-30 hunt'ta bir, para bitince "owo sell all"
      if (now - worker.lastCowoncyCheckTime > 12 * 60 * 1000) {
        worker.lastCowoncyCheckTime = now;
        const bal = await checkCowoncy(worker, channel);
        // Eğer bakiye 300'ün altına düştüyse (hunt pahalıya gelir), sell + gamble kapat
        if (bal !== null && bal < 300) {
          console.log(`⚠️ [OwORunner] Bakiye düşük (${fmt(bal)}), otomatik "owo sell all" ve gamble kısıtlama devrede!`);
          await channel.send('owo sell all').catch(() => { });
          worker.stats.sells++;
          await sleep(randomBetween(2500, 3800));
          // Bakiye kritiğinde gamble bir süre kapatılır
          worker.huntsSinceGamble = -25;
        }
      }

      // H) owo hunt
      await channel.send('owo hunt').catch(() => { });
      worker.commandsCount++;
      worker.stats.hunts++;
      worker.huntCountSinceSell++;
      worker.huntCountSinceGemCheck++;
      worker.huntsSinceGamble++;

      await sleep(randomBetween(2200, 3800));

      // I) owo battle
      await channel.send('owo battle').catch(() => { });
      worker.commandsCount++;
      worker.stats.battles++;

      // 💾 Kalıcı istatistik kaydı
      savePersistentStats(userId, tokenIndex, worker.stats);

      // İstatistik Güncelleme
      config.stats = config.stats || { huntCount: 0, battleCount: 0 };
      config.stats.huntCount = (config.stats.huntCount || 0) + 1;
      config.stats.battleCount = (config.stats.battleCount || 0) + 1;
      config.stats.lastRun = new Date().toISOString();
      saveOwoConfig(userId, tokenIndex, config);
    }
  } catch (err) {
    console.error(`[OwORunner] İşlem hatası:`, err.message);
  }

  // 15 saniyelik resmi cooldown üzerine 1.5 - 6 saniyelik Anti-Ban Jitter ekle
  const nextDelay = randomBetween(16500, 21500);

  worker.timer = setTimeout(() => {
    scheduleNextHuntCycle(workerKey, userId, tokenIndex);
  }, nextDelay);
}

/**
 * OwO otomasyonunu durdur.
 * opts.silent = true ise kazanç raporu üretilmez (restart gibi durumlarda).
 * opts.notifyChannelId = raporun gönderileceği kanal.
 */
export function stopOwoAutomation(userId, tokenIndex, opts = {}) {
  const workerKey = `${userId}:${tokenIndex}`;
  const worker = runningWorkers.get(workerKey);

  if (!worker) return false;

  worker.running = false;
  if (worker.timer) clearTimeout(worker.timer);

  // 💾 İstatistikleri kesin diske kaydet (bekleyen throttle varsa iptal edip hemen yaz)
  if (statsSaveTimers.has(workerKey)) {
    clearTimeout(statsSaveTimers.get(workerKey));
    statsSaveTimers.delete(workerKey);
  }
  try {
    const store = readStatsStore();
    store[workerKey] = { ...worker.stats, rareFindings: worker.stats.rareFindings.slice(-20), savedAt: new Date().toISOString() };
    writeStatsStore(store);
  } catch {}

  // 📊 Oturum kazanç raporu üret (silent değilse)
  let report = null;
  if (!opts.silent) {
    report = buildSessionReport(worker);
    lastSessionReports.set(workerKey, { ...report, stoppedAt: Date.now(), userId, tokenIndex });
    sendSessionReport(worker, report, opts.notifyChannelId).catch(() => { });
  }

  try {
    worker.client.destroy();
  } catch { }
  runningWorkers.delete(workerKey);
  return true;
}

/**
 * 📊 Oturum boyunca kazanılan her şeyin özet raporunu üretir
 */
function buildSessionReport(worker) {
  const s = worker.stats;
  const durationMs = Date.now() - worker.startTime;
  const mins = Math.floor(durationMs / 60000);
  const durationText = mins >= 60
    ? `${Math.floor(mins / 60)} sa ${mins % 60} dk`
    : `${mins} dk`;

  const cowoncyDelta = (s.cowoncyStart !== null && s.cowoncyLast !== null)
    ? s.cowoncyLast - s.cowoncyStart
    : null;

  return {
    username: worker.client.user?.tag || 'Bilinmiyor',
    durationText,
    commandsSent: worker.commandsCount,
    hunts: s.hunts,
    battles: s.battles,
    animalsCaught: s.animalsCaught,
    questsGrabbed: s.questsGrabbed,
    gemsEquipped: s.gemsEquipped,
    sells: s.sells,
    gambles: s.gambles,
    loots: s.loots,
    dailies: s.dailies,
    prays: s.prays,
    cookies: s.cookies,
    checklist: s.checklist,
    cowoncyStart: s.cowoncyStart,
    cowoncyLast: s.cowoncyLast,
    cowoncyDelta,
    peakCowoncy: s.peakCowoncy,
    lowestCowoncy: s.lowestCowoncy,
    rareFindings: [...s.rareFindings],
  };
}

/**
 * 📊 Durdurulan oturumun raporunu kanala gönderir
 */
async function sendSessionReport(worker, report, notifyChannelId) {
  try {
    const cfg = worker.config || {};
    const targetChannelId = notifyChannelId || cfg.channelIds?.[0];
    if (!targetChannelId) return;

    const channel = await worker.client.channels.fetch(targetChannelId).catch(() => null);
    if (!channel || !channel.isText()) return;

    const embed = buildSessionReportEmbed(report);
    await channel.send({ embeds: [embed] }).catch(() => { });
  } catch { }
}

/**
 * Oturum kazanç raporunu Embed olarak üretir
 */
function buildSessionReportEmbed(report) {
  const {
    username, durationText, commandsSent, hunts, battles, animalsCaught,
    questsGrabbed, gemsEquipped, sells, gambles, loots, dailies, prays,
    cookies, checklist, cowoncyStart, cowoncyLast, cowoncyDelta,
    peakCowoncy, lowestCowoncy, rareFindings,
  } = report;

  const totalActions = hunts + battles + questsGrabbed + sells + gambles + loots;
  const deltaText = cowoncyDelta === null ? 'Bilinmiyor' : `${cowoncyDelta >= 0 ? '+' : ''}${fmt(cowoncyDelta)}`;
  const deltaEmoji = cowoncyDelta === null ? '❓' : cowoncyDelta >= 0 ? '📈' : '📉';

  return {
    embeds: [{
      title: '🛑 OwO Otomasyon Durduruldu — Oturum Kazanç Raporu',
      color: 0x2b2d31,
      fields: [
        { name: '👤 Hesap', value: `\`${username}\``, inline: true },
        { name: '⏱️ Süre', value: `\`${durationText}\``, inline: true },
        { name: '🎯 Toplam İşlem', value: `\`${fmt(totalActions)}\``, inline: true },
        { name: '🏹 Hunt', value: `\`${fmt(hunts)}\``, inline: true },
        { name: '⚔️ Battle', value: `\`${fmt(battles)}\``, inline: true },
        { name: '🐾 Yakalanan Hayvan', value: `\`${fmt(animalsCaught)}\``, inline: true },
        { name: '📜 Quest', value: `\`${fmt(questsGrabbed)}\``, inline: true },
        { name: '💎 Takılan Gem', value: `\`${fmt(gemsEquipped)}\``, inline: true },
        { name: '💸 Sell', value: `\`${fmt(sells)}\``, inline: true },
        { name: '🎰 Gamble', value: `\`${fmt(gambles)}\``, inline: true },
        { name: '📦 Lootbox/Crate', value: `\`${fmt(loots)}\``, inline: true },
        { name: '🗓️ Daily', value: `\`${fmt(dailies)}\``, inline: true },
        { name: '🙏 Pray', value: `\`${fmt(prays)}\``, inline: true },
        { name: '🍪 Cookie', value: `\`${fmt(cookies)}\``, inline: true },
        { name: '✅ Checklist', value: `\`${fmt(checklist)}\``, inline: true },
        { name: `${deltaEmoji} Cowoncy Değişimi`, value: `\`${deltaText}\``, inline: true },
        { name: '💰 Başlangıç / Bitiş Bakiye', value: `\`${fmt(cowoncyStart)}\` → \`${fmt(cowoncyLast)}\``, inline: true },
        { name: '📊 Zirve / Dip Bakiye', value: `\`${fmt(peakCowoncy)}\` / \`${fmt(lowestCowoncy)}\``, inline: true },
        {
          name: '✨ Nadir Bulgular',
          value: rareFindings.length
            ? rareFindings.slice(-10).map(r => `\`${r.tier}\` @ <t:${Math.floor(r.at / 1000)}:R>`).join('\n')
            : '*Bu oturumda nadir hayvan bulunamadı.*',
          inline: false,
        },
        { name: '📨 Gönderilen Komut', value: `\`${fmt(commandsSent)}\``, inline: true },
      ],
      footer: { text: 'REXAL OwO Premium — Oturum Özeti' },
      timestamp: new Date().toISOString(),
    }],
  };
}

/**
 * Son durdurulan oturumun kazanç raporunu döndürür
 */
export function getLastSessionReport(userId, tokenIndex) {
  return lastSessionReports.get(`${userId}:${tokenIndex}`) || null;
}

/**
 * Otomasyon aktif mi kontrol et
 */
export function isOwoRunning(userId, tokenIndex) {
  return runningWorkers.has(`${userId}:${tokenIndex}`);
}

/**
 * Aktif worker'ın canlı istatistiklerini getir
 */
export function getWorkerStats(userId, tokenIndex) {
  const worker = runningWorkers.get(`${userId}:${tokenIndex}`);
  if (!worker) return null;

  const s = worker.stats;
  const delta = (s.cowoncyStart !== null && s.cowoncyLast !== null)
    ? s.cowoncyLast - s.cowoncyStart
    : null;

  return {
    uptimeMs: Date.now() - worker.startTime,
    isSleeping: worker.isSleeping,
    commandsSent: worker.commandsCount,
    hunts: s.hunts,
    battles: s.battles,
    animalsCaught: s.animalsCaught,
    questsGrabbed: s.questsGrabbed,
    gemsEquipped: s.gemsEquipped,
    sells: s.sells,
    gambles: s.gambles,
    cowoncyDelta: delta,
    cowoncyLast: s.cowoncyLast,
    peakCowoncy: s.peakCowoncy,
    rareFindings: s.rareFindings.length,
  };
}

/**
 * Reboot Recovery: Bot başladığında tüm kayıtlı ve aktif olan otomasyonları geri yükle
 */
export async function recoverAllOwoWorkers() {
  const configs = getAllOwoConfigs();
  let count = 0;

  for (const cfg of configs) {
    if (cfg.enabled) {
      console.log(`[OwORunner] Reboot Recovery: ${cfg.userId}:${cfg.tokenIndex} başlatılıyor...`);
      const res = await startOwoAutomation(cfg.userId, cfg.tokenIndex);
      if (res.success) count++;
    }
  }

  if (count > 0) {
    console.log(`✅ [OwORunner] ${count} adet OwO otomasyonu kurtarıldı ve çalışıyor.`);
  }
}
