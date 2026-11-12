// src/commands/kur.js — ⚙️ Sabit Panel Kurulumu
// Belirtilen kanala istenilen paneli kalıcı olarak kurar.
// !kur [panel] — owo | online | autotyper | voiceafk | otoreact | autoleave | joiner | profilechanger | friendcleaner | hepsi
import { PermissionFlagsBits } from 'discord.js';
import { createMainOwoEmbed, createMainControlRows } from './owo.js';
import { createOnlineSystemEmbed, createOnlineSystemComponents } from '../utils/embeds.js';

// Lazy-load panel üreticileri — her yeni modülün panelini tek yerden kurar.
const LAZY_PANELS = {
  autotyper: () => import('./autotyper.js'),
  voiceafk: () => import('./voiceafk.js'),
  otoreact: () => import('./otoreact.js'),
  autoleave: () => import('./autoleave.js'),
  joiner: () => import('./joiner.js'),
  profilechanger: () => import('./profilechanger.js'),
  friendcleaner: () => import('./friendcleaner.js'),
};

/** Komut modülünün execute'unu kullanmadan panelini gönderir. */
async function sendLazyPanel(channel, name) {
  const mod = await LAZY_PANELS[name]();
  // Sahte message objesi — execute(reply) sadece panel atıyor
  await mod.default.execute({
    client: channel.client,
    channel,
    author: { id: channel.client.user.id },
    reply: (opts) => channel.send(opts),
  });
}

const ALL_PANELS = ['owo', 'online', ...Object.keys(LAZY_PANELS)];

export default {
  name: 'kur',
  aliases: ['panelkur', 'setup', 'paneller'],
  description: 'Belirtilen kanala sabit panelleri kurar. !kur [panel] veya !kur hepsi',

  async execute(message, args) {
    const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator) ?? false;
    if (!isAdmin && message.author.id !== '1160564359727173792') {
      return message.reply('⛔ Bu komutu sadece **Yöneticiler** kullanabilir.');
    }

    const type = args[0]?.toLowerCase() || 'hepsi';

    await message.delete().catch(() => { });

    if (type === 'owo') {
      await message.channel.send({ embeds: [createMainOwoEmbed()], components: createMainControlRows() });
    } else if (type === 'online' || type === 'aktif') {
      await message.channel.send({ embeds: [createOnlineSystemEmbed()], components: createOnlineSystemComponents() });
    } else if (LAZY_PANELS[type]) {
      await sendLazyPanel(message.channel, type);
    } else if (type === 'liste') {
      await message.channel.send(`📋 Kurulabilir paneller: \`${ALL_PANELS.join('`, `')}\``);
    } else {
      // hepsi — tüm panelleri alt alta kur
      await message.channel.send({ embeds: [createMainOwoEmbed()], components: createMainControlRows() });
      await message.channel.send({ embeds: [createOnlineSystemEmbed()], components: createOnlineSystemComponents() });
      for (const name of Object.keys(LAZY_PANELS)) {
        await sendLazyPanel(message.channel, name).catch((err) =>
          console.error(`[Kur] ${name} paneli kurulamadı:`, err.message));
      }
    }
  },
};
