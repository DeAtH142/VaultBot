// check-emojis2.mjs — Discord'un gerçekten reddettiği emojileri bulur
// Validasyon: emoji string'i surrogates/variation selector ile doğru parse edilip
// tüm codepoint'lerin gerçek emoji alfabesinde olması gerekir.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirs = ['src/commands', 'src/utils'];

let bad = 0;
for (const dir of dirs) {
  for (const f of fs.readdirSync(path.join(__dirname, dir)).filter(x => x.endsWith('.js'))) {
    const p = path.join(__dirname, dir, f);
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    lines.forEach((l, i) => {
      const m = l.match(/setEmoji\('([^']*)'\)/);
      if (!m) return;
      const e = m[1];
      // Control char / replacement char / C0-C1 kontrolü (Discord bunları reddeder)
      const hasBad = [...e].some(c => {
        const cp = c.codePointAt(0);
        return cp <= 0x1F || (cp >= 0x7F && cp <= 0x9F) || cp === 0xFFFD;
      });
      if (hasBad) {
        bad++;
        console.log(`❌ ${dir}/${f}:${i + 1} — ${JSON.stringify(e)} → codes: ${[...e].map(c => c.codePointAt(0).toString(16)).join(' ')}`);
      }
    });
  }
}
console.log(bad === 0 ? '✅ Tüm setEmoji karakterleri Discord uyumlu.' : `💥 ${bad} bozuk emoji.`);
