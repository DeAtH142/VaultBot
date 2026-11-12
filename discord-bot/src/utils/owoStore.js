// src/utils/owoStore.js
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const OWO_CONFIG_PATH = path.join(DATA_DIR, 'owo_configs.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(OWO_CONFIG_PATH)) fs.writeFileSync(OWO_CONFIG_PATH, '{}', 'utf8');
}

function readStore() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(OWO_CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(store) {
  ensureFile();
  fs.writeFileSync(OWO_CONFIG_PATH, JSON.stringify(store, null, 2), 'utf8');
}

/**
 * Kullanıcının OwO otomasyon ayarlarını kaydet
 */
export function saveOwoConfig(userId, tokenIndex, config) {
  const store = readStore();
  const key = `${userId}:${tokenIndex}`;
  store[key] = {
    userId,
    tokenIndex,
    channelIds: config.channelIds || [],
    captchaKey: config.captchaKey || '',
    targetId: config.targetId || '',
    commands: config.commands || ['owo hunt', 'owo battle', 'owo pray', 'owo daily'],
    enabled: config.enabled !== undefined ? config.enabled : true,
    stats: store[key]?.stats || { huntCount: 0, battleCount: 0, lastRun: null },
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return store[key];
}

/**
 * Tek bir hesabın OwO ayarını al
 */
export function getOwoConfig(userId, tokenIndex) {
  const store = readStore();
  return store[`${userId}:${tokenIndex}`] || null;
}

/**
 * Kullanıcıya ait tüm OwO yapılandırmalarını al
 */
export function getUserOwoConfigs(userId) {
  const store = readStore();
  return Object.values(store).filter(cfg => cfg.userId === userId);
}

/**
 * Tüm kayıtlı yapılandırmaları al (Reboot Recovery için)
 */
export function getAllOwoConfigs() {
  const store = readStore();
  return Object.values(store);
}

/**
 * Otomasyonu durdur/kaldır
 */
export function deleteOwoConfig(userId, tokenIndex) {
  const store = readStore();
  const key = `${userId}:${tokenIndex}`;
  if (store[key]) {
    delete store[key];
    writeStore(store);
    return true;
  }
  return false;
}
