// patch-selfbot-access.mjs
// Kural: her selfbot komutunun execute başına yetki kontrolü ekler (idempotent).
import fs from 'fs';
import path from 'path';

const TARGETS = [
  'owo.js', 'spotify.js', 'mobil.js', 'autotyper.js', 'otomesaj.js', 'otoreact.js',
  'dmsender.js', 'joiner.js', 'giveawayfarmer.js', 'nitrosniper.js', 'mcafk.js',
  'voiceafk.js', 'online.js', 'streamer.js', 'aichat.js',
];
const dir = path.join(process.cwd(), 'src', 'commands');

const GUARD_IMPORT = `import { selfbotDenyEmbed } from '../utils/accessGuard.js';\n`;
const GUARD_SNIPPET = (cmdName) => [
  `    // 🔐 SELFBOT_USERS yetki kontrolü`,
  `    const _deny = selfbotDenyEmbed(message.author.id, '!${cmdName}');`,
  `    if (_deny) return message.reply({ embeds: [_deny] });`,
  ``,
].join('\n');

for (const f of TARGETS) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.warn('skip (yok):', f); continue; }
  let src = fs.readFileSync(p, 'utf8');

  if (src.includes('selfbotDenyEmbed')) { console.log('zaten var:', f); continue; }

  // import ekle (ilk import satırından sonra)
  const importIdx = src.indexOf('from ');
  const firstImportEnd = src.indexOf('\n', src.lastIndexOf('\'', importIdx));
  src = src.slice(0, firstImportEnd + 1) + GUARD_IMPORT + src.slice(firstImportEnd + 1);

  // execute başına guard ekle
  const m = src.match(/async execute\(message[^\)]*\) \{\r?\n/);
  if (!m) { console.warn('execute bulunamadı:', f); continue; }
  const cmdName = f.replace('.js', '');
  src = src.replace(m[0], m[0] + GUARD_SNIPPET(cmdName));

  fs.writeFileSync(p, src);
  console.log('✅ guard eklendi:', f);
}
console.log('Bitti.');
