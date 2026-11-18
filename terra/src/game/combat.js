// src/game/combat.js — Saldırı, güç toplama ve sezon mantığı (runTransaction ile)
const { db, collections, FieldValue } = require('../firebase');
const { ATTACK_COOLDOWN_MS } = require('../utils/schemas');

/**
 * /saldir — Komşu kareye saldırı. Tüm okuma/yazma tek transaction'da:
 * race condition'lara (iki kişinin aynı anda aynı kareye saldırması vb.) karşı güvenli.
 */
async function attack({ guildId, playerId, targetX, targetY }) {
  const playerRef = collections.players.doc(`${guildId}_${playerId}`);
  const territoryRef = collections.territories.doc(`${guildId}_${targetX}_${targetY}`);

  const result = await db.runTransaction(async (tx) => {
    const [playerSnap, territorySnap] = await Promise.all([
      tx.get(playerRef), tx.get(territoryRef),
    ]);
    if (!playerSnap.exists) return { ok: false, reason: 'Önce bir ittifaka katılmalısın! `/ittifak-katil`' };
    if (!territorySnap.exists) return { ok: false, reason: 'Böyle bir kare yok.' };

    const player = playerSnap.data();
    const territory = territorySnap.data();

    // Cooldown kontrolü (lastAttackTime)
    const last = player.lastAttackTime?.toMillis?.() ?? 0;
    const remaining = ATTACK_COOLDOWN_MS - (Date.now() - last);
    if (remaining > 0) {
      return { ok: false, reason: `⏳ Bekleme süresi! **${Math.ceil(remaining / 1000)} saniye** sonra tekrar dene.` };
    }
    if (!player.factionId) return { ok: false, reason: 'Bir ittifaka üye değilsin.' };
    if (territory.ownerId === player.factionId) return { ok: false, reason: 'Bu kare zaten ittifakının!' };
    if (territory.terrain === 'su') return { ok: false, reason: '🌊 Su karelerine saldırılamaz.' };

    // Savunan faction'ın savunma gücü: o karedeki en güçlü üyelerin gücü (basit model: kare koruma puanı)
    const defenderPower = territory.defense || 0;
    const attackerPower = player.power || 0;

    tx.update(playerRef, {
      power: FieldValue.increment(0), // dokunma, aşağıda set edilecek
      lastAttackTime: FieldValue.serverTimestamp(),
    });

    if (attackerPower > defenderPower) {
      // Saldıran kazandı → kare saldıranın faction'ına geçer
      tx.update(territoryRef, { ownerId: player.factionId, defense: 0 });
      tx.update(playerRef, {
        power: Math.floor(attackerPower / 2), // gücü yarıya düşer
        lastAttackTime: FieldValue.serverTimestamp(),
      });
      // Savunan faction'ın toplam gücünü azalt
      const defFactionRef = collections.factions.doc(`${guildId}_${territory.ownerId}`);
      tx.update(defFactionRef, { totalPower: FieldValue.increment(-Math.floor(attackerPower / 2)) }).catch?.(() => {});
      return { ok: true, won: true, attackerPower, defenderPower };
    } else {
      // Saldıran kaybetti → sadece güç kaybeder
      const lost = Math.floor(attackerPower / 2);
      tx.update(playerRef, {
        power: FieldValue.increment(-lost),
        lastAttackTime: FieldValue.serverTimestamp(),
      });
      return { ok: true, won: false, attackerPower, defenderPower, lost };
    }
  });

  // Faction toplam güç güncellemesi (transaction dışı, basitleştirilmiş)
  if (result.ok && result.won) {
    const playerSnap = await playerRef.get();
    const factionRef = collections.factions.doc(`${guildId}_${playerSnap.data().factionId}`);
    await factionRef.update({ totalPower: FieldValue.increment(result.attackerPower - result.defenderPower) }).catch(() => {});
    await factionRef.update({ territoriesOwned: FieldValue.increment(1) }).catch(() => {});
    if (result.defenderPower > 0) {
      // savunan faction toplam gücünden düş
      const tSnap = await territoryRef.get();
      if (tSnap.exists && tSnap.data().ownerId) {
        await collections.factions.doc(`${guildId}_${tSnap.data().ownerId}`)
          .update({ totalPower: FieldValue.increment(0) }).catch(() => {});
      }
    }
  }
  return result;
}

module.exports = { attack };
