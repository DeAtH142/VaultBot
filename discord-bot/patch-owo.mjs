// patch-owo.mjs — owo.js içindeki bozuk embed bölümünü temiz metinle değiştirir
import fs from 'node:fs';

const p = 'src/commands/owo.js';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

const q = String.fromCharCode(96); // backtick

const startIdx = lines.findIndex(l => l.includes('**Durum:**') && l.includes('PRO v3'));
if (startIdx === -1) { console.error('baslangic satiri bulunamadi'); process.exit(1); }
let endIdx = lines.findIndex((l, i) => i > startIdx && l.includes('Kontrol paneli'));
if (endIdx === -1) { console.error('bitis satiri bulunamadi'); process.exit(1); }

const Q = q;
const E = String.fromCharCode(92) + q; // \` escape

const L = [];
L.push('      ' + Q + '> ${E.rocket} **Durum:** ' + E + 'AKTİF' + E + '  ${E.gear} **Motor:** ' + E + 'PRO v3' + E + '  ${E.fire} **Mod:** ' + E + 'Ultra Farm' + E + Q + ',');
L.push('');
L.push('      ${E.brain} **NE YAPAR?**' + Q + ',');
L.push("      'Tokenlerini OwO ekonomisinde **tam otomatik farm** moduna sokar. '" + Q + ',');
L.push("      'Hunt, Battle, Quest, Gem, Sell, Daily — hepsi insan simülasyonuyla.'" + Q + ',');
L.push('');
L.push('      ${E.sparkle} **PRO ÖZELLİK SETİ**' + Q + ',');
L.push(Q + '> ${E.bow} **Tam Otomasyon** — Hunt, Battle, Cookie, Pray, Daily' + Q + ',');
L.push(Q + '> 🔍 **Oto-Quest** — Otomatik quest alma ve takibi' + Q + ',');
L.push(Q + '> 💎 **Oto-Gem** — Envanterden en iyi taşları otomatik kuşanır' + Q + ',');
L.push(Q + '> ${E.money} **Akıllı Sell** — Para bitince otomatik ' + E + 'owo sell all' + E + Q + ',');
L.push(Q + '> 🔁 **Kanal Rotasyonu** — Birden fazla kanal arasında dolaşır' + Q + ',');
L.push(Q + '> 😴 **Auto-Sleep** — İnsan simülasyonu; periyodik dinlenme' + Q + ',');
L.push(Q + '> 🤖 **2Captcha Entegrasyonu** — Captchaları otomatik çözer' + Q + ',');
L.push(Q + '> ♻️ **Reboot Recovery** — Bot kapansa bile kaldığı yerden devam eder' + Q + ',');
L.push(Q + '> ${E.chart} **Canlı İstatistik** — Hunt, hayvan, quest, gem, cowoncy takibi' + Q + ',');
L.push(Q + '> 📊 **Durunca Kazanç Raporu** — Oturum özeti otomatik gönderilir' + Q + ',');
L.push('');
L.push(Q + E + E + 'DIVIDER' + E + E + Q + ',');
L.push('');
L.push('${E.target} **Kontrol paneli aşağıda ↓**  *(Hesap eklemek için ' + E + '!hesaplarim' + E + ')*' + Q + ',');

// İlk satır özel: başında "      " ve `> ile açılıyor; üsttekileri düzelt
L[0] = '      ' + Q + '> ${E.rocket} **Durum:** ' + E + 'AKTİF' + E + '  ${E.gear} **Motor:** ' + E + 'PRO v3' + E + '  ${E.fire} **Mod:** ' + E + 'Ultra Farm' + E + Q + ',';
// "NE YAPAR?" satırı aslında template:  `${E.brain} **NE YAPAR?**`,
L[2] = Q + '${E.brain} **NE YAPAR?**' + Q + ',';
L[6] = Q + '${E.sparkle} **PRO ÖZELLİK SETİ**' + Q + ',';
// Son satır: `${E.target} ...`,
L[L.length - 1] = Q + '${E.target} **Kontrol paneli aşağıda ↓**  *(Hesap eklemek için ' + E + '!hesaplarim' + E + ')*' + Q + ',';

lines.splice(startIdx, endIdx - startIdx + 1, ...L);
fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log('patched: satır ' + (startIdx + 1) + '..' + (endIdx + 1));
