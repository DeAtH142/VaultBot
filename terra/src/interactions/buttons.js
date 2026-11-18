// src/interactions/buttons.js — 🟢 Güç Ver, 🏆 Sıralama, 🗺️ Harita butonları
const { EmbedBuilder } = require('discord.js');
const { collections, FieldValue, db } = require('../firebase');
const { generateMapImage } = require('../game/map');

// 🟢 Güç Ver — güç toplama (cooldown: 5 dk)
const guver = {
  customId: 'guver',
  type: 'button',
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const guildDoc = (await collections.guilds.doc(guildId).get()).data() || {};
    if (!guildDoc.gameEnabled) return interaction.reply({ content: '⏸️ Oyun şu anda kapalı.', ephemeral: true });
    const ref = collections.players.doc(`${guildId}_${interaction.user.id}`);
    const snap = await ref.get();
    const last = snap.exists ? (snap.data().lastPowerTime?.toMillis?.() ?? 0) : 0;
    const elapsed = Date.now() - last;
    if (elapsed < 5 * 60 * 1000) {
      return interaction.reply({ content: `⏳ Güç toplamak için **${Math.ceil((5 * 60 * 1000 - elapsed) / 60000)} dakika** bekle.`, ephemeral: true });
    }
    await db.runTransaction(async (tx) => {
      tx.set(ref, {
        guildId, discordId: interaction.user.id,
        power: FieldValue.increment(1),
        lastPowerTime: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    const playerSnap = await ref.get();
    const power = playerSnap.data().power;

    // Klan haberi: üye güç bastıysa klanın haberler kanalına duyuru
    const klanId = playerSnap.data().klanId;
    if (klanId) {
      const { announcePower } = require('../utils/klan');
      await announcePower(interaction.client, klanId, interaction.user.tag, 1, power).catch(() => {});
    }

    const embed = new EmbedBuilder().setTitle('🟢 Güç Toplandı')
      .setDescription(`+1 güç kazandın! Toplam gücün: **${power}**`)
      .setColor(0x2ecc71).setFooter({ text: 'Daisy © 2026' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// 🏆 Sıralama — liderlik tablosu
const siralama = {
  customId: 'siralama',
  type: 'button',
  async execute(interaction) {
    const snap = await collections.factions
      .where('guildId', '==', interaction.guild.id)
      .orderBy('totalPower', 'desc').limit(10).get();
    const desc = snap.empty ? 'Henüz ittifak yok.'
      : snap.docs.map((d, i) => `**${i + 1}.** ${d.data().name} — ⚡ ${d.data().totalPower || 0}`).join('\n');
    const embed = new EmbedBuilder().setTitle('🏆 İttifak Sıralaması')
      .setDescription(desc).setColor(0xf1c40f).setFooter({ text: 'Daisy © 2026' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// 🗺️ Harita — yeniden çiz ve gönder
const harita = {
  customId: 'harita',
  type: 'button',
  async execute(interaction) {
    const guildDoc = (await collections.guilds.doc(interaction.guild.id).get()).data() || {};
    const attachment = await generateMapImage(interaction.guild.id, guildDoc);
    const embed = new EmbedBuilder().setTitle(`🗺️ Sezon ${guildDoc.season || 1} — Harita`)
      .setImage('attachment://harita.png').setColor(0x2b2d31).setFooter({ text: 'Daisy © 2026' });
    return interaction.reply({ embeds: [embed], files: [attachment], ephemeral: false });
  },
};

// 🔴 Saldır → koordinat modalını aç
const saldir = {
  customId: 'saldir',
  type: 'button',
  async execute(interaction) {
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    const modal = new ModalBuilder().setCustomId('saldir_modal').setTitle('⚔️ Kareye Saldır');
    const xInput = new TextInputBuilder().setCustomId('x').setLabel('X koordinatı').setStyle(TextInputStyle.Short).setRequired(true);
    const yInput = new TextInputBuilder().setCustomId('y').setLabel('Y koordinatı').setStyle(TextInputStyle.Short).setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(xInput), new ActionRowBuilder().addComponents(yInput));
    return interaction.showModal(modal);
  },
};

module.exports = [guver, saldir, siralama, harita];
