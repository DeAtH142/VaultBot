// src/utils/voiceAfkStore.js — Ses AFK yapılandırma deposu
//
// voiceafk.js'teki config formatını okur:  data/voiceafk-configs.json
//   { "<userId>": { "<tokenIndex>": { type, guildId, channelId, fallbackChannelId, selfMute, selfDeaf } } }
//
// ?hesaplarim paneli "Yeniden Başlat" için kullanır — voiceafk.js bu dosyayı
// import etmez, bu yüzden format tek yönlü okunur.

import fs from 'node:fs';
import path from 'node:path';

const CONFIG_FILE = path.resolve('data/voiceafk-configs.json');

function load() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

function save(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[voiceAfkStore] yazılamadı:', err.message);
  }
}

export const voiceAfkStore = {
  /** Kullanıcının tüm kayıtlı ses ayarları */
  list(userId) {
    const data = load()[userId] || {};
    return Object.entries(data)
      .filter(([k]) => /^\d+$/.test(k))
      .map(([k, v]) => ({ tokenIndex: parseInt(k, 10), ...v }));
  },

  get(userId, idx) {
    return load()[userId]?.[String(idx)] ?? null;
  },

  set(userId, idx, cfg) {
    const data = load();
    data[userId] = data[userId] || {};
    data[userId][String(idx)] = cfg;
    save(data);
  },

  del(userId, idx) {
    const data = load();
    if (data[userId]) delete data[userId][String(idx)];
    save(data);
  },
};
