// patch-autotyper.mjs — bozuk emoji'leri ve bozuk satırları temizler
import fs from 'node:fs';
const p = 'src/commands/autotyper.js';
let s = fs.readFileSync(p, 'utf8');

// setEmoji satırlarını line-by-line regex ile düzelt
const lines = s.split(/\r?\n/);
const emojiMap = {
  'autotyper:sec': '👤',
  'autotyper:durdur': '⏹️',
  'autotyper:tumudurdur': '🛑',
};
for (let i = 0; i < lines.length; i++) {
  for (const [id, emoji] of Object.entries(emojiMap)) {
    if (lines[i].includes(`setCustomId('${id}')`)) {
      lines[i] = lines[i].replace(/setEmoji\('[^']*'\)/, `setEmoji(${JSON.stringify(emoji)})`);
    }
  }
}
s = lines.join('\n');
fs.writeFileSync(p, s, 'utf8');
console.log('emojiler düzeltildi');
