// src/utils/cloudflareAI.js
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CLOUDFLARE_API_KEY = process.env.CLOUDFLARE_API_KEY;

export async function askCloudflareAI(systemPrompt, userPrompt) {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_KEY) {
    throw new Error('Cloudflare API anahtarları eksik!');
  }

  try {
    // 🚨 MODEL GÜNCELLENDİ: Cloudflare'in güncel desteklediği model (llama-3.1)
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 1000
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cloudflare AI Hatası: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.result.response; 
    
  } catch (err) {
    console.error('☁️ [Cloudflare AI] Hata:', err.message);
    throw err;
  }
}
