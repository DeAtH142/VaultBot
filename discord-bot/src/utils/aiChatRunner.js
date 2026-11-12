// src/utils/aiChatRunner.js — 🤖 AI Chat Runner (Groq + Gemini) v3
// Seçili hesap belirli kanallarda insan gibi konuşur.
// API key'ler HER KULLANICININ kendine ait — panelden girilir, AES ile şifreli saklanır.
// Çalışan modeller otomatik keşfedilir ve data/ai-models.json'a kaydedilir.

import { Client } from 'discord.js-selfbot-v13';
import { decrypt } from './crypto.js';
import { getToken } from './tokenStore.js';
import { getUserKeys } from './aiKeyStore.js';
import { readModuleJson, writeModuleJson } from './moduleStore.js';
import fs from 'fs';
import path from 'path';

const FILE = 'ai_chats.json';
const MODEL_FILE = path.resolve('data/ai-models.json');

const sessions = new Map(); // `${userId}:${tokenIndex}` -> { client, config, memory: Map<channelId, string[]> }
const MEMORY_LIMIT = 12;    // kanal başı son N mesaj hatırlanır (bağlam)

// ── Model Deposu ────────────────────────────────────────────────────────

function loadModels() {
  try { return JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8')); }
  catch { return { groq: [], gemini: [] }; }
}
function saveModels(data) {
  fs.mkdirSync(path.dirname(MODEL_FILE), { recursive: true });
  fs.writeFileSync(MODEL_FILE, JSON.stringify(data, null, 2));
}

export function getWorkingModels(provider) {
  return loadModels()[provider] || [];
}

/**
 * API key ile tüm modelleri test eder ve çalışanları data/ai-models.json'a kaydeder.
 * Key kaydedildikten sonra çağrılmalıdır.
 */
export async function discoverAndSaveModels(userId, provider, apiKey) {
  let modelIds = [];
  try {
    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Groq modelleri alınamadı: ${res.status}`);
      const json = await res.json();
      modelIds = json.data.map(m => m.id);
    } else if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) throw new Error(`Gemini modelleri alınamadı: ${res.status}`);
      const json = await res.json();
      modelIds = json.models.map(m => m.name.replace('models/', ''));
    }

    const working = [];
    for (const id of modelIds) {
      try {
        let testOk = false;
        if (provider === 'groq') {
          const test = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: id, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
          });
          testOk = test.ok;
        } else if (provider === 'gemini') {
          const test = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
          });
          testOk = test.ok;
        }
        if (testOk) working.push(id);
      } catch (e) { /* bu model çalışmıyor, geç */ }
    }

    const store = loadModels();
    store[provider] = working;
    saveModels(store);
    return { success: true, working, total: modelIds.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── API Sağlayıcılar ────────────────────────────────────────────────────

async function askGroq(prompt, history, apiKey, model) {
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error('Groq API key bulunamadı! `!aichat` panelinden ekleyin.');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model || 'llama-3.1-8b-instant',
      messages: history,
      max_tokens: 180,
      temperature: 0.9,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Groq API hatası ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim();
}

async function askGemini(prompt, history, apiKey, model) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Gemini API key bulunamadı! `!aichat` panelinden ekleyin.');
  const mdl = model || 'gemini-3.5-flash-lite';
  const contents = history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 180, temperature: 0.9 } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Gemini API hatası ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

/**
 * Sırayla dener: önce çalışan Groq modelleri, sonra çalışan Gemini modelleri.
 * Çalışan model yoksa varsayılan modele döner.
 */
export async function askAI(ownerId, prompt, history = []) {
  const userKeys = getUserKeys(ownerId);
  const providers = [];

  // 1. Çalışan modelleri al
  const groqModels = getWorkingModels('groq');
  const geminiModels = getWorkingModels('gemini');

  // 2. Provider listesini oluştur
  if (userKeys.groq) {
    if (groqModels.length > 0) {
      // Çalışan her Groq modelini sırayla dene
      for (const model of groqModels) {
        providers.push(['groq', askGroq, userKeys.groq, model]);
      }
    } else {
      // Hiç çalışan model yoksa varsayılanı dene
      providers.push(['groq', askGroq, userKeys.groq, 'llama-3.1-8b-instant']);
    }
  }
  if (userKeys.gemini) {
    if (geminiModels.length > 0) {
      for (const model of geminiModels) {
        providers.push(['gemini', askGemini, userKeys.gemini, model]);
      }
    } else {
      providers.push(['gemini', askGemini, userKeys.gemini, 'gemini-3.5-flash-lite']);
    }
  }

  if (providers.length === 0) throw new Error('AI key bulunamadı! `!aichat` panelinden Groq veya Gemini key ekleyin.');

  const msgs = [...history, { role: 'user', content: prompt }];
  let lastErr;
  for (const [name, fn, key, model] of providers) {
    try {
      const out = await fn(prompt, msgs, key, model);
      if (out) return out;
    } catch (err) {
      lastErr = err;
      console.error(`[AIChat] ${name}/${model || 'default'} hatası:`, err.message);
    }
  }
  throw lastErr || new Error('Hiçbir AI sağlayıcı cevap vermedi.');
}

// ── Runner ──────────────────────────────────────────────────────────────

export function getAiConfigs(userId) {
  const store = readModuleJson(FILE);
  return Object.entries(store)
    .filter(([key]) => key.startsWith(userId + ':'))
    .map(([key, cfg]) => ({ tokenIndex: Number(key.split(':')[1]), ...cfg }));
}

export function isAiRunning(userId, tokenIndex) {
  return sessions.has(`${userId}:${tokenIndex}`);
}

export async function startAiChat(userId, tokenIndex, config) {
  stopAiChat(userId, tokenIndex);

  const tokenObj = getToken(userId, tokenIndex);
  if (!tokenObj) throw new Error('Hesap kasada bulunamadı!');
  const rawToken = decrypt(tokenObj);

  const client = new Client({ checkUpdate: false });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Giriş zaman aşımı (15s)')), 15000);
    client.once('ready', () => { clearTimeout(t); resolve(); });
    client.once('error', (e) => { clearTimeout(t); reject(e); });
    client.login(rawToken).catch((e) => { clearTimeout(t); reject(e); });
  });

  const state = { client, config, ownerId: userId, memory: new Map(), stats: { replies: 0 }, startedAt: new Date().toISOString() };
  sessions.set(`${userId}:${tokenIndex}`, state);

  client.on('messageCreate', async (message) => {
    try {
      if (!config.channelIds.includes(message.channel.id)) return;
      if (message.author.id === client.user.id) return;
      if (message.author.bot) return;
      const mem = state.memory.get(message.channel.id) || [];
      const prompt = message.content.slice(0, 500);
      if (!prompt) return;

      const history = [
        { role: 'system', content: config.systemPrompt || 'Sen normal bir Discord kullanıcısısın. Kısa, doğal ve samimi cevap ver. Türkçe konuş. Emoji kullanabilirsin. Uzun listeden kaçın.' },
        ...mem.map(m => ({ role: m.role, content: m.content })),
      ];

      const reply = await askAI(state.ownerId, prompt, history);
      if (!reply) return;

      await new Promise(r => setTimeout(r, 1500 + Math.floor(Math.random() * 4000)));
      await message.channel.sendTyping().catch(() => { });
      await new Promise(r => setTimeout(r, 800 + Math.floor(Math.random() * 2000)));
      await message.channel.send(reply.slice(0, 350));

      mem.push({ role: 'user', content: prompt }, { role: 'assistant', content: reply.slice(0, 300) });
      while (mem.length > MEMORY_LIMIT * 2) mem.shift();
      state.memory.set(message.channel.id, mem);
      state.stats.replies++;
      persist(userId, tokenIndex);
    } catch (err) {
      console.error('[AIChat] Mesaj işleme hatası:', err.message);
    }
  });

  persist(userId, tokenIndex);
  return true;
}

export function stopAiChat(userId, tokenIndex) {
  const key = `${userId}:${tokenIndex}`;
  const state = sessions.get(key);
  if (!state) { removePersist(userId, tokenIndex); return false; }
  try { state.client.destroy(); } catch { }
  sessions.delete(key);
  removePersist(userId, tokenIndex);
  return true;
}

function persist(userId, tokenIndex) {
  const key = `${userId}:${tokenIndex}`;
  const state = sessions.get(key);
  const store = readModuleJson(FILE);
  if (!state) { delete store[key]; writeModuleJson(FILE, store); return; }
  store[key] = { config: state.config, stats: state.stats, startedAt: state.startedAt };
  writeModuleJson(FILE, store);
}
function removePersist(userId, tokenIndex) {
  const store = readModuleJson(FILE);
  delete store[`${userId}:${tokenIndex}`];
  writeModuleJson(FILE, store);
}

/** Reboot Recovery */
export async function recoverAiChats() {
  const store = readModuleJson(FILE);
  for (const [key, cfg] of Object.entries(store)) {
    const [userId, idxStr] = key.split(':');
    console.log(`[AIChat] Reboot Recovery: ${key} geri yükleniyor...`);
    startAiChat(userId, Number(idxStr), cfg.config).catch(err =>
      console.error(`[AIChat] Recovery hatası (${key}):`, err.message));
  }
}

/** Kullanıcının yüklü key'leri (maskelenmiş gösterim için) */
export function availableProviders(ownerId) {
  const keys = getUserKeys(ownerId);
  const list = [];
  if (keys.groq) list.push('Groq');
  if (keys.gemini) list.push('Gemini');
  return list;
}

/** Config silme (paneldeki "Hesap Kaldır" için) */
export function removeAiConfig(userId, tokenIndex) {
  const store = readModuleJson(FILE);
  const key = `${userId}:${tokenIndex}`;
  if (!store[key]) return false;
  delete store[key];
  writeModuleJson(FILE, store);
  return true;
}
