// src/utils/aiKeyStore.js — 🔑 Kullanıcı başına AI API Key deposu v2
// Her kullanıcı kendi Groq / Gemini key'ini panelden girer.
// Key'ler tokens.json ile AYNI şifreleme (AES-256-GCM) ile şifreli saklanır.
// v2: Key kaydedildikten sonra otomatik model keşfi (setUserKeyAndDiscover)
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

/**
 * Key'i kaydeder VE hemen ardından tüm modelleri test edip
 * çalışanları data/ai-models.json'a kaydeder.
 * Circular import riskini önlemek için dynamic import kullanır.
 *
 * Dönüş: { success, working?, total?, error? }
 */
export async function setUserKeyAndDiscover(userId, provider, rawKey) {
  // 1. Önce key'i güvenli şekilde kaydet
  setUserKey(userId, provider, rawKey);

  // 2. Sonra model keşfini çalıştır (dynamic import → circular yok)
  try {
    const { discoverAndSaveModels } = await import('./aiChatRunner.js');
    const result = await discoverAndSaveModels(userId, provider, rawKey);
    return result;
  } catch (err) {
    // Keşif başarısız olsa bile key kaydedildi — kullanıcıya bilgi ver
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

/**
 * Kullanıcının TÜM key'lerini sil + model deposundan da temizle.
 */
export async function clearAllUserKeys(userId) {
  const store = readStore();
  if (store[userId]) {
    delete store[userId];
    writeModuleJson(FILE, store);
  }
  // Model deposundan kullanıcının çalışan modellerini temizleme gerek yok —
  // modeller provider'a göre global tutuluyor (aynı provider = aynı liste).
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

/** Maskelenmiş gösterim: gsk_a…bc1234 */
export function maskKey(key) {
  if (!key) return '—';
  if (key.length <= 12) return '••••••';
  return `${key.slice(0, 5)}…${key.slice(-6)}`;
}
