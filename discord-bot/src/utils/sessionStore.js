// src/utils/sessionStore.js — ✨ Genel Amaçlı Kalıcı Oturum Deposu ✨
// AutoTyper / VoiceAFK / AutoReact gibi modüllerin oturum ayarlarını
// data/sessions.json içinde saklar. Reboot recovery bu dosyadan okur.
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_PATH = path.join(DATA_DIR, 'sessions.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(SESSIONS_PATH)) fs.writeFileSync(SESSIONS_PATH, '{}', 'utf8');
}

export function readSessions() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function writeSessions(store) {
  ensureFile();
  fs.writeFileSync(SESSIONS_PATH, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * @param {string} module - 'autotyper' | 'voiceafk' | ...
 * @param {string} userId
 * @param {number} tokenIndex
 * @param {object} data - saklanacak ayarlar
 */
export function saveSession(module, userId, tokenIndex, data) {
  const store = readSessions();
  const key = `${userId}:${tokenIndex}`;
  store[module] = store[module] || {};
  store[module][key] = { userId, tokenIndex, ...data, updatedAt: new Date().toISOString() };
  writeSessions(store);
}

export function getSession(module, userId, tokenIndex) {
  const store = readSessions();
  return store[module]?.[`${userId}:${tokenIndex}`] || null;
}

export function deleteSession(module, userId, tokenIndex) {
  const store = readSessions();
  const key = `${userId}:${tokenIndex}`;
  if (store[module]?.[key]) {
    delete store[module][key];
    writeSessions(store);
    return true;
  }
  return false;
}

export function getUserSessions(module, userId) {
  const store = readSessions();
  return Object.values(store[module] || {}).filter(s => s.userId === userId);
}

export function getAllSessions(module) {
  return Object.values(readSessions()[module] || {});
}

export function deleteAllUserSessions(module, userId) {
  const store = readSessions();
  if (store[module]) {
    const keys = Object.keys(store[module]).filter(k => k.startsWith(`${userId}:`));
    keys.forEach(k => delete store[module][k]);
    writeSessions(store);
    return keys.length;
  }
  return 0;
}
