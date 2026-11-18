// src/firebase.js â€” Firebase Admin SDK baÄŸlantÄ±sÄ± ve koleksiyon referanslarÄ±
require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = JSON.parse((process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT));
const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID || undefined,
});
const db = getFirestore(app);

// Koleksiyon referanslarÄ± â€” hepsi guild bazlÄ± Ã§oklu-sunucu yapÄ±sÄ±nda
const collections = {
  guilds: db.collection('guilds'),       // { channelId, gameEnabled, mapSize, bgUrl, season, messageIds }
  factions: db.collection('factions'),  // { guildId, name, color, totalPower, members: [], ownerId }
  territories: db.collection('territories'), // { guildId, x, y, ownerId(factionId), terrain }
  players: db.collection('players'),    // { guildId, discordId, factionId, klanId, power, lastAttackTime }
  klans: db.collection('klans'),        // { guildId, name, ownerId, memberRoleId, founderRoleId, categoryId, sohbetChannelId, newsChannelId, voiceChannelId, totalPower, members }
};

db.settings({ ignoreUndefinedProperties: true });

module.exports = { app, db, collections, FieldValue };

