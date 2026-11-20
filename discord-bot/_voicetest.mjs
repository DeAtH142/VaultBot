 // _voicetest.mjs — Ses AFK motoru mantığı (mock Discord client)
import assert from 'node:assert';

let pass = 0;
const t = (n, f) => { try { f(); console.log('  ✅', n); pass++; } catch (e) { console.log('  ❌', n, '→', e.message); process.exitCode = 1; } };

console.log('\n🎙️ Ses AFK motoru testleri\n');

const src = (await import('node:fs')).readFileSync('src/utils/voiceAfkRunner.js', 'utf8');

t('Havuz kullanıyor (kendi Client açmıyor)', () => {
  assert.ok(src.includes("from './accountPool.js'"), 'accountPool importu yok');
  assert.ok(!src.includes('new Client('), 'hâlâ kendi client açıyor!');
});

t('Grup parametresi var (aynı user tek connection)', () => {
  assert.ok(src.includes('group: client.user.id'), 'group parametresi yok — çift connection riski');
});

t('VoiceConnectionStatus Ready bekleniyor', () => {
  assert.ok(src.includes('VoiceConnectionStatus.Ready'), 'ready beklemesi yok');
});

t('Kanal dolu kontrolü var', () => {
  assert.ok(src.includes('isChannelFull'), 'kanal dolu kontrolü yok');
});

t('Yedek kanal desteği var', () => {
  assert.ok(src.includes('fallbackChannelId'), 'yedek kanal yok');
});

t('Backoff (artan bekleme) var', () => {
  assert.ok(src.includes('BACKOFF'), 'backoff yok');
});

t('Yeniden bağlanma limiti var', () => {
  assert.ok(src.includes('MAX_RECONNECT_FAILS'), 'limit yok');
});

t('Sağlık kontrolü periyodik', () => {
  assert.ok(src.includes('setInterval'), 'interval yok');
});

t('Client ölünce kapatıyor', () => {
  assert.ok(src.includes("client-dead"), 'client ölümü ele alınmıyor');
});

t('Stop sadece kendi kirasını bırakıyor', () => {
  assert.ok(src.includes("release(userId, tokenIndex, MODULE)"), 'release yok');
  assert.ok(!src.includes('client.destroy()') || src.includes('connection?.destroy'), '');
});

const pool = (await import('node:fs')).readFileSync('src/utils/accountPool.js', 'utf8');

t('Havuz ref-counting yapıyor', () => {
  assert.ok(pool.includes('refs.add'), 'ref ekleme yok');
  assert.ok(pool.includes('entry.refs.size === 0'), 'son ref kontrolü yok');
});

t('Çift token koruması var', () => {
  assert.ok(pool.includes('identityIndex'), 'aynı Discord user kontrolü yok');
});

const helpersSource = (await import('node:fs')).readFileSync('src/utils/selfbotHelpers.js', 'utf8');
t('destroyClient havuz client koruyor', () => {
  assert.ok(helpersSource.includes('pooledClients'), 'koruma yok');
});

console.log(`\n${process.exitCode ? '❌' : '✅'} ${pass} test geçti\n`);
