// test-full-flows.mjs — tüm komutların import/construct akışını denetler
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commandsPath = path.join(__dirname, 'src/commands');
const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

let failures = 0;
for (const file of files) {
  try {
    const mod = await import(pathToFileURL(path.join(commandsPath, file)).href);
    const cmd = mod.default;
    if (!cmd?.name) throw new Error('default export eksik / name yok');
    for (const fn of ['execute', 'onButton', 'onSelect', 'onModalSubmit']) {
      if (cmd[fn] && typeof cmd[fn] !== 'function') throw new Error(`${fn} fonksiyon değil`);
    }
    console.log(`✅ ${cmd.name.padEnd(18)} (${file})`);
  } catch (err) {
    failures++;
    console.log(`❌ ${file}: ${err.message}`);
  }
}
console.log(failures === 0 ? '\n🎉 Tüm komut modülleri sağlam.' : `\n💥 ${failures} modül hatalı.`);
