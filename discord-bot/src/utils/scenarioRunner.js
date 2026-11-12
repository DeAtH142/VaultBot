// src/utils/scenarioRunner.js — 🎭 REXAL Sunucu Dirltme (Senaryo) Motoru
// Vault'taki hesapları SIRAYLA konuşturur. Mesajlar ve zamanlama önceden
// hazırlanmış senaryo dosyalarından okunur — AI yok, insan gibi doğal akış.
//
// Senaryo dosyaları: data/senaryo/senaryo{N}.txt  (N = hesap sayısı, 2-10)
//   - Her satır = bir mesaj
//   - `wait:30` satırı = sonraki mesaja kadar 30 sn bekle (isteğe bağlı)
//   - `@hesap2` satırı = sırayı 2. hesaba zorla (isteğe bağlı)
//   - Dosya biterse: loop modu açıksa baştan devam, değilse senaryo biter
//
// Özellikler: 10 eşzamanlı slot, vault entegrasyonu (token tek sefer girilir),
// döngü modu, reboot recovery, anlık durdurma.

import { loginVaultAccount, destroyClient, sleep } from './selfbotHelpers.js';
import { getTokens } from './tokenStore.js';
import { saveSession, getAllSessions, deleteSession } from './sessionStore.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE = 'dirlt';
const MAX_SLOTS = 10;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCENARIO_DIR = path.join(__dirname, '..', '..', 'data', 'senaryo');

const activeScenarios = new Map(); // userId -> scenario state

function sleepMs(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Senaryo dosyasını satırlara ayrıştırır */
export function readScenarioFile(accountCount) {
  const file = path.join(SCENARIO_DIR, `senaryo${accountCount}.txt`);
  if (!fs.existsSync(file)) {
    return { ok: false, error: `Senaryo dosyası yok: data/senaryo/senaryo${accountCount}.txt`, file };
  }
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { ok: false, error: `Senaryo dosyası boş: senaryo${accountCount}.txt`, file };

  // satır -> { text?, wait?, forceSlot? }
  const steps = [];
  let lastWait = null;
  for (const line of lines) {
    const waitMatch = line.match(/^wait\s*[:=]\s*(\d+)\s*(s|sn|saniye)?$/i);
    if (waitMatch) { lastWait = parseInt(waitMatch[1], 10); continue; }
    const slotMatch = line.match(/^@hesap\s*(\d+)$/i);
    if (slotMatch) {
      if (steps.length === 0) steps.push({ forceSlot: parseInt(slotMatch[1], 10) - 1 });
      else steps[steps.length - 1].forceSlot = parseInt(slotMatch[1], 10) - 1;
      continue;
    }
    steps.push({ text: line, wait: lastWait });
    lastWait = null;
  }
  if (steps.length === 0) return { ok: false, error: 'Senaryoda mesaj satırı bulunamadı.', file };
  return { ok: true, steps, file, lineCount: steps.length };
}

/**
 * Senaryo başlat.
 * @param {string} userId
 * @param {number[]} tokenIndexes seçilen vault hesap indexleri (2-10)
 * @param {string} channelId konuşulacak kanal
 * @param {{loop?:boolean, minDelaySec?:number, maxDelaySec?:number}} opts
 */
export async function startScenario(userId, tokenIndexes, channelId, opts = {}) {
  if (activeScenarios.has(userId)) {
    return { ok: false, error: 'Zaten aktif bir senaryon var. Önce onu durdur.' };
  }
  if (tokenIndexes.length < 1 || tokenIndexes.length > MAX_SLOTS) {
    return { ok: false, error: `1-${MAX_SLOTS} hesap seçilebilir.` };
  }

  const loop = !!opts.loop;
  const scenario = readScenarioFile(tokenIndexes.length);
  if (!scenario.ok) return { ok: false, error: scenario.error, file: scenario.file };

  // Hesapları sırayla bağla (token tek sefer girilir — vault entegrasyonu)
  const slots = [];
  for (const idx of tokenIndexes) {
    const t = getTokens(userId)[idx];
    if (!t) { cleanup(slots); return { ok: false, error: `Hesap #${idx + 1} kasada bulunamadı.` }; }
    const login = await loginVaultAccount(userId, idx);
    if (!login.success) { cleanup(slots); return { ok: false, error: `Hesap #${idx + 1} giriş yapamadı: ${login.error}` }; }
    slots.push({ tokenIndex: idx, client: login.client, username: login.username });
    await sleepMs(800); // giriş arası nefes
  }

  const channel = slots[0].client.channels.cache.get(channelId)
    || await slots[0].client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) {
    cleanup(slots);
    return { ok: false, error: 'Kanal bulunamadı — hesap(lar) o kanalın olduğu sunucuda mı? ID doğru mu?' };
  }

  const minDelay = Math.max(5, opts.minDelaySec ?? 25) * 1000;
  const maxDelay = Math.max(minDelay, opts.maxDelaySec ?? 60) * 1000;

  const state = {
    userId, tokenIndexes, channelId, loop,
    slots, steps: scenario.steps, stepIdx: 0,
    minDelay, maxDelay, running: true, timer: null, startedAt: Date.now(),
    sentCount: 0, lastError: null,
  };
  activeScenarios.set(userId, state);

  persist(state);
  scheduleNext(state);
  return {
    ok: true, username: slots[0].username,
    accounts: slots.length, lines: state.steps.length,
    channelName: channel.name ?? channelId,
    loop, file: scenario.file,
  };
}

function persist(state) {
  saveSession(MODULE, state.userId, 0, {
    tokenIndexes: state.tokenIndexes, channelId: state.channelId, loop: state.loop,
    minDelaySec: Math.round(state.minDelay / 1000), maxDelaySec: Math.round(state.maxDelay / 1000),
  });
}

/** Sıradaki adımı planlar ve gönderir */
function scheduleNext(state) {
  if (!state.running) return;
  const step = state.steps[state.stepIdx % state.steps.length];
  const wait = step.wait != null ? step.wait * 1000 : (state.minDelay + Math.random() * (state.maxDelay - state.minDelay));
  state.timer = setTimeout(() => sendNext(state), wait);
  state.timer.unref?.();
}

async function sendNext(state) {
  if (!state.running) return;
  const step = state.steps[state.stepIdx % state.steps.length];

  const slot = step.forceSlot != null && state.slots[step.forceSlot]
    ? state.slots[step.forceSlot]
    : state.slots[state.stepIdx % state.slots.length];

  try {
    const channel = state.lastChannel
      || (state.lastChannel = await slot.client.channels.fetch(state.channelId).catch(() => null));
    if (!channel) throw new Error('Kanala erişilemiyor');
    await channel.send(step.text);
    state.sentCount++;
    state.lastError = null;
  } catch (err) {
    state.lastError = `${slot.username}: ${err.message}`;
    console.warn(`[Dirlt] Mesaj gönderilemedi: ${state.lastError}`);
    // Bağlantı öldüyse yeniden bağlanmayı tetzkle (bir sonraki turda loginVaultAccount yeniden dener)
  }

  state.stepIdx++;
  // Dosya bitti mi?
  if (state.stepIdx >= state.steps.length) {
    if (state.loop) {
      state.stepIdx = 0; // baştan
    } else {
      console.log(`🎭 [Dirlt] Senaryo tamamlandı (${state.userId}) — ${state.sentCount} mesaj.`);
      stopScenario(state.userId, { silent: true });
      return;
    }
  }
  scheduleNext(state);
}

function cleanup(slots) {
  for (const s of slots) { try { destroyClient(s.client); } catch { } }
}

/**
 * Senaryoyu durdur. tokenIndex verilirse sadece o slotu çıkarır; verilmezse tümü.
 */
export function stopScenario(userId, { tokenIndex = null, silent = false } = {}) {
  const state = activeScenarios.get(userId);
  if (!state) return { ok: false, stopped: 0 };

  clearTimeout(state.timer);

  if (tokenIndex == null) {
    cleanup(state.slots);
    activeScenarios.delete(userId);
    deleteSession(MODULE, state.userId, 0);
    return { ok: true, stopped: state.slots.length };
  }

  // Tek slot çıkar
  const i = state.slots.findIndex(s => s.tokenIndex === tokenIndex);
  if (i === -1) return { ok: false, stopped: 0 };
  destroyClient(state.slots[i].client);
  state.slots.splice(i, 1);

  if (state.slots.length === 0) {
    activeScenarios.delete(userId);
    deleteSession(MODULE, state.userId, 0);
    return { ok: true, stopped: 1 };
  }
  persist(state);
  scheduleNext(state);
  return { ok: true, stopped: 1 };
}

export function isScenarioRunning(userId) {
  return activeScenarios.has(userId);
}

export function getScenarioStatus(userId) {
  const s = activeScenarios.get(userId);
  if (!s) return null;
  return {
    running: true,
    accounts: s.slots.map(x => ({ tokenIndex: x.tokenIndex, username: x.username })),
    channel: s.channelId,
    loop: s.loop,
    sentCount: s.sentCount,
    totalSteps: s.steps.length,
    stepIdx: s.stepIdx,
    minutes: Math.floor((Date.now() - s.startedAt) / 60000),
    lastError: s.lastError,
  };
}

/** Bot açılırken kayıtlı senaryoyu geri yükler (Reboot Recovery) */
export async function recoverScenarios() {
  const sessions = getAllSessions(MODULE);
  let revived = 0;
  for (const s of sessions) {
    try {
      const res = await startScenario(s.userId, s.tokenIndexes, s.channelId, {
        loop: s.loop, minDelaySec: s.minDelaySec, maxDelaySec: s.maxDelaySec,
      });
      if (res.ok) revived++;
      else deleteSession(MODULE, s.userId, 0);
    } catch { deleteSession(MODULE, s.userId, 0); }
    await sleepMs(1500);
  }
  if (revived) console.log(`🎭 [Dirlt] Reboot Recovery: ${revived} senaryo kaldığı yerden devam ediyor.`);
  return revived;
}
