// discord-bot/test-modules.mjs — Modül smoke testi
// Her yeni komut modülünü import eder, panel oluşturmayı ve builder yapılarını test eder.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commandsDir = path.join(__dirname, 'src', 'commands');

const modules = ['autotyper', 'voiceafk', 'otoreact', 'autoleave', 'joiner', 'profilechanger', 'friendcleaner'];

let failures = 0;

for (const name of modules) {
  try {
    const url = pathToFileURL(path.join(commandsDir, `${name}.js`)).href;
    const mod = await import(url);
    const cmd = mod.default;

    if (!cmd?.name) throw new Error('default export eksik/name yok');

    // execute'u sahte message ile çağır — reply embed + components döndürmeli
    const captured = [];
    const fakeMessage = {
      client: { user: { displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png', id: 'test' } },
      channel: { id: '123' },
      author: { id: 'test' },
      reply: async (opts) => { captured.push(opts); return { id: 'm' }; },
    };

    await cmd.execute(fakeMessage);

    const opts = captured[0];
    if (!opts?.embeds?.length) throw new Error('execute embed göndermedi');
    const embed = opts.embeds[0];
    if (!embed.data?.title && !embed.data?.description) throw new Error('embed boş');

    // Component doğrulama: customId ve emoji'lerin geçerliliği
    let compCount = 0;
    for (const row of (opts.components || [])) {
      for (const c of row.components) {
        compCount++;
        if (!c.data.custom_id) throw new Error('customId eksik: ' + JSON.stringify(c.data));
        const emoji = c.data.emoji;
        if (emoji && !emoji.id && !/^[\p{L}\p{N}\p{P}\p{S}\p{Cs}\p{So}\u200d\uFE0F\u2190-\u21FF\u2600-\u27FF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]+$/u.test(emoji.name)) {
          throw new Error(`geçersiz emoji: '${emoji.name}' (${c.data.custom_id})`);
        }
      }
    }

    console.log(`✅ ${name.padEnd(16)} — execute OK, embed OK, ${compCount} component OK`);
  } catch (err) {
    failures++;
    console.error(`❌ ${name.padEnd(16)} — ${err.message}`);
  }
}

console.log(failures === 0 ? '\n🎉 TÜM TESTLER GEÇTİ' : `\n💥 ${failures} modül BAŞARISIZ`);
process.exit(failures === 0 ? 0 : 1);
