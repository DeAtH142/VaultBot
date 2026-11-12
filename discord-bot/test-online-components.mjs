// test-online-components.mjs — !aktif panelinin API payload'ını doğrular
import { createOnlineSystemEmbed, createOnlineSystemComponents } from './src/utils/embeds.js';

const embed = createOnlineSystemEmbed().toJSON();
const components = createOnlineSystemComponents().map(r => r.toJSON());

// Discord API kuralları
let problems = [];
const emb = embed;
if ((emb.title || '').length > 256) problems.push('title > 256');
if ((emb.description || '').length > 4096) problems.push('description > 4096');
(emb.fields || []).forEach(f => {
  if ((f.name || '').length > 256) problems.push('field name > 256');
  if ((f.value || '').length > 1024) problems.push('field value > 1024');
});
if (components.length > 5) problems.push('> 5 action rows');
components.forEach((row, ri) => {
  if (row.components.length > 5) problems.push(`row ${ri}: > 5 components`);
  row.components.forEach(c => {
    if ((c.label || '').length > 80) problems.push(`row ${ri}: label > 80 (${c.label})`);
    if ((c.custom_id || '').length > 100) problems.push(`row ${ri}: custom_id > 100`);
  });
});

console.log(JSON.stringify({ embed, components }, null, 2));
console.log(problems.length ? '❌ PROBLEMLER: ' + problems.join('; ') : '✅ Payload geçerli görünüyor.');
