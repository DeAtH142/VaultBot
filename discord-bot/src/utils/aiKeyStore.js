// src/utils/aiKeyStore.js — 🔑 Kullanıcı başına AI API Key deposu
// Her kullanıcı kendi Groq / Gemini key'ini panelden girer.
// Key'ler tokens.json ile AYNI şifreleme (AES-256-GCM) ile şifreli saklanır.
import { encrypt, decrypt } from './crypto.js';
import { readModuleJson, writeModuleJson } from './moduleStore.js';

const FILE = 'ai_keys.json';

function readStore() {
  return readModuleJson(FILE, {});
}

export function getUserKeys(userId) {
  const store = readStore();
  const entry = store[userId];
  if (!entry) return { groq: null, gemini: null };
  const unwrap = (enc) => {
    if (!enc) return null;
    try { return decrypt(enc); } catch { return null; }
  };
  return {
    groq: unwrap(entry.groq),
    gemini: unwrap(entry.gemini),
  };
}

export function setUserKey(userId, provider, rawKey) {
  const store = readStore();
  if (!store[userId]) store[userId] = {};
  store[userId][provider] = encrypt(rawKey);
  writeModuleJson(FILE, store);
}

export function clearUserKey(userId, provider) {
  const store = readStore();
  if (store[userId]) {
    delete store[userId][provider];
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

/** Provider'a göre test eder */
export async function validateKey(provider, key) {
  return provider === 'groq' ? validateGroqKey(key) : validateGeminiKey(key);
}

/** Maskelenmiş gösterim: sk-...abcd1234 */
export function maskKey(key) {
  if (!key) return '—';
  if (key.length <= 12) return '••••••';
  return `${key.slice(0, 5)}…${key.slice(-6)}`;
}
