// src/utils/modelManager.js
import { db } from '../utils/firebase.js'; // Firebase referansınızı buraya göre ayarlayın

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// ── Model Listeleme ────────────────────────────────────────────────────
async function listGroqModels() {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` }
  });
  if (!res.ok) throw new Error('Groq model listesi alınamadı');
  const data = await res.json();
  return data.data || [];
}

async function listGeminiModels() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
  if (!res.ok) throw new Error('Gemini model listesi alınamadı');
  const data = await res.json();
  return data.models || [];
}

// ── Model Test (Selam Gönderme) ────────────────────────────────────────
async function testGroqModel(modelId) {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'selam' }],
        max_tokens: 10
      })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function testGeminiModel(modelName) {
  try {
    // modelName genellikle "models/gemini-..." şeklinde gelir
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'selam' }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

// ── Görsel Yeteneği Kontrolü ───────────────────────────────────────────
function isGroqVisionModel(modelId) {
  return modelId.toLowerCase().includes('vision');
}

function isGeminiVisionModel(model) {
  const methods = model.supportedGenerationMethods || [];
  return methods.includes('generateContent');
}

// ── Ana Başlatma Fonksiyonu ────────────────────────────────────────────
export async function initializeModels() {
  console.log('🔍 AI modelleri test ediliyor...');
  const activeModels = [];

  // Groq Modelleri
  try {
    const groqModels = await listGroqModels();
    for (const model of groqModels) {
      if (await testGroqModel(model.id)) {
        const supportsVision = isGroqVisionModel(model.id);
        const record = {
          provider: 'groq',
          modelId: model.id,
          supportsVision,
          lastTested: new Date()
        };
        await db.collection('ai_models').doc(`groq_${model.id}`).set(record, { merge: true });
        activeModels.push(record);
      }
    }
  } catch (e) {
    console.error('Groq modelleri test edilirken hata:', e.message);
  }

  // Gemini Modelleri
  try {
    const geminiModels = await listGeminiModels();
    for (const model of geminiModels) {
      if (await testGeminiModel(model.name)) {
        const supportsVision = isGeminiVisionModel(model);
        const record = {
          provider: 'gemini',
          modelId: model.name, // "models/gemini-..." şeklinde
          supportsVision,
          lastTested: new Date()
        };
        await db.collection('ai_models').doc(`gemini_${model.name.replace(/\//g, '_')}`).set(record, { merge: true });
        activeModels.push(record);
      }
    }
  } catch (e) {
    console.error('Gemini modelleri test edilirken hata:', e.message);
  }

  console.log(`✅ ${activeModels.length} aktif model bulundu ve Firebase'e kaydedildi.`);
  return activeModels;
}

// ── Görsel Yetenekli Modelleri Getir ───────────────────────────────────
export async function getVisionModels() {
  const snapshot = await db.collection('ai_models')
    .where('supportsVision', '==', true)
    .orderBy('lastTested', 'desc')
    .get();
  return snapshot.docs.map(doc => doc.data());
}
