// patch-owo-emoji.mjs — createMainControlRows içindeki bozuk emojileri düzeltir
import fs from 'node:fs';
const p = 'src/commands/owo.js';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
const emojiMap = {
  'owo:sec': '👤',
  'owo:kaldir': '🗑️',
  'owo:restart': '🔄',
};
let fixed = 0;
for (let i = 0; i < lines.length; i++) {
  for (const [id, emoji] of Object.entries(emojiMap)) {
    if (lines[i].includes(`setCustomId('${id}')`)) {
      // sonraki 3 satır içindeki setEmoji'yi bul
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        if (lines[j].includes('setEmoji(')) {
          lines[j] = lines[j].replace(/setEmoji\(.*\)/, `setEmoji(${JSON.stringify(emoji)})`);
          fixed++;
          break;
        }
      }
      // label'daki bozuk karakterleri de düzelt (Ba�xlat → Başlat)
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        if (lines[j].includes('setLabel(')) {
          lines[j] = lines[j].replace(/Ba\ufffdxlat/g, 'Başlat');
        }
      }
    }
  }
}
fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log(`${fixed} emoji düzeltildi`);
