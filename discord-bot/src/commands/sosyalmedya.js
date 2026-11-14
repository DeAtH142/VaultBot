// src/commands/sosyalmedya.js
import { EmbedBuilder } from 'discord.js';
import https from 'https';
import http from 'http';

// ── Sabitler ────────────────────────────────────────────────────────────
const VERIFICATION_CHANNEL_ID = '1569797918658134046';
const FOLLOW_ROLE_ID = '1569793657261793394';
const COMMENT_ROLE_ID = '1569795654124052671';

const INSTAGRAM_USERNAME = '0stit.ch_0';
const TIKTOK_USERNAME = 'gvmusreal';

// API anahtarları (environment variables'dan alınacak)
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

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

// ── Groq Vision API ile Analiz ─────────────────────────────────────────
async function analyzeWithGroq(imageBuffer) {
  const base64Image = imageBuffer.toString('base64');
  
  const prompt = `Bu ekran görüntüsünü analiz et ve şu soruları cevapla:

1. Instagram hesabı "@${INSTAGRAM_USERNAME}" takip ediliyor mu? (Evet/Hayır)
2. TikTok hesabı "@${TIKTOK_USERNAME}" takip ediliyor mu? (Evet/Hayır)
3. Herhangi bir yorum/comment yazılmış mı? (Evet/Hayır)

SADECE JSON formatında cevap ver:
{
  "instagram_follow": true/false,
  "tiktok_follow": true/false,
  "has_comment": true/false,
  "confidence": "high/medium/low",
  "reason": "kısa açıklama"
}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
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

  if (!response.ok) {
    throw new Error(`Groq API hatası: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  // JSON çıkar
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSON yanıt bulunamadı');
  
  return JSON.parse(jsonMatch[0]);
}

// ── Gemini Vision API ile Analiz (Fallback) ────────────────────────────
async function analyzeWithGemini(imageBuffer) {
  const base64Image = imageBuffer.toString('base64');
  
  const prompt = `Bu ekran görüntüsünü analiz et ve şu soruları cevapla:

1. Instagram hesabı "@${INSTAGRAM_USERNAME}" takip ediliyor mu? (Evet/Hayır)
2. TikTok hesabı "@${TIKTOK_USERNAME}" takip ediliyor mu? (Evet/Hayır)
3. Herhangi bir yorum/comment yazılmış mı? (Evet/Hayır)

SADECE JSON formatında cevap ver:
{
  "instagram_follow": true/false,
  "tiktok_follow": true/false,
  "has_comment": true/false,
  "confidence": "high/medium/low",
  "reason": "kısa açıklama"
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
    throw new Error(`Gemini API hatası: ${response.status}`);
  }

  const data = await response.json();
  const content = data.candidates[0].content.parts[0].text;
  
  // JSON çıkar
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSON yanıt bulunamadı');
  
  return JSON.parse(jsonMatch[0]);
}

// ── Ana Analiz Fonksiyonu ───────────────────────────────────────────────
async function analyzeScreenshot(imageUrl) {
  const imageBuffer = await downloadImage(imageUrl);
  
  // Önce Groq dene, hata olursa Gemini'ye geç
  try {
    if (GROQ_API_KEY) {
      console.log('🔍 Groq ile analiz ediliyor...');
      return await analyzeWithGroq(imageBuffer);
    }
  } catch (err) {
    console.warn('⚠️ Groq hatası, Gemini deneniyor:', err.message);
  }
  
  if (GEMINI_API_KEY) {
    console.log('🔍 Gemini ile analiz ediliyor...');
    return await analyzeWithGemini(imageBuffer);
  }
  
  throw new Error('Hiçbir AI API anahtarı bulunamadı');
}

// ── Rol Verme ───────────────────────────────────────────────────────────
async function assignRoles(message, analysis) {
  const { instagram_follow, tiktok_follow, has_comment } = analysis;
  
  // Her iki hesabı da takip etmeli
  if (!instagram_follow || !tiktok_follow) {
    return {
      success: false,
      reason: 'Her iki hesabı da takip etmen gerekiyor!',
    };
  }
  
  const member = message.member;
  const guild = message.guild;
  
  let assignedRoles = [];
  
  // Takip rolü ver
  const followRole = guild.roles.cache.get(FOLLOW_ROLE_ID);
  if (followRole && !member.roles.cache.has(FOLLOW_ROLE_ID)) {
    await member.roles.add(followRole, 'Sosyal medya takip doğrulaması');
    assignedRoles.push(followRole.name);
  }
  
  // Yorum varsa yorum rolü de ver
  if (has_comment) {
    const commentRole = guild.roles.cache.get(COMMENT_ROLE_ID);
    if (commentRole && !member.roles.cache.has(COMMENT_ROLE_ID)) {
      await member.roles.add(commentRole, 'Sosyal medya yorum doğrulaması');
      assignedRoles.push(commentRole.name);
    }
  }
  
  return {
    success: true,
    roles: assignedRoles,
    hasComment: has_comment,
  };
}

// ── Mesaj Dinleyici (index.js'den çağrılacak) ──────────────────────────
export async function handleVerificationMessage(message) {
  // Doğru kanal mı?
  if (message.channel.id !== VERIFICATION_CHANNEL_ID) return;
  
  // Bot mesajları atla
  if (message.author.bot) return;
  
  // Ekran görüntüsü var mı?
  const attachment = message.attachments.first();
  if (!attachment || !attachment.contentType?.startsWith('image/')) {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Hatalı Gönderim')
      .setDescription('Lütfen bir **ekran görüntüsü** yükle!')
      .setFooter({ text: 'Instagram ve TikTok takip durumunu gösteren SS gerekli' });
    
    await message.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
    return;
  }
  
  // Bekleme mesajı
  const waitEmbed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle('🔍 Kontrol Ediliyor...')
    .setDescription('Ekran görüntüsü analiz ediliyor, lütfen bekle...');
  
  const waitMsg = await message.reply({ embeds: [waitEmbed] });
  
  try {
    // Görüntüyü analiz et
    const analysis = await analyzeScreenshot(attachment.url);
    
    console.log('📊 Analiz sonucu:', analysis);
    
    // Güven düşükse uyar
    if (analysis.confidence === 'low') {
      const lowConfEmbed = new EmbedBuilder()
        .setColor(0xff6600)
        .setTitle('⚠️ Belirsiz Sonuç')
        .setDescription(
          'Ekran görüntüsü net değil veya gerekli bilgiler eksik.\n\n' +
          `**Sebep:** ${analysis.reason}\n\n` +
          'Lütfen daha net bir ekran görüntüsü yükle.'
        );
      
      await waitMsg.edit({ embeds: [lowConfEmbed] });
      return;
    }
    
    // Rolleri ver
    const result = await assignRoles(message, analysis);
    
    if (!result.success) {
      const failEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('❌ Doğrulama Başarısız')
        .setDescription(result.reason)
        .addFields(
          { name: '📸 Instagram', value: `@${INSTAGRAM_USERNAME}`, inline: true },
          { name: '🎵 TikTok', value: `@${TIKTOK_USERNAME}`, inline: true }
        );
      
      await waitMsg.edit({ embeds: [failEmbed] });
      return;
    }
    
    // Başarı mesajı
    const successEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle('✅ Doğrulama Başarılı!')
      .setDescription(
        `Tebrikler ${message.author}! Sosyal medya takibini doğruladın.\n\n` +
        `**Verilen Roller:**\n${result.roles.map(r => `• ${r}`).join('\n')}`
      )
      .addFields(
        { name: '📸 Instagram', value: `✅ @${INSTAGRAM_USERNAME}`, inline: true },
        { name: '🎵 TikTok', value: `✅ @${TIKTOK_USERNAME}`, inline: true },
        { name: '💬 Yorum', value: result.hasComment ? '✅ Evet' : '❌ Hayır', inline: true }
      )
      .setFooter({ text: 'Desteğin için teşekkürler! 💙' })
      .setTimestamp();
    
    await waitMsg.edit({ embeds: [successEmbed] });
    
  } catch (err) {
    console.error('❌ Sosyal medya doğrulama hatası:', err);
    
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('❌ Sistem Hatası')
      .setDescription(
        'Ekran görüntüsü analiz edilirken bir hata oluştu.\n\n' +
        'Lütfen daha sonra tekrar dene veya yöneticilere bildir.'
      );
    
    await waitMsg.edit({ embeds: [errorEmbed] }).catch(() => {});
  }
}

// ── Manuel Komut (Test için) ────────────────────────────────────────────
export default {
  name: 'sosyalmedya',
  description: 'Sosyal medya doğrulama sistemi bilgisi',
  aliases: ['sm', 'verify'],
  
  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📱 Sosyal Medya Doğrulama Sistemi')
      .setDescription(
        `<#${VERIFICATION_CHANNEL_ID}> kanalına aşağıdaki hesapları takip ettiğini gösteren bir ekran görüntüsü at!`
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
          name: '📋 Gereksinimler',
          value:
            '• Her iki hesabı da takip etmelisin\n' +
            '• Ekran görüntüsünde kullanıcı adları net görünmeli\n' +
            '• Yorum attıysan yorumun da görünmesi gerekli',
        }
      )
      .setFooter({ text: 'SS yükledikten sonra otomatik kontrol edilecek!' });
    
    await message.reply({ embeds: [embed] });
  },
};
