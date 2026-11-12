// src/utils/captchaSolver.js
import https from 'node:https';

/**
 * 2Captcha API ile görsel/metin tabanlı Captcha çözümü
 * @param {string} apiKey - 2Captcha API anahtarı
 * @param {string} imageUrlOrBase64 - Captcha görselinin URL'si veya base64 verisi
 * @returns {Promise<string|null>} - Çözülen metin
 */
export async function solve2Captcha(apiKey, imageUrlOrBase64) {
  if (!apiKey || !apiKey.trim()) return null;

  try {
    let base64Data = imageUrlOrBase64;

    // Eğer link verildiyse önce indirip base64'e çevirelim
    if (imageUrlOrBase64.startsWith('http://') || imageUrlOrBase64.startsWith('https://')) {
      base64Data = await downloadImageAsBase64(imageUrlOrBase64);
    }

    // 1. Görevi 2Captcha'ya Gönder (in.php)
    const postData = JSON.stringify({
      key: apiKey.trim(),
      method: 'base64',
      body: base64Data,
      json: 1,
    });

    const taskId = await makeHttpRequest('https://2captcha.com/in.php', 'POST', postData, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    });

    if (!taskId || taskId.status !== 1) {
      console.error('[2Captcha] Görev oluşturulamadı:', taskId?.request || taskId);
      return null;
    }

    const requestId = taskId.request;
    console.log(`[2Captcha] Görev kuyruğa alındı (ID: ${requestId}), çözüm bekleniyor...`);

    // 2. Çözüm Sonucunu Sorgula (res.php - 5 saniye aralıklarla polling)
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const queryUrl = `https://2captcha.com/res.php?key=${apiKey.trim()}&action=get&id=${requestId}&json=1`;
      const res = await makeHttpRequest(queryUrl, 'GET');

      if (res && res.status === 1) {
        console.log(`✅ [2Captcha] Başarıyla çözüldü: ${res.request}`);
        return res.request;
      }

      if (res && res.request !== 'CAPCHA_NOT_READY') {
        console.error('[2Captcha] Hata yanıtı:', res.request);
        return null;
      }
    }

    console.warn('[2Captcha] Zaman aşımına uğradı (75 saniye).');
    return null;
  } catch (err) {
    console.error('[2Captcha] İstek hatası:', err.message);
    return null;
  }
}

function makeHttpRequest(url, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
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

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function downloadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString('base64'));
      });
      res.on('error', reject);
    });
  });
}
