// src/commands/sosyalmedya.js
import { EmbedBuilder } from 'discord.js';
import https from 'https';
import http from 'http';

// ── Sabitler ────────────────────────────────────────────────────────────
// DİKKAT: Buradaki ID'lerin yeni sunucudaki kanal ve rollere ait olduğundan emin ol!
const VERIFICATION_CHANNEL_ID = '1571141518138544248'; 
const FOLLOW_ROLE_ID = '1569793657261793394';
const COMMENT_ROLE_ID = '1569795654124052671';

const INSTAGRAM_USERNAME = '0stit.ch_0';
const TIKTOK_USERNAME = 'gvmusreal';

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Güncel modeller (Biri patlarsa diğeri otomatik denenir)
const GROQ_VISION_MODELS = [
  'qwen/qwen3.8-27b',                  // ✅ Öncelikli model (güncel ve görsel destekli)
  'meta-llama/llama-4-scout-17b-16e-instruct' // ✅ Yedek model
];

const GEMINI_VISION_MODELS = [
  'gemini-2.5-flash',                  // ✅ Gemini 1.5'in yerine gelen güncel model
  'gemini-3.1-flash-lite'              // ✅ Alternatif güncel model
];

// ── Görüntü İndir ──────────────────────────────────────────────────
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Ortak Prompt ───────────────────────────────────────────────────
const getPrompt = () => `Bu ekran görüntüsünü DİKKATLİCE analiz et:

**ARANAN BİLGİLER:**
1. Instagram profili "@${INSTAGRAM_USERNAME}" - "Takiptesin", "Takip Ediliyor" veya "Following" butonu var mı?
2. TikTok profili "@${TIKTOK_USERNAME}" - "Takip ediliyor", "Takiptesin" veya "Following" yazısı/butonu var mı?
3. Instagram veya TikTok yorumu - Herhangi bir yorum metni veya yorumların görüldüğü ekran var mı?

**ÖNEMLİ:**
- Ekran görüntüsü hangi platformdan (Instagram/TikTok/Diğer)?
- Kullanıcı adını (@username) kontrol et, eşleşiyor mu?
- "Takip" butonlarını DİKKATLE incele - "Takip Et" değil "Takiptesin/Takip Ediliyor" olmalı!
- Türkçe veya İngilizce olabilir
- Ekran görüntüsü düşük çözünürlüklü veya bulanıksa confidence=low yap

**SADECE JSON formatında cevap ver:**
{
  "instagram_follow": true/false,
  "tiktok_follow": true/false,
  "has_comment": true/false,
  "platform": "instagram/tiktok/other",
  "username_found": "bulunan kullanıcı adı veya null",
  "confidence": "high/medium/low",
  "reason": "ne gördüğünü kısa açıkla"
}`;

// ── Groq Vision API ile Analiz ─────────────────────────────────
async function analyzeWithGroq(imageBuffer, modelId, retryCount = 0) {
  const base64Image = imageBuffer.toString('base64');
  const prompt = getPrompt();

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64Image}` },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (response.status === 429 && retryCount < 2) {
    const waitTime = (retryCount + 1) * 2000;
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return analyzeWithGroq(imageBuffer, modelId, retryCount + 1);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Yanıt alınamadı');
    throw new Error(`Groq [${modelId}] hatası: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Groq JSON yanıt bulunamadı');
  return JSON.parse(jsonMatch[0]);
}

// ── Gemini Vision API ile Analiz ────────────────────────────
async function analyzeWithGemini(imageBuffer, modelId) {
  const base64Image = imageBuffer.toString('base64');
  const prompt = getPrompt();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64Image,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 500,
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(()=> '');
    throw new Error(`Gemini [${modelId}] hatası: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const content = data.candidates[0].content.parts[0].text;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini JSON yanıt bulunamadı');
  return JSON.parse(jsonMatch[0]);
}

// ── Ana Analiz Fonksiyonu (Tüm Modelleri Sırayla Dener) ────────────────
async function analyzeScreenshot(imageUrl) {
  const imageBuffer = await downloadImage(imageUrl);
  let lastError = null;

  // 1. Groq Modellerini Dene
  if (GROQ_API_KEY) {
    for (const modelId of GROQ_VISION_MODELS) {
      try {
        console.log(`⏳ Groq deneniyor: ${modelId}`);
        return await analyzeWithGroq(imageBuffer, modelId);
      } catch (err) {
        console.warn(`⚠️ Groq Modeli Başarısız (${modelId}): ${err.message}`);
        lastError = err;
      }
    }
  }

  // 2. Gemini Modellerini Dene
  if (GEMINI_API_KEY) {
    for (const modelId of GEMINI_VISION_MODELS) {
      try {
        console.log(`⏳ Gemini deneniyor: ${modelId}`);
        return await analyzeWithGemini(imageBuffer, modelId);
      } catch (err) {
        console.warn(`⚠️ Gemini Modeli Başarısız (${modelId}): ${err.message}`);
        lastError = err;
      }
    }
  }

  // Hiçbiri çalışmadıysa fırlat
  throw new Error(`Tüm AI modelleri başarısız oldu. Son Hata: ${lastError?.message}`);
}

// ── Çoklu Görüntü Analizi ───────────────────────────────────
async function analyzeMultipleScreenshots(imageUrls) {
  console.log(`🔍 ${imageUrls.length} ekran görüntüsü analiz ediliyor...`);
  const results = [];
  
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      console.log(`  📸 [${i + 1}/${imageUrls.length}] Analiz ediliyor...`);
      const analysis = await analyzeScreenshot(imageUrls[i]);
      results.push({ index: i + 1, analysis, url: imageUrls[i] });
      console.log(`  ✅ [${i + 1}/${imageUrls.length}]`, analysis);
    } catch (err) {
      console.error(`  ❌ [${i + 1}/${imageUrls.length}] Hata:`, err.message);
      results.push({ index: i + 1, error: err.message, url: imageUrls[i] });
    }
  }

  const combined = {
    instagram_follow: false,
    tiktok_follow: false,
    has_comment: false,
    details: [],
    totalImages: imageUrls.length,
    successfulAnalysis: 0,
    failedAnalysis: 0,
  };

  for (const result of results) {
    if (result.error) {
      combined.failedAnalysis++;
      combined.details.push({
        image: result.index,
        status: '❌ Analiz başarısız',
        reason: result.error,
      });
      continue;
    }

    combined.successfulAnalysis++;
    const { analysis } = result;

    if (analysis.instagram_follow) combined.instagram_follow = true;
    if (analysis.tiktok_follow) combined.tiktok_follow = true;
    if (analysis.has_comment) combined.has_comment = true;

    const found = [];
    if (analysis.instagram_follow) found.push('📸 Instagram takip');
    if (analysis.tiktok_follow) found.push('🎵 TikTok takip');
    if (analysis.has_comment) found.push('💬 Yorum');

    combined.details.push({
      image: result.index,
      platform: analysis.platform || 'bilinmiyor',
      found: found.length > 0 ? found : ['Hiçbir şey bulunamadı'],
      confidence: analysis.confidence,
      username: analysis.username_found || '-',
      reason: analysis.reason,
    });
  }

  return combined;
}

// ── Rol Verme ───────────────────────────────────────────────────────────
async function assignRoles(message, analysis) {
  const { instagram_follow, tiktok_follow, has_comment } = analysis;

  if (!instagram_follow || !tiktok_follow) {
    const missing = [];
    if (!instagram_follow) missing.push(`📸 Instagram (@${INSTAGRAM_USERNAME})`);
    if (!tiktok_follow) missing.push(`🎵 TikTok (@${TIKTOK_USERNAME})`);
    
    return {
      success: false,
      reason: `Eksik takipler var:\n${missing.join('\n')}\n\nLütfen her iki hesabı da takip et ve tekrar dene!`,
      instagram_follow,
      tiktok_follow,
    };
  }

  const member = message.member;
  const guild = message.guild;

  let assignedRoles = [];
  let alreadyHadRoles = [];

  const followRole = guild.roles.cache.get(FOLLOW_ROLE_ID);
  if (followRole) {
    if (!member.roles.cache.has(FOLLOW_ROLE_ID)) {
      await member.roles.add(followRole, 'Sosyal medya takip doğrulaması');
      assignedRoles.push(followRole.name);
    } else {
      alreadyHadRoles.push(followRole.name);
    }
  }

  if (has_comment) {
    const commentRole = guild.roles.cache.get(COMMENT_ROLE_ID);
    if (commentRole) {
      if (!member.roles.cache.has(COMMENT_ROLE_ID)) {
        await member.roles.add(commentRole, 'Sosyal medya yorum doğrulaması');
        assignedRoles.push(commentRole.name);
      } else {
        alreadyHadRoles.push(commentRole.name);
      }
    }
  }

  return {
    success: true,
    roles: assignedRoles,
    alreadyHadRoles,
    hasComment: has_comment,
    instagram_follow,
    tiktok_follow,
  };
}

// ── Mesaj Dinleyici ──────────────────────────────────────
export async function handleVerificationMessage(message) {
  if (message.channel.id !== VERIFICATION_CHANNEL_ID) return;
  if (message.author.bot) return;

  const imageAttachments = message.attachments.filter(att => att.contentType?.startsWith('image/'));
  
  if (imageAttachments.size === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Hatalı Gönderim')
      .setDescription(
        'Lütfen **en az 1 ekran görüntüsü** yükle!\n\n' +
        '**Kabul edilen formatlar:**\n' +
        '• Tek birleşik SS (Instagram + TikTok birlikte)\n' +
        '• 2 ayrı SS (Instagram takip + TikTok takip)\n' +
        '• 3 ayrı SS (Instagram + TikTok + Yorum)\n\n' +
        '💡 **İpucu:** Birden fazla SS atabilirsin!'
      )
      .setFooter({ text: 'Her iki hesabı da takip ettiğini göster' });

    await message.reply({ embeds: [embed] }).catch(() => { });
    return;
  }

  const waitEmbed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle('🔍 Kontrol Ediliyor...')
    .setDescription(
      `**${imageAttachments.size} ekran görüntüsü** analiz ediliyor...\n\n` +
      '⏳ Bu birkaç saniye sürebilir, lütfen bekle.'
    )
    .setFooter({ text: 'AI ile otomatik analiz yapılıyor' });

  const waitMsg = await message.reply({ embeds: [waitEmbed] });

  try {
    const imageUrls = imageAttachments.map(att => att.url);
    const analysis = await analyzeMultipleScreenshots(imageUrls);

    console.log('📊 Birleşik analiz sonucu:', analysis);

    if (analysis.successfulAnalysis === 0) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Analiz Başarısız')
        .setDescription(
          'Hiçbir ekran görüntüsü analiz edilemedi.\n\n' +
          '**Sebep:** Görüntüler net değil veya okunamıyor.\n\n' +
          'Lütfen daha net ekran görüntüleri yükle.'
        );

      await waitMsg.edit({ embeds: [errorEmbed] });
      return;
    }

    const result = await assignRoles(message, analysis);

    if (!result.success) {
      const failEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Doğrulama Başarısız')
        .setDescription(result.reason)
        .addFields(
          { 
            name: '📊 Analiz Sonuçları', 
            value: (
              `📸 Instagram: ${result.instagram_follow ? '✅ Takip ediliyor' : '❌ Takip edilmiyor'}\n` +
              `🎵 TikTok: ${result.tiktok_follow ? '✅ Takip ediliyor' : '❌ Takip edilmiyor'}\n` +
              `📷 Analiz edilen: ${analysis.successfulAnalysis}/${analysis.totalImages} SS`
            )
          }
        );

      if (analysis.details.length > 0) {
        const detailsText = analysis.details.map(d => {
          const found = d.found ? d.found.join(', ') : d.status;
          return `**SS ${d.image}:** ${found}`;
        }).join('\n');
        failEmbed.addFields({ name: '🔍 Görüntü Detayları', value: detailsText || 'Bilgi yok' });
      }

      await waitMsg.edit({ embeds: [failEmbed] });
      return;
    }

    const successDescription = [`Tebrikler ${message.author}! Sosyal medya takibini doğruladın.\n`];

    if (result.roles.length > 0) {
      successDescription.push('**🎁 Yeni Verilen Roller:**');
      successDescription.push(result.roles.map(r => `✅ ${r}`).join('\n'));
    }

    if (result.alreadyHadRoles.length > 0) {
      successDescription.push('\n**ℹ️ Zaten Sahip Olduğun Roller:**');
      successDescription.push(result.alreadyHadRoles.map(r => `• ${r}`).join('\n'));
    }

    const successEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Doğrulama Başarılı!')
      .setDescription(successDescription.join('\n'))
      .addFields(
        { name: '📸 Instagram', value: `✅ @${INSTAGRAM_USERNAME}`, inline: true },
        { name: '🎵 TikTok', value: `✅ @${TIKTOK_USERNAME}`, inline: true },
        { name: '💬 Yorum', value: result.hasComment ? '✅ Var' : '➖ Yok', inline: true }
      )
      .setFooter({ text: 'Desteğin için teşekkürler! 💙' })
      .setTimestamp();

    if (analysis.details.length > 0) {
      const detailsText = analysis.details.map(d => {
        const found = d.found ? d.found.join(', ') : 'Hiçbir şey';
        return `**SS ${d.image}:** ${found}`;
      }).join('\n');
      successEmbed.addFields({ 
        name: `🔍 Analiz Detayları (${analysis.successfulAnalysis}/${analysis.totalImages} SS)`, 
        value: detailsText || 'Bilgi yok' 
      });
    }

    await waitMsg.edit({ embeds: [successEmbed] });

  } catch (err) {
    console.error('❌ Sosyal medya doğrulama hatası:', err);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Sistem Hatası')
      .setDescription(
        'Ekran görüntüleri analiz edilirken bir hata oluştu.\n\n' +
        `**Hata:** ${err.message}\n\n` +
        'Lütfen daha sonra tekrar dene veya yöneticilere bildir.'
      );

    await waitMsg.edit({ embeds: [errorEmbed] }).catch(() => { });
  }
}

// ── Manuel Komut ────────────────────────────────────────────
export default {
  name: 'sosyalmedya',
  description: 'Sosyal medya doğrulama sistemi bilgisi',
  aliases: ['sm', 'verify'],

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📱 Sosyal Medya Doğrulama Sistemi')
      .setDescription(
        `<#${VERIFICATION_CHANNEL_ID}> kanalına aşağıdaki hesapları takip ettiğini gösteren ekran görüntülerini at!\n\n` +
        '💡 **Birden fazla SS atabilirsin!**'
      )
      .addFields(
        { name: '📸 Instagram', value: `[@${INSTAGRAM_USERNAME}](https://instagram.com/${INSTAGRAM_USERNAME})`, inline: true },
        { name: '🎵 TikTok', value: `[@${TIKTOK_USERNAME}](https://tiktok.com/@${TIKTOK_USERNAME})`, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        {
          name: '🎁 Ödüller',
          value:
            '**Sadece Takip:** <@&' + FOLLOW_ROLE_ID + '>\n' +
            '**Takip + Yorum:** <@&' + COMMENT_ROLE_ID + '>',
        },
        {
          name: '📝 Kabul Edilen Formatlar',
          value:
            '• Tek birleşik SS (Instagram + TikTok birlikte)\n' +
            '• 2 ayrı SS (Instagram takip + TikTok takip)\n' +
            '• 3 ayrı SS (Instagram + TikTok + Yorum SS)\n' +
            '• Türkçe veya İngilizce arayüz',
        },
        {
          name: '📋 Gereksinimler',
          value:
            '• Her iki hesabı da takip etmelisin\n' +
            '• "Takiptesin" / "Takip Ediliyor" butonu görünmeli\n' +
            '• Kullanıcı adları net okunabilir olmalı\n' +
            '• Yorum attıysan yorumun da görünmesi gerekli',
        }
      )
      .setFooter({ text: '🤖 SS yükledikten sonra AI ile otomatik kontrol edilecek!' });

    await message.reply({ embeds: [embed] });
  },
};
