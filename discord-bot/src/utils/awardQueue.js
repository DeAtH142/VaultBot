// src/utils/awardQueue.js — 🎖️ Kazanım kuyruğu
//
// playtimeStore sadece "eşik doldu" bilgisini üretir; rol verme işi (Discord API,
// yavaş + hata yapabilir) buradan asenkron yürür. Böylece sayaç motoru bloklanmaz.
//
// Kalıcılık: her kazanım playtime.json içinde `pendingAwards` alanına yazılır.
// Rol verilemezse (bot yok / yetki yok / DM kapalı) kayıt silinmez → sonra tekrar denenir.

import { awardTier } from './roleAwarder.js';

const running = new Set(); // aynı kullanıcı için çift işlem önlemi

/**
 * Kazanımları sırayla işle.
 * @param {string} userId
 * @param {Array<{tier:number, name:string, at:string}>} awarded
 * @param {(userId:string, tier:number, result:object) => void} [onResult]
 */
export async function processAwards(userId, awarded, onResult) {
  if (!Array.isArray(awarded) || awarded.length === 0) return [];
  if (running.has(userId)) return [];

  running.add(userId);
  const results = [];

  for (const a of awarded) {
    const usedHours = a.requiredHours ? `${a.requiredHours} saat` : null;
    const nextHours = a.nextRequiredHours ? `${a.nextRequiredHours} saat` : null;

    let result;
    try {
      result = await awardTier(userId, a.tier, {
        usedHours,
        nextHours,
        roleName: a.name,
      });
    } catch (err) {
      result = { success: false, awarded: false, dm: false, error: err.message };
    }

    results.push({ tier: a.tier, ...result });
    if (typeof onResult === 'function') {
      try { onResult(userId, a.tier, result); } catch { }
    }

    if (!result.success) {
      console.warn(`[AwardQueue] Tier ${a.tier} verilemedi: ${result.error}`);
      break; // sonraki tier'lar sırayı bozmasın
    }
  }

  running.delete(userId);
  return results;
}
