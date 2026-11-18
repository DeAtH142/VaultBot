// src/index.js — Bot ana giriş noktası
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const handler = require('./handlers/handler');
const { collections, db } = require('./firebase');
const { startPowerScheduler } = require('./game/power');
const events = require('./events');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.commands = new Map();
client.buttons = new Map();
client.selectMenus = new Map();
client.modals = new Map();

(async () => {
  // Zamanlayıcıları başlat (güç toplama tick'i)
  startPowerScheduler();

  // Slash komutları ve etkileşimleri yükle
  const commandsPath = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
    const cmd = require(`./commands/${file}`);
    client.commands.set(cmd.data.name, cmd);
  }
  const interactionsPath = path.join(__dirname, 'interactions');
  for (const file of fs.readdirSync(interactionsPath).filter(f => f.endsWith('.js'))) {
    const inter = require(`./interactions/${file}`);
    if (inter.customId) {
      const map = inter.type === 'button' ? client.buttons
        : inter.type === 'select' ? client.selectMenus
          : client.modals;
      map.set(inter.customId, inter);
    }
  }

  // Olay ve etkileşim dinleyicileri
  handler(client);
  events(client);

  // Slash komutlarını global olarak deploy et
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  const body = [...client.commands.values()].map(c => c.data.toJSON());
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body });
  console.log(`✅ ${body.length} slash komutu deploy edildi.`);

  await client.login(process.env.DISCORD_TOKEN);
})();
