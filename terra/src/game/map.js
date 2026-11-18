// src/game/map.js — @napi-rs/canvas ile dinamik harita görselleştirme
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const { collections } = require('../firebase');

const TERRAIN_COLORS = {
  dunya: '#e8e6df',
  su: '#3b82f6',   // mavi
  dag: '#8b5a2b',  // kahverengi
};

/**
 * Haritayı çizer ve Discord attachment döndürür.
 * @param {string} guildId
 * @param {object} guildDoc - guilds dokümanı (mapSize, season, bgUrl)
 */
async function generateMapImage(guildId, guildDoc) {
  const size = guildDoc.mapSize || 15;
  const cell = 40, padding = 10, scoreboardH = 110;
  const width = size * cell + padding * 2;
  const height = size * cell + padding * 2 + scoreboardH;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Arka plan (sunucuya özel logo/arka plan URL'si varsa)
  ctx.fillStyle = '#1e1f22';
  ctx.fillRect(0, 0, width, height);
  if (guildDoc.bgUrl) {
    try {
      const bg = await loadImage(guildDoc.bgUrl);
      ctx.globalAlpha = 0.25;
      ctx.drawImage(bg, 0, 0, width, height);
      ctx.globalAlpha = 1;
    } catch { /* arka plan yüklenemezse yok say */ }
  }

  // Territories ve faction'ları çek (guildId filtresi!)
  const [terrSnap, facSnap] = await Promise.all([
    collections.territories.where('guildId', '==', guildId).get(),
    collections.factions.where('guildId', '==', guildId).get(),
  ]);
  const factionColors = {};
  facSnap.forEach(f => { factionColors[f.id] = f.data().color || '#5865f2'; });

  // Grid çizimi — ada görünümlü: kenarlara doğru su, orta bölge karaya benzer
  terrSnap.forEach(doc => {
    const { x, y, ownerId, terrain } = doc.data();
    const px = padding + x * cell, py = padding + y * cell;
    const cx = size / 2;
    const dist = Math.hypot(x - cx, y - cx) / cx; // 0 merkez, ~1.4 köşe
    const isWaterEdge = dist > 0.85; // kenarlara doğru su

    if (ownerId) {
      ctx.fillStyle = factionColors[`${guildId}_${ownerId}`] || factionColors[ownerId] || '#5865f2';
    } else if (terrain === 'su' || isWaterEdge) {
      // Okyanus degrade: derinlik mesafeye göre artar
      const depth = Math.min(1, Math.max(0, (dist - 0.8) / 0.6));
      ctx.fillStyle = depth > 0.5 ? '#1d4ed8' : '#3b82f6';
    } else if (terrain === 'dag') {
      ctx.fillStyle = '#6b7c4f'; // dağlık arazi
    } else {
      // Düzlük arazi degradesi (açık yeşil)
      ctx.fillStyle = dist > 0.55 ? '#4a7c3f' : '#63a34f';
    }
    ctx.fillRect(px, py, cell, cell);

    // Sahipli karelerde köşe noktaları (ekran görüntüsündeki gibi)
    if (ownerId) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const s = 4;
      [[4,4],[cell-s-4,4],[4,cell-s-4],[cell-s-4,cell-s-4]].forEach(([ox,oy]) => {
        ctx.fillRect(px+ox, py+oy, s, s);
      });
    }
    // Kalın faction sınır çizgisi
    if (ownerId) {
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 3;
      ctx.strokeRect(px+1, py+1, cell-2, cell-2);
    }
    if (terrain === 'dag' && !ownerId) {
      ctx.font = '16px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('▲', px + cell/2 - 6, py + cell/2 + 6);
    }
  });

  // Skorboard: en güçlü 5 ittifak (ekran görüntüsündeki tablo gibi, satır numaralı)
  const top5 = facSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.totalPower || 0) - (a.totalPower || 0))
    .slice(0, 5);
  const sbY = height - scoreboardH;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, sbY - 10, width, scoreboardH);
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText('SIRA  KLAR  AD   GÜÇ', padding, sbY + 18);
  ctx.font = '16px monospace';
  top5.forEach((f, i) => {
    const y = sbY + 44 + i * 22;
    ctx.fillStyle = f.color || '#5865f2';
    ctx.fillRect(padding, y - 12, 12, 12);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${String(i + 1).padStart(2)}    ${(f.name || '?').slice(0, 12).padEnd(12)}  ${f.totalPower || 0} güç`, padding + 24, y);
  });
  if (top5.length === 0) {
    ctx.fillStyle = '#aaa';
    ctx.font = '16px monospace';
    ctx.fillText('Henüz ittifak yok.', padding, sbY + 45);
  }

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'harita.png' });
}

module.exports = { generateMapImage, TERRAIN_COLORS };
