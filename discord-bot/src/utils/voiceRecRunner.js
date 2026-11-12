// src/utils/voiceRecRunner.js — 🎙️ Ses Kanalı Kayıt Motoru (Güvenlik Kamerası Mantığı)
// Vault'taki hesap bir ses kanalına katıldığında kanaldaki sesi kaydeder:
//  • Ham PCM verisi doğrudan diske yazılmaz → FFmpeg subprocess'ine stdin'den pipe edilir
//  • FFmpeg sesi MP3'e sıkıştırır (20 MB limitle çok daha uzun kayıt)
//  • Dosya 19 MB'a ulaşınca bölüm kapatılır, OWNER'a DM ile gönderilir, yeni bölüm başlar
//  • Basit enerji-tabanlı VAD: kimse konuşmuyorken boş paketler es geçilir
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { joinVoiceChannel, EndBehaviorType } from '@discordjs/voice';
import { loginVaultAccount, destroyClient, sleep } from './selfbotHelpers.js';
import { saveSession, deleteSession, getAllSessions } from './sessionStore.js';

const runningSessions = new Map(); // `${userId}:${tokenIndex}` -> state
const RECONNECT_CHECK_MS = 15000;
const MAX_JOIN_ATTEMPTS = 10;
const MAX_FILE_BYTES = 19 * 1024 * 1024;   // 19 MB güvenli sınır (Discord 20 MB)
const PART_BASENAME = 'kayit_bolum';        // kayit_bolum_1.mp3, kayit_bolum_2.mp3 ...

// ── FFmpeg bulunabilirliği ───────────────────────────────────────────────────
let ffmpegAvailable = null; // null = henüz test edilmedi
export function isFfmpegAvailable() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    const probe = spawn('ffmpeg', ['-version'], { windowsHide: true });
    let ok = false;
    probe.stdout?.once('data', () => { ok = true; });
    probe.on('error', () => { ok = false; });
    setTimeout(() => { try { probe.kill(); } catch { } }, 4000);
    ffmpegAvailable = true; // optimist; gerçek hata recorder açılışında da yakalanır
    return ffmpegAvailable;
  } catch {
    ffmpegAvailable = false;
    return false;
  }
}

// ── VAD: basit enerji tabanlı sessizlik filtresi ────────────────────────────
// 16-bit LE PCM, mono/s stereo. RMS eşiği altındaki buffer'lar es geçilir.
const VAD_THRESHOLD = 350;   // RMS eşiği (0-32767 aralığında; konuşma tipik >1000)
const VAD_HANGOVER_MS = 1500; // konuşma bittikten sonra bu kadar sessizliği de yaz

function rmsOf(pcmBuf) {
  let sumSq = 0, samples = 0;
  for (let i = 0; i + 1 < pcmBuf.length; i += 2) {
    const v = pcmBuf.readInt16LE(i);
    sumSq += v * v;
    samples++;
  }
  return samples ? Math.sqrt(sumSq / samples) : 0;
}

/** PCM buffer'ın tamamen sessiz (0) olup olmadığını hızlıca kontrol eder */
function isDigitalSilence(buf) {
  for (let i = 0; i < buf.length; i++) if (buf[i] !== 0) return false;
  return true;
}

// ── FFmpeg bölüm süreci ─────────────────────────────────────────────────────
function spawnFfmpegPart(outPath) {
  // stdin: s16le 48000Hz 2ch raw PCM → libmp3lame 128k
  const ff = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', 'pipe:0',
    '-acodec', 'libmp3lame', '-b:a', '128k', '-f', 'mp3',
    outPath,
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });

  ff.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.warn(`🎙️ [VoiceRec] ffmpeg: ${msg.slice(0, 200)}`);
  });

  return ff;
}

function writeQuiet(stdin, chunk) {
  try {
    return stdin.write(chunk);
  } catch (err) {
    console.error('🎙️ [VoiceRec] stdin yazma hatası:', err.message);
    return false;
  }
}

// ── Rate-limit'i tolere eden DM gönderici ───────────────────────────────────
async function sendFileWithRetry(user, filePath, attempt = 1) {
  const MAX_ATTEMPTS = 4;
  try {
    await user.send({
      content: `🎙️ Kayıt bölümü: \`${path.basename(filePath)}\``,
      files: [filePath],
    });
    return true;
  } catch (err) {
    // 429 rate-limit veya geçici hata → backoff ile tekrar dene
    if (attempt < MAX_ATTEMPTS && (err?.status === 429 || err?.httpStatus === 429 || /rate|timed? ?out/i.test(String(err)))) {
      const waitMs = Math.min(30000, 3000 * attempt * attempt);
      console.warn(`🎙️ [VoiceRec] DM gönderimi rate-limit (${attempt}/${MAX_ATTEMPTS}), ${waitMs}ms bekleniyor...`);
      await sleep(waitMs);
      return sendFileWithRetry(user, filePath, attempt + 1);
    }
    console.error('🎙️ [VoiceRec] DM gönderilemedi:', err.message);
    return false;
  }
}

// ── Kayıt çekirdeği ─────────────────────────────────────────────────────────
async function startRecordingPipeline(state) {
  const { client, guildId, channelId, ownerId } = state;

  const finalizePart = async (reason = '') => {
    const ff = state.ff;
    if (!ff) return null;
    state.ff = null;
    state.lastBufferSentAt = 0;

    // stdin'i kapat → FFmpeg dosyayı düzgün finalize eder (ID3/son frame)
    await new Promise((resolve) => {
      try {
        ff.stdin.end();
        const t = setTimeout(() => { try { ff.kill('SIGKILL'); } catch { } resolve(); }, 5000);
        ff.once('close', () => { clearTimeout(t); resolve(); });
      } catch { resolve(); }
    });

    const file = state.partPath;
    if (file && fs.existsSync(file) && fs.statSync(file).size > 1024) { // <1KB = boş bölüm, gönderme
      const owner = client.users.cache.get(ownerId) ?? await client.users.fetch(ownerId).catch(() => null);
      if (owner) {
        const sent = await sendFileWithRetry(owner, file);
        state.partsSent++;
        console.log(`🎙️ [VoiceRec] Bölüm gönderildi (#${state.partNumber})${sent ? '' : ' ❌ GÖNDERİLEMEDİ'} ${reason} — ${path.basename(file)}`);
      } else {
        console.error(`🎙️ [VoiceRec] OWNER (${ownerId}) bulunamadı, bölüm gönderilemedi: ${file}`);
      }
    } else {
      console.log(`🎙️ [VoiceRec] Bölüm #${state.partNumber} boş/çok küçük, atlandı ${reason}`);
    }

    // Dosyayı sil (gönderim attach'ı kopyalar)
    try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch { }

    state.partNumber++;
    state.partPath = path.join(state.tmpDir, `${PART_BASENAME}_${state.partNumber}.mp3`);
    return state.partPath;
  };

  const openNewPart = () => {
    state.ff = spawnFfmpegPart(state.partPath);
    state.partStartedAt = Date.now();
  };

  // ── Voice receiver kurulumu ──────────────────────────────────────────────
  const receiver = state.connection.receiver;
  state.recordings = new Map(); // speakingUserId -> { decoder pipeline, rxAudio }

  // Kanaldaki herkesi dinle; yeni katılanlar otomatik abone olur
  const subscribeUser = (usrId) => {
    if (state.recordings.has(usrId)) return;
    try {
      const rx = receiver.subscribe(usrId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: VAD_HANGOVER_MS },
      });
      // opus → PCM decoder (prism-media kütüphaneden)
      import('prism-media').then(({ opus }) => {
        const decoder = new opus.Decoder({ channels: 2, rate: 48000, frameSize: 960 });
        rx.pipe(decoder);
        const entry = { decoder, rx, hangoverLeft: 0, speaking: false };
        state.recordings.set(usrId, entry);

        decoder.on('data', (pcm) => {
          if (!state.running || !state.ff) return;
          if (isDigitalSilence(pcm)) return;              // dijital sessizlik → es geç
          const rms = rmsOf(pcm);
          if (rms >= VAD_THRESHOLD) {
            entry.speaking = true;
            entry.hangoverLeft = VAD_HANGOVER_MS / 20;    // ~frame başına
          } else if (entry.speaking && entry.hangoverLeft > 0) {
            entry.hangoverLeft--;
          } else if (entry.speaking) {
            entry.speaking = false;                        // konuşma bitti
            return;
          } else {
            return;                                        // sessiz → yazma
          }
          state.bytesSincePartStart += writeQuiet(state.ff.stdin, pcm) ? pcm.length : 0;
          state.lastBufferSentAt = Date.now();
          state.totalBytes += pcm.length;
        });

        decoder.on('error', (err) => console.warn(`🎙️ [VoiceRec] decoder hatası (${usrId}):`, err.message));
      }).catch((err) => console.error('🎙️ [VoiceRec] prism-media import hatası:', err.message));
    } catch (err) {
      console.warn(`🎙️ [VoiceRec] abonelik hatası (${usrId}):`, err.message);
    }
  };

  // Halihazırda kanalda olanlar + sonradan katılanlar
  try {
    const guild = client.guilds.cache.get(guildId);
    const members = guild?.voiceStates?.cache?.get(channelId)?.members
      ?? guild?.channels?.cache?.get(channelId)?.members;
    members?.forEach((m) => { if (m.id !== client.user.id) subscribeUser(m.id); });
  } catch { }
  state.onVoiceStateUpdate = (oldState, newState) => {
    if (newState.channelId === channelId && newState.id !== client.user.id) subscribeUser(newState.id);
  };
  client.on('voiceStateUpdate', state.onVoiceStateUpdate);

  // İlk bölümü aç
  openNewPart();

  // ── Boyut denetleyicisi: 19 MB'a ulaşınca bölüm kes, DM'den sonra devam ──
  state.sizeTimer = setInterval(async () => {
    if (!state.running) return;
    try {
      const size = fs.existsSync(state.partPath) ? fs.statSync(state.partPath).size : 0;
      if (size >= MAX_FILE_BYTES) {
        console.log(`🎙️ [VoiceRec] 19 MB sınırına ulaşıldı (${(size / 1048576).toFixed(1)} MB), bölüm kesiliyor...`);
        // a) FFmpeg'i düzgün sonlandır + dosyayı gönder
        await finalizePart('(boyut limiti)');
        // d) Yeni bölüm başlat — kayıt kaldığı yerden devam eder
        if (state.running) openNewPart();
      }
    } catch (err) {
      console.error('🎙️ [VoiceRec] boyut denetleyici hatası:', err.message);
    }
  }, 5000);

  // Güvenlik ağı: 40 dakikadan uzun tek bölüm varsa da kes (128kbps mp3 ≈ 60MB/40dk garanti aşım)
  state.durationTimer = setInterval(async () => {
    if (!state.running || !state.ff) return;
    if (Date.now() - state.partStartedAt > 40 * 60 * 1000) {
      await finalizePart('(süre limiti)');
      if (state.running) openNewPart();
    }
  }, 30000);
}

// ── Oturum yaşam döngüsü ────────────────────────────────────────────────────
/**
 * Ses kanalı kaydı başlat.
 * @param {string} userId   Bot sahibi (komutu veren)
 * @param {number} tokenIndex Vault'taki hesap
 * @param {string} guildId
 * @param {string} channelId - kayıt alınacak ses kanalı
 * @param {string} ownerId  Kayıt dosyalarının DM ile gönderileceği kullanıcı
 */
export async function startVoiceRecording(userId, tokenIndex, guildId, channelId, ownerId) {
  const key = `${userId}:${tokenIndex}`;
  stopVoiceRecording(userId, tokenIndex, { silent: true });

  if (!isFfmpegAvailable()) {
    return { success: false, error: 'FFmpeg bulunamadı! Sisteminize FFmpeg kurun ve PATH\'e ekleyin.' };
  }

  const login = await loginVaultAccount(userId, tokenIndex);
  if (!login.success) return { success: false, error: login.error };

  const client = login.client;
  const tmpDir = path.join(os.tmpdir(), `rexal_voicerec_${userId}_${Date.now()}`);
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (err) {
    destroyClient(client);
    return { success: false, error: 'Geçici klasör oluşturulamadı: ' + err.message };
  }

  const state = {
    userId, tokenIndex, client, guildId, channelId, ownerId,
    running: true, reconnections: 0, startTime: Date.now(),
    timer: null, connection: null,
    ff: null, partPath: path.join(tmpDir, `${PART_BASENAME}_1.mp3`),
    partNumber: 1, partsSent: 0, totalBytes: 0, bytesSincePartStart: 0,
    partStartedAt: Date.now(), tmpDir, recordings: new Map(),
    onVoiceStateUpdate: null, sizeTimer: null, durationTimer: null,
  };
  runningSessions.set(key, state);

  saveSession('voicerec', userId, tokenIndex, { guildId, channelId, ownerId });

  const connect = () => {
    try {
      const guildObj = client.guilds.cache.get(guildId);
      const adapterCreator = guildObj?.voiceAdapterCreator;
      if (!adapterCreator) throw new Error('Ses adaptörü bulunamadı (hesap bu sunucuda olmayabilir)');
      state.connection = joinVoiceChannel({
        channelId, guildId,
        adapterCreator,
        selfDeaf: false,  // 🔑 kayıt için duymak ZORUNDA (deaf olursa ses gelmez)
        selfMute: true,
      });
      return true;
    } catch (err) {
      console.error(`🎙️ [VoiceRec] join hatası (${key}):`, err.message);
      return false;
    }
  };

  const findAndJoinChannel = async () => {
    for (let attempt = 1; attempt <= MAX_JOIN_ATTEMPTS && state.running; attempt++) {
      try {
        const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          let ch = guild.channels.cache.get(channelId);
          if (!ch) {
            await guild.channels.fetch().catch(() => { });
            ch = guild.channels.cache.get(channelId);
          }
          if (ch && connect()) return true;
        }
      } catch (err) {
        console.error(`🎙️ [VoiceRec] kanal arama hatası (${key}):`, err.message);
      }
      console.log(`🔍 [VoiceRec] Kanal bulunamadı/bağlanamadı (${attempt}/${MAX_JOIN_ATTEMPTS})`);
      await sleep(3000);
    }
    return false;
  };

  const joined = await findAndJoinChannel();
  if (!joined || !state.running) {
    stopVoiceRecording(userId, tokenIndex, { silent: true });
    return { success: false, error: `Ses kanalı bulunamadı (${MAX_JOIN_ATTEMPTS} deneme yapıldı)` };
  }

  // Bağlantı durumunu dinle: koparsa güvenli durdurma + reconnect
  state.connection.on('disconnected', async () => {
    if (!state.running) return;
    console.warn(`⚠️ [VoiceRec] Ses bağlantısı koptu, yeniden bağlanıyor...`);
    await finalizePartSafe(state, '(bağlantı koptu)');
    state.reconnections++;
    const ok = await findAndJoinChannel();
    if (ok && state.running) {
      await startRecordingPipeline(state);
    } else {
      console.error('🛑 [VoiceRec] Yeniden bağlanılamadı, oturum kapatılıyor.');
      stopVoiceRecording(userId, tokenIndex, { silent: true });
    }
  });

  // Kayıt hattını başlat
  await startRecordingPipeline(state);

  // Akıllı yeniden bağlanma (voiceAfkRunner ile aynı kalıp)
  state.timer = setInterval(async () => {
    if (!state.running) return;
    try {
      const guild = client.guilds.cache.get(guildId);
      const member = guild?.members.cache.get(client.user.id);
      const connected = member?.voice?.channelId === channelId;
      if (!connected && !state.connection?.state?.status) {
        state.reconnections++;
        const ok = await findAndJoinChannel();
        if (ok && state.running) await startRecordingPipeline(state);
        else if (!ok) stopVoiceRecording(userId, tokenIndex, { silent: true });
      }
    } catch { }
  }, RECONNECT_CHECK_MS);

  console.log(`🎙️ [VoiceRec] Kayıt başladı: kanal ${channelId} → OWNER ${ownerId}`);
  return { success: true, username: login.username };
}

/** Panik finalize: state dağılmadan mevcut bölümü kapat ve gönder */
async function finalizePartSafe(state, reason) {
  try {
    if (state.ff) {
      await new Promise((resolve) => {
        try {
          state.ff.stdin.end();
          const t = setTimeout(() => { try { state.ff.kill('SIGKILL'); } catch { } resolve(); }, 5000);
          state.ff.once('close', () => { clearTimeout(t); resolve(); });
        } catch { resolve(); }
      });
      state.ff = null;
    }
    const file = state.partPath;
    if (file && fs.existsSync(file) && fs.statSync(file).size > 1024) {
      const owner = state.client.users.cache.get(state.ownerId) ?? await state.client.users.fetch(state.ownerId).catch(() => null);
      if (owner) await sendFileWithRetry(owner, file);
    }
    try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch { }
    state.partNumber++;
    state.partPath = path.join(state.tmpDir, `${PART_BASENAME}_${state.partNumber}.mp3`);
  } catch (err) {
    console.error('🎙️ [VoiceRec] finalize hatası:', err.message);
  }
}

export function stopVoiceRecording(userId, tokenIndex, opts = {}) {
  const key = `${userId}:${tokenIndex}`;
  const state = runningSessions.get(key);
  if (!state) return opts.silent ? false : { success: false, error: 'Bu hesap için kayıt çalışmıyor.' };

  state.running = false;
  clearInterval(state.timer);
  clearInterval(state.sizeTimer);
  clearInterval(state.durationTimer);
  if (state.onVoiceStateUpdate) {
    try { state.client.removeListener('voiceStateUpdate', state.onVoiceStateUpdate); } catch { }
  }

  // Aktif bölümü güvenli bitir ve son dosyayı da gönder
  try {
    if (state.ff) {
      state.ff.stdin.end();
      setTimeout(() => { try { state.ff.kill(); } catch { } }, 4000);
      const ff = state.ff, file = state.partPath;
      ff.once('close', async () => {
        try {
          if (file && fs.existsSync(file) && fs.statSync(file).size > 1024) {
            const owner = state.client?.users?.cache?.get(state.ownerId)
              ?? await state.client?.users?.fetch(state.ownerId).catch(() => null);
            if (owner) await sendFileWithRetry(owner, file);
          }
          try { if (file && fs.existsSync(file)) fs.unlinkSync(file); } catch { }
        } catch { }
      });
    }
  } catch { /* yut */ }

  try { state.connection?.destroy(); } catch { }

  // Tüm abonelikleri bırak
  try { state.recordings?.forEach((r) => { try { r.rx.destroy(); r.decoder.destroy(); } catch { } }); } catch { }

  // tmp klasörünü temizle (dosyalar gönderildikten sonra)
  setTimeout(() => {
    try { fs.rmSync(state.tmpDir, { recursive: true, force: true }); } catch { }
  }, 15000);

  destroyClient(state.client);
  runningSessions.delete(key);
  deleteSession('voicerec', userId, tokenIndex);
  console.log(`🎙️ [VoiceRec] Durduruldu: ${key}`);
  return { success: true };
}

export function stopAllVoiceRecordings(userId) {
  let stopped = 0;
  for (const [key] of runningSessions) {
    if (key.startsWith(`${userId}:`)) {
      if (stopVoiceRecording(userId, Number(key.split(':')[1]), { silent: true })) stopped++;
    }
  }
  return stopped;
}

export function isVoiceRecordingRunning(userId, tokenIndex) {
  return runningSessions.has(`${userId}:${tokenIndex}`);
}

export function getVoiceRecStats(userId, tokenIndex) {
  const state = runningSessions.get(`${userId}:${tokenIndex}`);
  if (!state) return null;
  return {
    guildId: state.guildId,
    channelId: state.channelId,
    partNumber: state.partNumber,
    partsSent: state.partsSent,
    totalMB: (state.totalBytes / 1048576).toFixed(1),
    listeners: state.recordings?.size ?? 0,
    reconnections: state.reconnections,
    durationMin: Math.floor((Date.now() - state.startTime) / 60000),
  };
}

export function listVoiceRecordings(userId) {
  return [...runningSessions.entries()]
    .filter(([k]) => k.startsWith(`${userId}:`))
    .map(([k, s]) => ({ tokenIndex: Number(k.split(':')[1]), guildId: s.guildId, channelId: s.channelId }));
}

export function getAllVoiceRecSessions() {
  return getAllSessions('voicerec');
}

/** Reboot Recovery: kayıtlı oturumları yeniden kurar */
export async function recoverVoiceRecordings() {
  const sessions = getAllSessions('voicerec');
  let recovered = 0;
  for (const s of sessions) {
    const res = await startVoiceRecording(s.userId, s.tokenIndex, s.guildId, s.channelId, s.ownerId).catch(() => ({ success: false }));
    if (res.success) recovered++;
    await sleep(1200);
  }
  console.log(`🎙️ [VoiceRec] Reboot Recovery: ${recovered}/${sessions.length} kayıt geri yüklendi.`);
  return recovered;
}
