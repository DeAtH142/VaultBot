// src/utils/aiKeyStore.js — 🔑 Kullanıcı başına AI API Key deposu v3
// Groq / Gemini / OpenAI key'leri AES-256-GCM ile şifreli saklanır.
// v3: OpenAI desteği + setUserKeyAndDiscover (otomatik model keşfi)
import { encrypt, decrypt } from './crypto.js';
import { readModuleJson, writeModuleJson } from './moduleStore.js';

const FILE = 'ai_keys.json';

function readStore() {
  return readModuleJson(FILE, {});
}

export function getUserKeys(userId) {
  const store = readStore();
  const entry = store[userId];
  if (!entry) return { groq: null, gemini: null, openai: null };
  const unwrap = (enc) => {
    if (!enc) return null;
    try { return decrypt(enc); } catch { return null; }
  };
  return {
    groq: unwrap(entry.groq),
    gemini: unwrap(entry.gemini),
    openai: unwrap(entry.openai),
  };
}

export function setUserKey(userId, provider, rawKey) {
  const store = readStore();
  if (!store[userId]) store[userId] = {};
  store[userId][provider] = encrypt(rawKey);
  writeModuleJson(FILE, store);
}

/**
 * Key'i kaydeder + hemen ardından tüm modelleri test eder.
 * Circular import riskini dynamic import ile çözer.
 */
export async function setUserKeyAndDiscover(userId, provider, rawKey) {
  setUserKey(userId, provider, rawKey);
  try {
    const { discoverAndSaveModels } = await import('./aiChatRunner.js');
    return await discoverAndSaveModels(userId, provider, rawKey);
  } catch (err) {
    return {
      success: false,
      error: `Model keşfi başlatılamadı: ${err.message}`,
      note: 'Key kaydedildi, sadece model testi yapılamadı.',
    };
  }
}

export function clearUserKey(userId, provider) {
  const store = readStore();
  if (store[userId]) {
    delete store[userId][provider];
    writeModuleJson(FILE, store);
  }
}

export async function clearAllUserKeys(userId) {
  const store = readStore();
  if (store[userId]) {
    delete store[userId];
    writeModuleJson(FILE, store);
  }
}

// ── Key geçerlilik testi ────────────────────────────────────────────────

export async function validateGroqKey(key) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401) return { ok: false, reason: 'Key geçersiz (401)' };
    if (!res.ok) return { ok: false, reason: `API hatası ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'Bağlantı hatası: ' + err.message };
  }
}

export async function validateGeminiKey(key) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (res.status === 400 || res.status === 403) return { ok: false, reason: 'Key geçersiz' };
    if (!res.ok) return { ok: false, reason: `API hatası ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'Bağlantı hatası: ' + err.message };
  }
}

export async function validateOpenAIKey(key) {
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401) return { ok: false, reason: 'Key geçersiz (401)' };
    if (!res.ok) return { ok: false, reason: `API hatası ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'Bağlantı hatası: ' + err.message };
  }
}

export async function validateKey(provider, key) {
  if (provider === 'groq') return validateGroqKey(key);
  if (provider === 'gemini') return validateGeminiKey(key);
  return validateOpenAIKey(key);
}

export function maskKey(key) {
  if (!key) return '—';
  if (key.length <= 12) return '••••••';
  return `${key.slice(0, 5)}…${key.slice(-6)}`;
}
