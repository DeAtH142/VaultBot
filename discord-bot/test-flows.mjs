// discord-bot/test-flows.mjs — Buton/Select/Modal akış testleri (mock interaction)
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commandsDir = path.join(__dirname, 'src', 'commands');

// ── Mock interaction fabrikası ─────────────────────────────────────────────
let failCount = 0;
const ok = (name, msg) => console.log(`✅ ${name.padEnd(20)} ${msg}`);
const bad = (name, msg, err) => { failCount++; console.error(`❌ ${name.padEnd(20)} ${msg} → ${err?.message || err}`); };

function makeInteraction({ customId, values = [], fields = {} }) {
  const replies = [];
  const shown = [];
  return {
    replies, shown,
    user: { id: '1160564359727173792' },
    customId,
    values,
    fields: {
      getTextInputValue: (k) => { if (!(k in fields)) throw new Error(`modal alanı eksik: ${k}`); return fields[k]; },
    },
    replied: false, deferred: false,
    reply: async (o) => { replies.push({ type: 'reply', o }); },
    deferReply: async (o) => { replies.push({ type: 'defer', o }); },
    editReply: async (o) => { replies.push({ type: 'edit', o }); },
    update: async (o) => { replies.push({ type: 'update', o }); },
    showModal: async (m) => { shown.push(m); },
  };
}

function validatePayload(name, stage, o) {
  if (!o) return;
  // Embed varsa data alanını kontrol et (data URI içeren büyük objelerde stringify patlayabilir)
  for (const e of (o.embeds || [])) {
    if (!e.data || (!e.data.title && !e.data.description && !(e.data.fields || []).length)) {
      throw new Error('embed içeriği boş');
    }
  }
  for (const row of (o.components || [])) {
    for (const c of row.components) {
      if (!c.data.custom_id) throw new Error(`${stage}: customId eksik`);
      const emoji = c.data.emoji;
      if (emoji && !emoji.id && !emoji.name) throw new Error(`${stage}: emoji boş`);
    }
  }
}

async function testCommand(name, cases) {
  const url = pathToFileURL(path.join(commandsDir, `${name}.js`)).href;
  const cmd = (await import(url)).default;

  for (const c of cases) {
    const inter = makeInteraction(c);
    try {
      if (c.kind === 'button') await cmd.onButton(inter, c.customId.split(':').slice(1));
      else if (c.kind === 'select') await cmd.onSelect(inter, c.customId.split(':').slice(1));
      else if (c.kind === 'modal') await cmd.onModalSubmit(inter, c.customId.split(':').slice(1));
      validatePayload(name, c.customId, inter.replies[0]?.o || inter.shown[0]);
      const stage = inter.shown.length ? 'modal açıldı' : (inter.replies.length ? `yanıt: ${inter.replies[0].type}` : 'yanıt yok (asenkron)');
      ok(name, `${c.kind}: ${c.customId} → ${stage}`);
    } catch (err) {
      bad(name, `${c.kind}: ${c.customId}`, err.stack?.split('\n').slice(0, 3).join(' | ') || err);
    }
  }
}

// ── Test senaryoları ───────────────────────────────────────────────────────
await testCommand('autotyper', [
  { kind: 'button', customId: 'autotyper:sec' },
  { kind: 'button', customId: 'autotyper:durdur' },
  { kind: 'button', customId: 'autotyper:tumudurdur' },
  { kind: 'select', customId: 'autotyper:kanalmodal', values: ['0'] },
  { kind: 'select', customId: 'autotyper:durduronay', values: ['0'] },
  { kind: 'modal', customId: 'autotyper:modal:0', fields: { channel_ids: '123456789012345678' } },
]);

await testCommand('voiceafk', [
  { kind: 'button', customId: 'voiceafk:sec' },
  { kind: 'button', customId: 'voiceafk:cogel' },
  { kind: 'button', customId: 'voiceafk:kaldir' },
  { kind: 'select', customId: 'voiceafk:modal', values: ['0'] },
  { kind: 'modal', customId: 'voiceafk:modal:0', fields: { guild_id: '1', channel_id: '2' } }, // gerçek login denenir ama mock'ta hata raporu beklenir
]);

await testCommand('otoreact', [
  { kind: 'button', customId: 'otoreact:baslat' },
  { kind: 'modal', customId: 'otoreact:modal', fields: { message_url: 'hatalı-link', hesaplar: '1', use_custom: 'evet' } },
]);

await testCommand('autoleave', [
  { kind: 'button', customId: 'autoleave:listele' },
  { kind: 'button', customId: 'autoleave:cikis' },
  { kind: 'select', customId: 'autoleave:select:cikis', values: ['0'] },
]);

await testCommand('joiner', [
  { kind: 'button', customId: 'joiner:sec' },
  { kind: 'select', customId: 'joiner:select', values: ['0'] },
  { kind: 'modal', customId: 'joiner:modal:0', fields: { invite: 'https://discord.gg/abcd' } },
]);

await testCommand('profilechanger', [
  { kind: 'button', customId: 'profilechanger:sec' },
  { kind: 'select', customId: 'profilechanger:select', values: ['0'] },
  { kind: 'modal', customId: 'profilechanger:modal:0', fields: { avatar_url: '', banner_url: '', display_name: '', bio: '' } },
]);

await testCommand('friendcleaner', [
  { kind: 'button', customId: 'friendcleaner:baslat' },
  { kind: 'modal', customId: 'friendcleaner:modal', fields: { exclude_ids: '', confirm: 'HAYIR' } },
]);

console.log(failCount === 0 ? '\n🎉 TÜM AKIŞ TESTLERİ GEÇTİ' : `\n💥 ${failCount} akış BAŞARISIZ`);
process.exit(failCount === 0 ? 0 : 1);
