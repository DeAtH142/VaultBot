// src/utils/captchaSolver.js
// 🤖 2Captcha API ile görsel captcha çözümü.
// ⚠️ 2Captcha in.php/res.php FORM-URLENCODED bekler (JSON DEĞİL!) — eski kodda JSON
// gönderiliyordu, bu yüzden görev hiç oluşturulamıyordu. Düzeltildi.
import https from 'node:https';
import { URLSearchParams } from 'node:url';

const IN_URL = 'https://2captcha.com/in.php';
const RES_URL = 'https://2captcha.com/res.php';

/**
 * 2Captcha API ile görsel tabanlı Captcha çözümü
 * @param {string} apiKey - 2Captcha API anahtarı
 * @param {string} imageUrlOrBase64 - Captcha görselinin URL'si veya base64 verisi
 * @returns {Promise<string|null>} - Çözülen metin (null = başarısız)
 */
export async function solve2Captcha(apiKey, imageUrlOrBase64) {
  if (!apiKey || !apiKey.trim()) return null;
  if (!imageUrlOrBase64) return null;

  try {
    // Görseli base64'e çevir
    let base64Data = imageUrlOrBase64;
    if (/^https?:\/\//i.test(imageUrlOrBase64)) {
      base64Data = await downloadImageAsBase64(imageUrlOrBase64);
      if (!base64Data) {
        console.error('[2Captcha] Görsel indirilemedi:', imageUrlOrBase64.slice(0, 80));
        return null;
      }
    }
    // data:image/png;base64, prefix'i varsa temizle
    base64Data = base64Data.replace(/^data:image\/\w+;base64,/, '');

    // 1. Görevi 2Captcha'ya gönder (in.php — FORM-URLENCODED!)
    const form = new URLSearchParams({
      key: apiKey.trim(),
      method: 'base64',
      body: base64Data,
      json: '1',
      language: '2', // captcha kodları büyük/küçük harf duyarsız olmayan
    });
    const taskRes = await makeHttpRequest(IN_URL, 'POST', form.toString(), {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(form.toString()),
    });

    if (!taskRes || taskRes.status !== 1) {
      console.error('[2Captcha] Görev oluşturulamadı:', taskRes?.request || taskRes);
      return null;
    }

    const requestId = taskRes.request;
    console.log(`[2Captcha] Görev kuyruğa alındı (ID: ${requestId}), çözüm bekleniyor...`);

    // 2. Çözümü sorgula (res.php) — 5 sn aralıkla, 36 deneme (3 dk) → 2Captcha'lar bazen 2 dk sürer
    await new Promise((r) => setTimeout(r, 8000)); // ilk bekleme (2Captcha önerisi: en az 5 sn)

    for (let i = 0; i < 36; i++) {
      const query = new URLSearchParams({
        key: apiKey.trim(),
        action: 'get',
        id: requestId,
        json: '1',
      });
      const res = await makeHttpRequest(`${RES_URL}?${query.toString()}`, 'GET');

      if (res && res.status === 1) {
        console.log(`✅ [2Captcha] Başarıyla çözüldü: ${res.request}`);
        return res.request;
      }

      if (res && res.request === 'CAPCHA_NOT_READY') {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      // Gerçek hata (ERROR_...)
      console.error('[2Captcha] Hata yanıtı:', res?.request || res);
      return null;
    }

    console.warn('[2Captcha] Zaman aşımına uğradı (3 dakika).');
    return null;
  } catch (err) {
    console.error('[2Captcha] İstek hatası:', err.message);
    return null;
  }
}

function makeHttpRequest(url, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, timeout: 30000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/** Discord CDN vb. adreslerden görsel indirir, base64 döner. Redirect takip eder. */
function downloadImageAsBase64(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) return reject(new Error('too many redirects'));
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      // 301/302/303/307/308 → redirect takip et
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return resolve(downloadImageAsBase64(new URL(res.headers.location, url).href, redirectCount + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(Buffer.concat(chunks).toString('base64'));
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}
