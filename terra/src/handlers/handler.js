// src/handlers/handler.js — Komut / etkileşim yönlendirici (handler)
const { Events } = require('discord.js');
const { collections } = require('../firebase');

function handler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd) await cmd.execute(interaction);
      } else if (interaction.isButton()) {
        const btn = client.buttons.get(interaction.customId.split('|')[0]);
        if (btn) await btn.execute(interaction);
      } else if (interaction.isStringSelectMenu()) {
        const sel = client.selectMenus.get(interaction.customId.split('|')[0]);
        if (sel) await sel.execute(interaction);
      } else if (interaction.isModalSubmit()) {
        const modal = client.modals.get(interaction.customId.split('|')[0]);
        if (modal) await modal.execute(interaction);
      }
    } catch (err) {
      console.error(err);
      const payload = { content: '❌ Bir hata oluştu.', ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  });
}

module.exports = { handler };
