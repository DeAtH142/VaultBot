// src/utils/aiChatRunner.js — 🤖 AI Chat Runner (Groq + Gemini)
// Seçili hesap belirli kanallarda insan gibi konuşur. Cevaplar Groq (öncelikli) veya Gemini'den gelir.
// API key'ler HER KULLANICININ kendine ait — panelen girilir, AES ile şifreli saklanır.
import { Client } from 'discord.js-selfbot-v13';
import { decrypt } from './crypto.js';
import { getToken } from './tokenStore.js';
import { getUserKeys } from './aiKeyStore.js';
import { readModuleJson, writeModuleJson } from './moduleStore.js';

const FILE = 'ai_chats.json';
const sessions = new Map(); // `${userId}:${tokenIndex}` -> { client, config, memory: Map<channelId, string[]> }
const MEMORY_LIMIT = 12;    // kanal başı son N mesaj hatırlanır (bağlam)

// ── API sağlayıcılar ────────────────────────────────────────────────────

async function askGroq(prompt, history, apiKey) {
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) throw new Error('Groq API key bulunamadı! `!aichat` panelinden ekleyin.');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
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

async function askGemini(prompt, history, apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Gemini API key bulunamadı! `!aichat` panelinden ekleyin.');
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const contents = history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 180, temperature: 0.9 } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Gemini API hatası ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

/** Sırayla dener: önce Groq, başarısızsa Gemini (kullanıcının kendi key'leriyle) */
export async function askAI(ownerId, prompt, history = []) {
  const userKeys = getUserKeys(ownerId);
  const providers = [];
  if (userKeys.groq) providers.push(['groq', askGroq, userKeys.groq]);
  if (userKeys.gemini) providers.push(['gemini', askGemini, userKeys.gemini]);
  if (providers.length === 0) throw new Error('AI key bulunamadı! `!aichat` panelinden Groq veya Gemini key ekleyin.');

  const msgs = [...history, { role: 'user', content: prompt }];
  let lastErr;
  for (const [name, fn, key] of providers) {
    try {
      const out = await fn(prompt, msgs, key);
      if (out) return out;
    } catch (err) {
      lastErr = err;
      console.error(`[AIChat] ${name} hatası:`, err.message);
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
      // sadece izinli kanallar
      if (!config.channelIds.includes(message.channel.id)) return;
      // kendisi & botlar hariç
      if (message.author.id === client.user.id) return;
      if (message.author.bot) return;
      // bağlam (kanal bazlı son N mesaj)
      const mem = state.memory.get(message.channel.id) || [];
      const prompt = message.content.slice(0, 500);
      if (!prompt) return;

      const history = [
        { role: 'system', content: config.systemPrompt || 'Sen normal bir Discord kullanıcısısın. Kısa, doğal ve samimi cevap ver. Türkçe konuş. Emoji kullanabilirsin. Uzun listeden kaçın.' },
        ...mem.map(m => ({ role: m.role, content: m.content })),
      ];

      const reply = await askAI(state.ownerId, prompt, history);
      if (!reply) return;

      // doğallık: cevaptan önce kısa rastgele bekleme
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
