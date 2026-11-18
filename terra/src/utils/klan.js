// src/utils/klan.js — Klan kurma ve klan duyuru mantığı
const { PermissionFlagsBits, ChannelType, EmbedBuilder, OverwriteType } = require('discord.js');
const { collections, FieldValue } = require('../firebase');

/**
 * Klan kurar: 2 rol + 1 kategori (klan adında) + 3 kanal.
 * Kategori yalnızca klan üyeleri, kurucu ve bot tarafından görülür.
 */
async function createKlan({ guild, name, ownerId }) {
  const docId = `${guild.id}_${name.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`;
  const klanRef = collections.klans.doc(docId);
  if ((await klanRef.get()).exists) {
    return { ok: false, reason: 'Bu isimde bir klan zaten var. Farklı bir isim dene.' };
  }

  // 1) Roller
  const memberRole = await guild.roles.create({
    name: `👑 ${name} Üyesi`,
    color: 0x5865f2,
    mentionable: true,
    reason: `Klan kurulumu: ${name}`,
  });
  const founderRole = await guild.roles.create({
    name: `🔧 ${name} Kurucusu`,
    color: 0xf1c40f,
    reason: `Klan kurulumu: ${name}`,
  });

  const allowView = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ReadMessageHistory];

  // 2) Kategori izinleri: @everyone kapalı, üye + kurucu açık
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role },
    { id: memberRole.id, allow: allowView, type: OverwriteType.Role },
    { id: founderRole.id, allow: [...allowView, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages], type: OverwriteType.Role },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels], type: OverwriteType.Member },
  ];

  // 3) Kategori + kanallar (en altta, kategori adı klanın adı)
  const category = await guild.channels.create({
    name: `🏰 ${name}`, type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
  });
  const sohbet = await guild.channels.create({
    name: 'klan-sohbet', type: ChannelType.GuildText, parent: category.id,
    permissionOverwrites: overwrites,
  });
  const haberler = await guild.channels.create({
    name: 'klan-haberler', type: ChannelType.GuildText, parent: category.id,
    permissionOverwrites: [
      ...overwrites.filter(o => o.id !== memberRole.id && o.id !== founderRole.id),
      // Üyeler haberler kanalına yazamaz, sadece okur
      { id: memberRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages], type: OverwriteType.Role },
      { id: founderRole.id, allow: allowView, type: OverwriteType.Role },
    ],
  });
  const sesli = await guild.channels.create({
    name: 'Klan Sesli', type: ChannelType.GuildVoice, parent: category.id,
    permissionOverwrites: overwrites,
  });

  // 4) Kurucuya roller + Firestore kaydı
  await guild.members.addRole(ownerId, founderRole.id).catch(() => {});
  await guild.members.addRole(ownerId, memberRole.id).catch(() => {});

  await klanRef.set({
    guildId: guild.id, name, ownerId,
    memberRoleId: memberRole.id, founderRoleId: founderRole.id,
    categoryId: category.id, sohbetChannelId: sohbet.id,
    newsChannelId: haberler.id, voiceChannelId: sesli.id,
    totalPower: 0, members: [ownerId],
    createdAt: FieldValue.serverTimestamp(),
  });
  await collections.players.doc(`${guild.id}_${ownerId}`).set(
    { guildId: guild.id, discordId: ownerId, klanId: docId },
    { merge: true }
  );

  const embed = new EmbedBuilder()
    .setTitle(`🏰 ${name} Klanı Kuruldu!`)
    .setDescription('Klanın hazır!\n\n• klan-sohbet → sohbet edin\n• Klan Sesli → sesli toplanın\n• klan-haberler → klan haberleri (bot duyuruları)\n\nÜyeler güç bastıkça haberler kanalına düşer.')
    .setColor(0x5865f2)
    .setFooter({ text: 'Daisy © 2026' });
  await sohbet.send({ embeds: [embed] }).catch(() => {});

  return { ok: true, docId };
}

/** Güç bastığında klan haberler kanalına duyuru atar. */
async function announcePower(client, klanId, userTag, gained, newTotal) {
  const klanSnap = await collections.klans.doc(klanId).get();
  if (!klanSnap.exists) return;
  const klan = klanSnap.data();
  if (!klan.newsChannelId) return;
  const channel = await client.channels.fetch(klan.newsChannelId).catch(() => null);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setDescription(`⚡ **${userTag}** kişisi **${gained}** güç bastı — haritanız güçlendi! (Klan gücü: **${newTotal}**)`)
    .setColor(0x2ecc71)
    .setFooter({ text: 'Daisy © 2026' });
  await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { createKlan, announcePower };
