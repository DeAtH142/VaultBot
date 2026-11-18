// src/game/power.js — Güç toplama zamanlayıcısı ve sezon sıfırlama
const { db, collections, FieldValue } = require('../firebase');
const { POWER_INTERVAL_MS, POWER_PER_TICK } = require('../utils/schemas');

// Her POWER_INTERVAL_MS'te tüm oyuncuların gücünü arttır (guildId bazlı)
async function powerTick() {
  const snap = await collections.players
    .where('power', '<', Number.MAX_SAFE_INTEGER) // tüm players
    .get();
  const batch = db.batch();
  snap.forEach(doc => {
    batch.update(doc.ref, {
      power: FieldValue.increment(POWER_PER_TICK),
      lastPowerTime: FieldValue.serverTimestamp(),
    });
  });
  if (!snap.empty) await batch.commit();
  console.log(`⚡ Güç tick: ${snap.size} oyuncu güncellendi.`);
}

function startPowerScheduler() {
  setInterval(() => powerTick().catch(console.error), POWER_INTERVAL_MS);
}

// /sezon-sifirla — Yeni sezon: tüm kare sahiplerini sıfırla, güçleri temizle
async function resetSeason(guildId) {
  const guildRef = collections.guilds.doc(guildId);
  let season = 1;
  await db.runTransaction(async (tx) => {
    const guildSnap = await tx.get(guildRef);
    season = ((guildSnap.data()?.season) || 0) + 1;
    tx.update(guildRef, { season });
  });

  // Territories sahiplerini sıfırla
  const terrSnap = await collections.territories.where('guildId', '==', guildId).get();
  const batch1 = db.batch();
  terrSnap.forEach(d => batch1.update(d.ref, { ownerId: null, defense: 0 }));
  if (!terrSnap.empty) await batch1.commit();

  // Faction güçlerini sıfırla
  const facSnap = await collections.factions.where('guildId', '==', guildId).get();
  const batch2 = db.batch();
  facSnap.forEach(d => batch2.update(d.ref, { totalPower: 0, territoriesOwned: 0 }));
  if (!facSnap.empty) await batch2.commit();

  // Oyuncu güçlerini temizle
  const plSnap = await collections.players.where('guildId', '==', guildId).get();
  const batch3 = db.batch();
  plSnap.forEach(d => batch3.update(d.ref, { power: 0 }));
  if (!plSnap.empty) await batch3.commit();

  return season;
}

module.exports = { powerTick, startPowerScheduler, resetSeason };
