// src/utils/gemManager.js — PRO EDITION
// OwO envanter formatına göre doğru gem parse'ı:
// - Item ID solda, miktar sağda (örn: "51 <:_:emoji> x3")
// - Gem ID aralıkları: Hunting 51-57, Empowering 65-71, Lucky 72-78
// - Miktar x0 olanlar "sahip" sayılmaz

// 1. Hunting Gems (Avlanma Taşları): 51 -> 57 (En iyisi 57)
export const HUNTING_GEMS = [57, 56, 55, 54, 53, 52, 51];

// 2. Empowering Gems (Güçlendirme Taşları): 71 -> 65 (En iyisi 71)
export const EMPOWERING_GEMS = [71, 70, 69, 68, 67, 66, 65];

// 3. Lucky Gems (Şans Taşları): 78 -> 72 (En iyisi 78)
export const LUCKY_GEMS = [78, 77, 76, 75, 74, 73, 72];

const ALL_GEM_IDS = new Set([...HUNTING_GEMS, ...EMPOWERING_GEMS, ...LUCKY_GEMS]);

/**
 * OwO envanter mesajından sahip olunan gemleri ve miktarlarını çıkarır.
 *
 * OwO gerçek envanter formatı örnekleri:
 *   `51 <:gem:123> x3`          (satır başı ID, sonra emoji, sonra x miktar)
 *   `**57** <:gem:456> \`x1\``
 *   `├ 74 <:gem:789> x5`
 *
 * @param {string} text - OwO'dan gelen mesaj içeriği veya embed açıklaması
 * @returns {Map<number, number>} - gemId -> miktar (x0 / miksız olanlar dahil edilmez)
 */
export function parseOwnedGemsFromInventory(text) {
  const owned = new Map();
  if (!text) return owned;

  // OwO gerçek envanter formatı (görselden doğrulandı):
  //   `[ 051 💍 23 ]`  `[ 056 🔴 16 ]`  `[ 099 🔷 02 ]`  `[ 103 🏑 01 ]`
  // ID köşeli parantez içinde, miktar sonda x'siz çıplak sayı.
  // Alternatif eski format da desteklenir: "51 <emoji> x3"

  // 1) Birincil: [ 051 ... 23 ] köşeli parantezli format
  const bracketRegex = /\[\s*(\d{2,3})\s+[^\]]*?(\d{1,4})\s*\]/g;
  let m;
  while ((m = bracketRegex.exec(text)) !== null) {
    const gemId = parseInt(m[1], 10);
    if (!ALL_GEM_IDS.has(gemId)) continue;
    const qty = parseInt(m[2], 10);
    if (qty <= 0) continue;
    owned.set(gemId, (owned.get(gemId) || 0) + qty);
  }

  // 2) Yedek: satır bazlı eski format ("51 <emoji> x3")
  if (owned.size === 0) {
    const lines = text.split(/\n|\r/);
    for (const rawLine of lines) {
      const line = rawLine.replace(/\*\*/g, '').trim();
      if (!line) continue;

      const idMatch = line.match(/(?:^|[^0-9])([0-9]{2})(?:[^0-9]|$)/);
      if (!idMatch) continue;
      const gemId = parseInt(idMatch[1], 10);
      if (!ALL_GEM_IDS.has(gemId)) continue;

      const qtyMatch = line.match(/[x×]\s*(\d+)/i);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
      if (qty <= 0) continue;
      owned.set(gemId, (owned.get(gemId) || 0) + qty);
    }
  }

  // 3) Son çare: ID geçen ama miktar okunamayan taşları 1 kabul et
  if (owned.size === 0) {
    const fallback = /(?:^|[^\d])(5[1-7]|6[5-9]|7[0-8])(?![\d])/g;
    while ((m = fallback.exec(text)) !== null) {
      const gemId = parseInt(m[1], 10);
      if (ALL_GEM_IDS.has(gemId)) owned.set(gemId, 1);
    }
  }

  return owned;
}

/**
 * Sahip olunan taşlar arasından her kategorinin EN İYİSİNİ seçer
 * @param {Map<number,number>|Set<number>|number[]} ownedGems
 * @returns {number[]} - Kullanılacak [hunting, empowering, lucky] en iyi taş ID'leri
 */
export function selectBestGemsToUse(ownedGems) {
  // Normalize: her şeyi Map'e çevir (qty > 0 olanlar)
  const owned = new Map();
  if (ownedGems instanceof Map) {
    for (const [id, qty] of ownedGems) if (qty > 0) owned.set(id, qty);
  } else if (ownedGems instanceof Set) {
    for (const id of ownedGems) owned.set(id, 1);
  } else if (Array.isArray(ownedGems)) {
    for (const id of ownedGems) owned.set(id, 1);
  }

  const bestToUse = [];

  for (const tierList of [HUNTING_GEMS, EMPOWERING_GEMS, LUCKY_GEMS]) {
    for (const id of tierList) {
      if (owned.has(id)) {
        bestToUse.push(id);
        break;
      }
    }
  }

  return bestToUse;
}
