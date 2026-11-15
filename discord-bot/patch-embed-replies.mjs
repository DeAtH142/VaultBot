// patch-embed-replies.mjs
// Kural: komutlardaki düz metin hata/bilgi cevaplarını ('❌ ...', '✅ ...') markalı embed'e çevirir.
// Yalnız BASTİK single-line message.reply({ content: '...' }) / interaction.reply({ content: '...' })
// çağrılarına dokunur; özel embed içerenlere karışmaz.
import fs from 'fs';
import path from 'path';

const dir = path.join(process.cwd(), 'src', 'commands');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

let patched = 0;
for (const f of files) {
  const p = path.join(dir, f);
  let src = fs.readFileSync(p, 'utf8');
  const orig = src;

  // embeds.js import'u var mı? (COLORS, errorEmbed, infoEmbed kullanacağız)
  const hasEmbeds = /from '\.\.\/utils\/embeds\.js'/.test(src);
  if (!hasEmbeds) continue;

  // import satırına errorEmbed/infoEmbed ekle (yoksa)
  const m = src.match(/import \{([^}]*)\} from '\.\.\/utils\/embeds\.js';/);
  if (m && !/errorEmbed/.test(m[1])) {
    src = src.replace(m[0], `import {${m[1]}, errorEmbed, infoEmbed } from '../utils/embeds.js';`);
  }

  // message.reply({ content: '❌ ...' }) → embed'li versiyon
  // ve message.reply('❌ ...') kısa formu
  src = src.replace(
    /message\.reply\(\s*\{\s*content:\s*('(?:[^'\\]|\\.)*')\s*,?\s*(ephemeral:\s*(?:true|false))?,?\s*\}\s*\)/g,
    (_, content, eph) => `message.reply({ embeds: [errorEmbed(${content})]${eph ? `, ${eph}` : ''} })`
  );
  src = src.replace(
    /message\.reply\(\s*('(?:[^'\\]|\\.)*')\s*\)/g,
    (_, content) => `message.reply({ embeds: [errorEmbed(${content})] })`
  );

  if (src !== orig) {
    fs.writeFileSync(p, src);
    patched++;
    console.log('✏️', f);
  }
}
console.log(`Bitti — ${patched} dosya güncellendi.`);
