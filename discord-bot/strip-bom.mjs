// strip-bom.mjs — Dosya başındaki bozuk BOM/byte'ları temizler
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Kullanım: node strip-bom.mjs <dosya>'); process.exit(1); }

let raw = fs.readFileSync(file, 'utf8');

// BOM (U+FEFF) ve baştaki control/bozuk byte'ları kaldır
const cleaned = raw.replace(/^[\uFEFF\u0000-\u001F]+/, (m) => m.includes('\n') ? '\n' : '');

if (cleaned !== raw) {
  fs.writeFileSync(file, cleaned, 'utf8');
  console.log(`BOM TEMIZLENDI: ${file} (${raw.length - cleaned.length} byte atıldı)`);
} else {
  console.log(`SKIP (zaten temiz): ${file}`);
}
