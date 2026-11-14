// src/utils/eligibility.js — 🎯 "Uygun sistem" tanımının TEK kaynağı
//
// Rol süresine sayılacak modüller burada tanımlıdır. Yeni bir modül eklemek/
// çıkarmak istediğinde SADECE bu dosyayı düzenle.
//
//   ELIGIBLE  → süreye sayılır (kullanıcının gerçekten hesabını canlı tuttuğu işler)
//   NON_ELIGIBLE → çalışabilir ama puanlanmaz (tek seferlik / kampanya araçları)
//
// Modüllerin her biri "userId, tokenIndex" imzasıyla `is...Running()` fonksiyonu
// dışa aktarıyor. Buradaki `probe` fonksiyonları, kullanıcının kasasındaki
// hesapları dolaşıp hangilerinin çalıştığını urbuner.

import { getTokens } from './tokenStore.js';

import { isAccountSessionActive } from './accountManager.js';
import { isOwoRunning } from './owoRunner.js';
import { isAutoTyperRunning } from './autoTyperRunner.js';
import { isVoiceAfkRunning } from './voiceAfkRunner.js';
import { isMobileStatusRunning } from './mobileStatusRunner.js';
import { isVoiceRecordingRunning } from './voiceRecRunner.js';
import { isSpotifyRunning } from './spotifyPresenceRunner.js';

/**
 * Uygun sistemler — anahtar, oturum anahtarı olarak da kullanılır ("online:0").
 * @type {Record<string, { label: string, emoji: string, probe: Function }>}
 */
export const ELIGIBLE = {
  online: { label: 'Online Tutma', emoji: '🟢', probe: (u, i) => isAccountSessionActive(u, i) },
  owo: { label: 'OwO Otomasyon', emoji: '⚔️', probe: (u, i) => isOwoRunning(u, i) },
  autotyper: { label: 'AutoTyper', emoji: '⌨️', probe: (u, i) => isAutoTyperRunning(u, i) },
  voiceafk: { label: 'Ses AFK', emoji: '🔊', probe: (u, i) => isVoiceAfkRunning(u, i) },
  mobil: { label: 'Mobil Status', emoji: '📱', probe: (u, i) => isMobileStatusRunning(u, i) },
  voicerec: { label: 'Ses Kayıt', emoji: '🎙️', probe: (u, i) => isVoiceRecordingRunning(u, i) },
  spotify: { label: 'Spotify Presence', emoji: '🎵', probe: (u, i) => isSpotifyRunning(u, i) },
};
// NOT: aichat (AI Chat) ve otomesaj (Oto Mesaj) bilinçli olarak KAPALI.
// Bunlar süreye sayılmaz — aşağıdaki NON_ELIGIBLE grubundadır.

/**
 * Sayılmayan modüller (bilgi amaçlı; panelde "puanlanmaz" diye gösterilir).
 * Tek seferlik araçlar: checker, joiner, dmsender, nitrosniper...
 */
export const NON_ELIGIBLE = new Set([
  'checker', 'joiner', 'dmsender', 'nitrosniper', 'giveawayfarmer',
  'friendcleaner', 'autoleave', 'otoreact', 'profilechanger', 'boostcheck',
  'aichat', 'otomesaj',
]);

/** Kullanıcının kasasındaki hesap indexlerini döndürür (yoksa boş) */
function tokenIndexes(userId) {
  const tokens = getTokens(userId);
  return tokens.map((_, i) => i);
}

/**
 * Kullanıcının uygun sistem oturum anahtarlarını topla.
 * @param {string} userId
 * @param {{ isLive?: (fullKey: string) => boolean }} [opts]  canlılık filtresi
 */
export function collectEligibleKeys(userId, opts = {}) {
  const isLive = typeof opts.isLive === 'function' ? opts.isLive : null;
  const indexes = tokenIndexes(userId);
  const keys = [];

  for (const [source, meta] of Object.entries(ELIGIBLE)) {
    const perAccount = keysForSource(source, meta, userId, indexes);
    for (const k of perAccount) {
      if (isLive && !isLive(`${userId}:${escaped(k)}`)) continue;
      keys.push(k);
    }
  }
  return [...new Set(keys)];
}

/** Tek bir kaynağın canlı anahtarları (hooks tarafındaki filtreden bağımsız) */
export function collectSourceKeys(userId, source) {
  const meta = ELIGIBLE[source];
  if (!meta) return [];
  return keysForSource(source, meta, userId, tokenIndexes(userId));
}

function keysForSource(source, meta, userId, indexes) {
  const out = [];
  for (const i of indexes) {
    let running = false;
    try { running = meta.probe(userId, i) === true; } catch { running = false; }
    if (running) out.push(`${source}:${i}`);
  }
  // Hedef kullanıcı bazlı (hesap bağımsız) modüller
  if (meta.global) {
    let running = false;
    try { running = meta.probe(userId) === true; } catch { running = false; }
    if (running) out.push(`${source}:global`);
  }
  return out;
}

/** Oturum anahtarındaki ':' karakterini Map anahtarı için güvenli tut */
function escaped(key) { return key; }

/** Bilgi amaçlı: uygun modül listesi (panelde gösterilir) */
export function listEligibleModules() {
  return Object.entries(ELIGIBLE).map(([key, meta]) => ({ key, label: meta.label, emoji: meta.emoji }));
}
