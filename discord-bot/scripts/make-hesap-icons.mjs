// scripts/make-hesap-icons.mjs — ?hesaplarim panel ikonlarını üretir
//
// Kullanım:  node scripts/make-hesap-icons.mjs
// Çıktı:     data/icons/<isim>.png  (64x64)
//
// Bu ikonlar komut açılırken bot tarafından otomatik olarak
// "hesap-panel" adlı özel sunucuya emoji olarak yüklenir.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve('data', 'icons');

const ICONS = {
      bolt: `<path d="M36 4 L14 36 H28 L24 60 L50 24 H34 Z" fill="#fee75c"/>`,

      mic: `<rect x="25" y="8" width="14" height="26" rx="7" fill="#3ba55d"/>
        <path d="M18 30 a14 14 0 0 0 28 0" stroke="#3ba55d" stroke-width="5" stroke-linecap="round"/>
        <path d="M32 44 v8" stroke="#3ba55d" stroke-width="5" stroke-linecap="round"/>
        <path d="M22 54 h20" stroke="#3ba55d" stroke-width="5" stroke-linecap="round"/>`,

      micoff: `<rect x="25" y="8" width="14" height="26" rx="7" fill="#ed4245"/>
        <path d="M18 30 a14 14 0 0 0 28 0" stroke="#ed4245" stroke-width="5" stroke-linecap="round"/>
        <path d="M32 44 v8" stroke="#ed4245" stroke-width="5" stroke-linecap="round"/>
        <path d="M22 54 h20" stroke="#ed4245" stroke-width="5" stroke-linecap="round"/>
        <path d="M10 8 L54 56" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>`,

      headset: `<path d="M12 38 v-4 a20 20 0 0 1 40 0 v4" stroke="#eb459e" stroke-width="6" stroke-linecap="round"/>
        <rect x="8" y="36" width="12" height="20" rx="5" fill="#eb459e"/>
        <rect x="44" y="36" width="12" height="20" rx="5" fill="#eb459e"/>`,

      deafoff: `<path d="M12 38 v-4 a20 20 0 0 1 40 0 v4" stroke="#ed4245" stroke-width="6" stroke-linecap="round"/>
        <rect x="8" y="36" width="12" height="20" rx="5" fill="#ed4245"/>
        <rect x="44" y="36" width="12" height="20" rx="5" fill="#ed4245"/>
        <path d="M10 8 L54 56" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>`,

      cam: `<rect x="8" y="18" width="34" height="28" rx="6" stroke="#ed4245" stroke-width="5"/>
        <path d="M42 28 L56 20 v24 l-14 -8 z" fill="#ed4245"/>
        <circle cx="25" cy="32" r="6" fill="#ed4245"/>`,

      live: `<circle cx="32" cy="32" r="26" stroke="#3ba55d" stroke-width="5"/>
        <circle cx="32" cy="32" r="13" fill="#3ba55d"/>
        <circle cx="48" cy="16" r="6" fill="#ed4245"/>`,

      pad: `<path d="M20 22 h24 a16 16 0 0 1 15 20 l-3 10 a6 6 0 0 1 -10 2 l-6 -6 h-16 l-6 6 a6 6 0 0 1 -10 -2 l-3 -10 a16 16 0 0 1 15 -20 z" stroke="#5865f2" stroke-width="5"/>
        <path d="M22 34 h8 M26 30 v8" stroke="#5865f2" stroke-width="4" stroke-linecap="round"/>
        <circle cx="42" cy="34" r="3.5" fill="#5865f2"/>`,

      spotify: `<circle cx="32" cy="32" r="26" fill="#1DB954"/>
        <path d="M18 24 q18 -5 30 4" stroke="#0b1410" stroke-width="4.5" stroke-linecap="round" fill="none"/>
        <path d="M20 33 q15 -4 25 3" stroke="#0b1410" stroke-width="4.5" stroke-linecap="round" fill="none"/>
        <path d="M22 41 q12 -3 20 3" stroke="#0b1410" stroke-width="4.5" stroke-linecap="round" fill="none"/>`,

      check: `<circle cx="32" cy="32" r="29" fill="#3ba55d"/>
        <path d="M18 33 l10 10 l18 -20" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,

      cross: `<circle cx="32" cy="32" r="29" fill="#ed4245"/>
        <path d="M22 22 l20 20 M42 22 l-20 20" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>`,

      circle: `<circle cx="32" cy="32" r="26" stroke="#474a52" stroke-width="7" fill="none"/>`,
};

const toSvg = (body) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">${body}</svg>`;

fs.mkdirSync(OUT, { recursive: true });

for (const [name, body] of Object.entries(ICONS)) {
      const file = path.join(OUT, `${name}.png`);
      await sharp(Buffer.from(toSvg(body))).png().toFile(file);
      console.log(`✅ ${file}`);
}

console.log(`\n${Object.keys(ICONS).length} ikon üretildi → ${OUT}`);
