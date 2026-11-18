// src/utils/schemas.js — Firestore şema kurucuları ve yardımcılar
const { collections, FieldValue, db } = require('../firebase');

const MAP_SIZES = { kucuk: 10, orta: 15, buyuk: 20 };
const TERRAINS = ['dunya', 'su', 'dag']; // düz arazi, su, dağ
const ATTACK_COOLDOWN_MS = 15 * 1000;
const POWER_INTERVAL_MS = 5 * 60 * 1000; // 5 dakika
const POWER_PER_TICK = 1;

function defaultGuildDoc() {
  return {
    channelId: null,
    gameEnabled: false,
    mapSize: MAP_SIZES.orta,
    season: 1,
    bgUrl: null,
    messageIds: {},
    createdAt: FieldValue.serverTimestamp(),
  };
}

async function registerGuildDoc(guildId) {
  const ref = collections.guilds.doc(guildId);
  const snap = await ref.get();
  if (!snap.exists) await ref.set(defaultGuildDoc());
  return ref;
}

// Oyun başlatıldığında harita karelerini oluştur
async function initTerritories(guildId, size) {
  const batch = db.batch();
  const snap = await collections.territories.where('guildId', '==', guildId).get();
  snap.forEach(d => batch.delete(d.ref));
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const terrain =
        (x + y) % 13 === 0 ? 'su' : (x * y) % 17 === 0 ? 'dag' : 'dunya';
      batch.set(collections.territories.doc(`${guildId}_${x}_${y}`), {
        guildId, x, y, ownerId: null, terrain,
      });
    }
  }
  await batch.commit();
}

module.exports = {
  MAP_SIZES, TERRAINS, ATTACK_COOLDOWN_MS, POWER_INTERVAL_MS, POWER_PER_TICK,
  defaultGuildDoc, registerGuildDoc, initTerritories,
};
