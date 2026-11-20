import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { TICKET_CONFIG } from '../../config/rexal.config.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'tickets.json');
const ACTIVE_STATUSES = new Set(['open', 'claimed', 'waiting_user']);
const OPENING_USERS = new Set();
const TRANSCRIPT_LIMIT = 300;

const CATEGORIES = {
  giveaway: {
    label: 'Çekiliş Kazandım',
    emoji: '🎉',
    description: 'Ödül ve kazanan talebi',
    checklist: 'Çekiliş bağlantısını ve kazandığın ödülü hazırla. Görsel kanıtını ticket açılınca kanala gönderebilirsin.',
    fields: [
      { id: 'giveawayLink', label: 'Çekiliş bağlantısı', style: TextInputStyle.Short, maxLength: 200 },
      { id: 'prize', label: 'Kazandığın ödül', style: TextInputStyle.Short, maxLength: 100 },
      { id: 'details', label: 'Talebinle ilgili ek bilgi', style: TextInputStyle.Paragraph, maxLength: 700 },
    ],
  },
  bug: {
    label: 'Bug / Hata Bildir',
    emoji: '🐞',
    description: 'Bir hata veya teknik aksaklık bildir',
    checklist: 'Hatanın olduğu özelliği, tekrarlama adımlarını ve beklediğin sonucu yaz. Ekran görüntüsü ekleyebilirsin.',
    fields: [
      { id: 'feature', label: 'Hata hangi özellikte oluştu?', style: TextInputStyle.Short, maxLength: 100 },
      { id: 'steps', label: 'Hata nasıl tekrarlanır?', style: TextInputStyle.Paragraph, maxLength: 700 },
      { id: 'expected', label: 'Beklediğin sonuç / aldığın hata', style: TextInputStyle.Paragraph, maxLength: 700 },
    ],
  },
  staff: {
    label: 'Yetkili Başvurusu',
    emoji: '🛡️',
    description: 'Yetkili ekibine katılma başvurusu',
    checklist: 'Başvurunu açık ve doğru bilgilerle doldur. Ekip başvurunu ticket üzerinden değerlendirecek.',
    fields: [
      { id: 'experience', label: 'Önceki yetkili deneyimin', style: TextInputStyle.Paragraph, maxLength: 700 },
      { id: 'availability', label: 'Aktif olabildiğin gün/saatler', style: TextInputStyle.Short, maxLength: 150 },
      { id: 'motivation', label: 'Neden ekibe katılmak istiyorsun?', style: TextInputStyle.Paragraph, maxLength: 700 },
    ],
  },
  support: {
    label: 'Teknik Destek',
    emoji: '🧰',
    description: 'Kurulum, kullanım veya hesap desteği',
    checklist: 'Sorunu yaşadığın cihazı/uygulamayı ve gördüğün hata mesajını belirt. Şifre veya token paylaşma.',
    fields: [
      { id: 'topic', label: 'Hangi konuda destek gerekiyor?', style: TextInputStyle.Short, maxLength: 150 },
      { id: 'details', label: 'Sorunu ayrıntılı anlat', style: TextInputStyle.Paragraph, maxLength: 800 },
      { id: 'attempted', label: 'Şimdiye kadar ne denedin?', style: TextInputStyle.Paragraph, maxLength: 500, required: false },
    ],
  },
  other: {
    label: 'Diğer',
    emoji: '💬',
    description: 'Listede olmayan bir talebin varsa',
    checklist: 'Konunu kısaca belirt ve ekibin yardımcı olabilmesi için gerekli ayrıntıları yaz.',
    fields: [
      { id: 'topic', label: 'Talep konusu', style: TextInputStyle.Short, maxLength: 150 },
      { id: 'details', label: 'Talebini ayrıntılı anlat', style: TextInputStyle.Paragraph, maxLength: 900 },
    ],
  },
};

function emptyStore() {
  return { version: 1, nextId: 1, tickets: {} };
}

function ensureStoreFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(emptyStore(), null, 2), 'utf8');
  }
}

function readStore() {
  ensureStoreFile();
  const raw = fs.readFileSync(STORE_PATH, 'utf8');
  if (!raw.trim()) return emptyStore();

  let store;
  try {
    store = JSON.parse(raw);
  } catch (error) {
    throw new Error(`[Ticket] data/tickets.json bozuk veya okunamıyor: ${error.message}`);
  }

  if (!store || !Number.isInteger(store.nextId) || !store.tickets || typeof store.tickets !== 'object') {
    throw new Error('[Ticket] data/tickets.json beklenen ticket veri biçiminde değil.');
  }
  return store;
}

function writeStore(store) {
  ensureStoreFile();
  const tempPath = `${STORE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tempPath, STORE_PATH);
}

function normalizeText(value, maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength);
}

function getCategory(categoryId) {
  return CATEGORIES[categoryId] || null;
}

function hasStaffRole(member) {
  const configuredRoles = TICKET_CONFIG.supportRoleIds;
  if (!Array.isArray(configuredRoles) || configuredRoles.length === 0) return false;

  const roles = member?.roles;
  if (roles?.cache) return configuredRoles.some(roleId => roles.cache.has(roleId));
  if (Array.isArray(roles)) return configuredRoles.some(roleId => roles.includes(roleId));
  return false;
}

function isStaff(userId, member) {
  return userId === TICKET_CONFIG.ownerId || hasStaffRole(member);
}

function getTicket(ticketId) {
  const id = String(ticketId || '');
  if (!/^\d+$/.test(id)) return null;
  return readStore().tickets[id] || null;
}

function findActiveTicket(guildId, userId) {
  const store = readStore();
  return Object.values(store.tickets).find(ticket =>
    ticket.guildId === guildId
    && ticket.ownerId === userId
    && ACTIVE_STATUSES.has(ticket.status)
  ) || null;
}

function supportOverwrites(guild, userId, includeSend = true, voice = false) {
  const allowUser = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
  ];
  if (includeSend) allowUser.push(PermissionFlagsBits.SendMessages);
  if (voice) allowUser.push(PermissionFlagsBits.Connect, PermissionFlagsBits.Speak);

  const supportPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
  ];
  if (voice) supportPermissions.push(PermissionFlagsBits.Connect, PermissionFlagsBits.Speak);

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, allow: allowUser },
  ];

  for (const roleId of TICKET_CONFIG.supportRoleIds) {
    overwrites.push({ id: roleId, allow: supportPermissions });
  }

  if (TICKET_CONFIG.ownerId !== userId) {
    overwrites.push({ id: TICKET_CONFIG.ownerId, allow: supportPermissions });
  }

  if (guild.members.me) {
    overwrites.push({
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        ...(voice ? [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] : []),
      ],
    });
  }

  return overwrites;
}

function makePanel() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🎫 DESTEK MERKEZİ')
    .setDescription([
      'Yardım almak için aşağıdan talep konunu seç. Sana uygun bir form göstereceğiz ve özel bir destek kanalı açacağız.',
      '',
      '🔒 Ticket’ı yalnızca sen ve destek ekibi görebilir.',
      '📎 Ekran görüntüsü veya dosyaları ticket açıldıktan sonra kanala gönderebilirsin.',
      '⚠️ Şifre, token veya diğer gizli bilgilerini paylaşma.',
    ].join('\n'))
    .addFields({
      name: 'Nasıl çalışır?',
      value: 'Konunu seç → kısa formu doldur → özel kanalda ekiple görüş.',
    })
    .setFooter({ text: 'REXAL SYSTEMS • Destek Merkezi' })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:category')
    .setPlaceholder('Talep konusunu seç')
    .addOptions(Object.entries(CATEGORIES).map(([value, category]) => ({
      label: category.label,
      value,
      description: category.description,
      emoji: category.emoji,
    })));

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)],
    allowedMentions: { parse: [] },
  };
}

function makeCategoryModal(categoryId) {
  const category = getCategory(categoryId);
  if (!category) throw new Error('Bilinmeyen ticket kategorisi.');

  const modal = new ModalBuilder()
    .setCustomId(`ticket:submit:${categoryId}`)
    .setTitle(`${category.emoji} ${category.label}`.slice(0, 45));

  for (const field of category.fields) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(field.label)
      .setStyle(field.style)
      .setRequired(field.required !== false)
      .setMaxLength(field.maxLength);
    if (field.style === TextInputStyle.Short) input.setMinLength(2);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

function statusLabel(ticket) {
  if (ticket.status === 'closed') return 'Kapalı';
  if (ticket.status === 'waiting_user') return 'Kullanıcıdan yanıt bekleniyor';
  if (ticket.assignedToId) return `Üstlenildi · <@${ticket.assignedToId}>`;
  return 'Yetkili bekleniyor';
}

function makeTicketEmbed(ticket) {
  const category = getCategory(ticket.categoryId);
  const embed = new EmbedBuilder()
    .setColor(ticket.status === 'closed' ? 0x747f8d : 0x5865f2)
    .setTitle(`${category?.emoji || '🎫'} Talep #${ticket.id} · ${category?.label || 'Destek'}`)
    .setDescription(ticket.status === 'closed'
      ? 'Bu talep kapatıldı. Tekrar yardıma ihtiyacın varsa yeniden açabilirsin.'
      : 'Talebini burada ekiple paylaşabilirsin. Ek dosya ve ekran görüntüsü gönderebilirsin.')
    .addFields(
      { name: 'Talebi açan', value: `<@${ticket.ownerId}>`, inline: true },
      { name: 'Durum', value: statusLabel(ticket), inline: true },
      { name: 'Açılış', value: `<t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:F>`, inline: false },
    );

  const details = Object.entries(ticket.form || {})
    .filter(([, value]) => value)
    .map(([label, value]) => `**${label}**\n${normalizeText(value, 800)}`)
    .join('\n\n')
    .slice(0, 3800);
  if (details) embed.addFields({ name: 'Talep Detayları', value: details });
  if (ticket.closeReason) embed.addFields({ name: 'Kapanış nedeni', value: normalizeText(ticket.closeReason, 900) });
  if (ticket.rating) embed.addFields({ name: 'Kullanıcı değerlendirmesi', value: `${'⭐'.repeat(ticket.rating)} (${ticket.rating}/5)` });
  return embed.setFooter({ text: 'REXAL SYSTEMS • Ticket Yönetimi' }).setTimestamp();
}

function makeTicketComponents(ticket) {
  if (ticket.status === 'closed') {
    const reopen = new ButtonBuilder()
      .setCustomId(`ticket:reopen:${ticket.id}`)
      .setLabel('Talebi Yeniden Aç')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Primary);
    const rows = [new ActionRowBuilder().addComponents(reopen)];

    if (!ticket.rating) {
      rows.push(new ActionRowBuilder().addComponents(
        ...[1, 2, 3, 4, 5].map(score => new ButtonBuilder()
          .setCustomId(`ticket:rate:${ticket.id}:${score}`)
          .setLabel(String(score))
          .setEmoji('⭐')
          .setStyle(ButtonStyle.Secondary)),
      ));
    }
    return rows;
  }

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:claim:${ticket.id}`)
      .setLabel(ticket.assignedToId ? 'Üstlenildi' : 'Talebi Üstlen')
      .setEmoji(ticket.assignedToId ? '✅' : '📌')
      .setStyle(ticket.assignedToId ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(Boolean(ticket.assignedToId)),
    new ButtonBuilder()
      .setCustomId(`ticket:waiting:${ticket.id}`)
      .setLabel(ticket.status === 'waiting_user' ? 'Yanıt Bekleniyor' : 'Yanıt Bekle')
      .setEmoji('⏳')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket:lock:${ticket.id}`)
      .setLabel(ticket.locked ? 'Kilidi Aç' : 'Kilitle')
      .setEmoji(ticket.locked ? '🔓' : '🔒')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticket.id}`)
      .setLabel('Talebi Kapat')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger),
  );

  const actions = new StringSelectMenuBuilder()
    .setCustomId(`ticket:actions:${ticket.id}`)
    .setPlaceholder('Diğer talep işlemleri')
    .addOptions(
      { label: 'Yetkiliye Devret', value: 'assign', emoji: '🧑‍💼', description: 'Talebi başka bir destek yetkilisine ata' },
      { label: 'Üye Ekle', value: 'add_member', emoji: '👤', description: 'Bu talebe başka bir sunucu üyesi ekle' },
      { label: 'Üyeyi Çıkar', value: 'remove_member', emoji: '🚪', description: 'Eklenmiş bir üyeyi ticket’tan çıkar' },
      { label: 'Talep Konusunu Değiştir', value: 'change_category', emoji: '🔀', description: 'Ticket konusunu başka bir kategoriye taşı' },
      { label: 'Sesli Destek Aç', value: 'voice', emoji: '🔊', description: 'Talep için özel ses kanalı oluştur' },
      { label: 'Konuşma Dökümünü Al', value: 'transcript', emoji: '📄', description: 'Ticket konuşmasını kayıt kanalına gönder' },
    );
  return [controls, new ActionRowBuilder().addComponents(actions)];
}

function formatForm(category, interaction) {
  const fields = {};
  for (const field of category.fields) {
    const value = interaction.fields.getTextInputValue(field.id).trim();
    if (value) fields[field.label] = value;
  }
  return fields;
}

function slugify(value) {
  const ascii = String(value || 'uye')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18);
  return ascii || 'uye';
}

function reserveTicketId() {
  const store = readStore();
  const id = String(store.nextId).padStart(5, '0');
  store.nextId += 1;
  writeStore(store);
  return id;
}

async function createTicket(interaction, categoryId) {
  const category = getCategory(categoryId);
  if (!category || !interaction.guild) {
    await interaction.reply({ content: '❌ Bu ticket kategorisi kullanılamıyor.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const openingKey = `${interaction.guildId}:${interaction.user.id}`;
  if (OPENING_USERS.has(openingKey)) {
    await interaction.editReply({ content: '⏳ Talebin oluşturuluyor, lütfen birkaç saniye bekle.' });
    return;
  }

  OPENING_USERS.add(openingKey);
  let createdChannel = null;
  let saved = false;
  try {
    const categoryChannel = await interaction.guild.channels.fetch(TICKET_CONFIG.categoryId);
    if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
      throw new Error(`Ticket kategorisi bulunamadı veya kategori kanalı değil: ${TICKET_CONFIG.categoryId}`);
    }

    const openCount = Object.values(readStore().tickets).filter(ticket =>
      ticket.guildId === interaction.guildId
      && ticket.ownerId === interaction.user.id
      && ACTIVE_STATUSES.has(ticket.status)
    ).length;
    if (openCount >= TICKET_CONFIG.maxOpenTicketsPerUser) {
      const active = findActiveTicket(interaction.guildId, interaction.user.id);
      await interaction.editReply({
        content: active?.channelId
          ? `Zaten açık bir talebin var: <#${active.channelId}>`
          : 'Zaten açık bir talebin var. Yeni talep açmadan önce mevcut talebini kapat.',
      });
      return;
    }

    const form = formatForm(category, interaction);
    const id = reserveTicketId();
    const channelName = `ticket-${id}-${slugify(categoryId)}-${slugify(interaction.user.username)}`.slice(0, 95);
    createdChannel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryChannel.id,
      topic: `ticket:${id};owner:${interaction.user.id};type:${categoryId}`,
      permissionOverwrites: supportOverwrites(interaction.guild, interaction.user.id),
      reason: `Ticket #${id} açıldı (${category.label})`,
    });

    const ticket = {
      id,
      guildId: interaction.guildId,
      channelId: createdChannel.id,
      ownerId: interaction.user.id,
      categoryId,
      status: 'open',
      assignedToId: null,
      memberIds: [],
      voiceChannelId: null,
      locked: false,
      form,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      lastStaffReminderAt: null,
      lastUserReminderAt: null,
      firstResponseAt: null,
      messageId: null,
      closeReason: null,
      closedAt: null,
      rating: null,
    };

    const ticketMessage = await createdChannel.send({
      content: `<@${interaction.user.id}>`,
      embeds: [makeTicketEmbed(ticket)],
      components: makeTicketComponents(ticket),
      allowedMentions: { users: [interaction.user.id] },
    });
    ticket.messageId = ticketMessage.id;

    const store = readStore();
    store.tickets[id] = ticket;
    writeStore(store);
    saved = true;
    await interaction.editReply({ content: `✅ Talebin açıldı: ${createdChannel}` });
    await auditTicket(interaction.guild, ticket, 'Talep açıldı', interaction.user.id);
  } catch (error) {
    if (createdChannel && !saved) {
      await createdChannel.delete('Ticket oluşturulurken hata oluştu').catch(deleteError => {
        console.error(`[Ticket] Oluşturma başarısız; boş kanal silinemedi (${createdChannel.id}):`, deleteError);
      });
    }
    throw error;
  } finally {
    OPENING_USERS.delete(openingKey);
  }
}

async function fetchTicketChannel(interaction, ticketId) {
  const ticket = getTicket(ticketId);
  if (!ticket || ticket.guildId !== interaction.guildId || ticket.channelId !== interaction.channelId) {
    await interaction.reply({ content: '❌ Bu ticket kaydı bulunamadı veya bu kanala ait değil.', ephemeral: true });
    return null;
  }
  return ticket;
}

async function refreshTicket(interaction, ticket) {
  const channel = interaction.channel;
  if (!channel || !ticket.messageId) throw new Error(`Ticket #${ticket.id} panel mesajı bulunamadı.`);
  const message = await channel.messages.fetch(ticket.messageId);
  await message.edit({
    embeds: [makeTicketEmbed(ticket)],
    components: makeTicketComponents(ticket),
    allowedMentions: { parse: [] },
  });
}

async function writeTicket(ticket) {
  const store = readStore();
  store.tickets[ticket.id] = ticket;
  writeStore(store);
}

async function postLog(guild, content, files = []) {
  if (!TICKET_CONFIG.logChannelId) return false;
  const channel = await guild.channels.fetch(TICKET_CONFIG.logChannelId);
  if (!channel || !channel.isTextBased() || !channel.send) {
    throw new Error(`Ticket kayıt kanalı bulunamadı veya mesaj gönderilemiyor: ${TICKET_CONFIG.logChannelId}`);
  }
  await channel.send({ content, files, allowedMentions: { parse: [] } });
  return true;
}

async function auditTicket(guild, ticket, action, actorId) {
  try {
    await postLog(
      guild,
      `🎫 Ticket #${ticket.id} · ${action}\nTalep: <#${ticket.channelId}> · Kullanıcı: <@${ticket.ownerId}> · İşlemi yapan: <@${actorId}>`,
    );
  } catch (error) {
    console.error(`[Ticket] #${ticket.id} işlem kaydı gönderilemedi (${action}):`, error);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function createTranscript(channel, ticket) {
  const messages = [];
  let before;
  while (messages.length < TRANSCRIPT_LIMIT) {
    const batch = await channel.messages.fetch({
      limit: Math.min(100, TRANSCRIPT_LIMIT - messages.length),
      ...(before ? { before } : {}),
    });
    if (batch.size === 0) break;
    const page = [...batch.values()];
    messages.push(...page);
    before = page[page.length - 1].id;
    if (batch.size < 100) break;
  }

  const ordered = messages
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(message => {
      const attachments = [...message.attachments.values()]
        .map(file => `<a href="${escapeHtml(file.url)}">${escapeHtml(file.name || 'Ek dosya')}</a>`)
        .join(' · ');
      const body = escapeHtml(message.cleanContent || message.content || '[Mesaj içeriği yok]')
        .replace(/\n/g, '<br>');
      return `<article><header><strong>${escapeHtml(message.author?.tag || 'Bilinmeyen kullanıcı')}</strong><time>${new Date(message.createdTimestamp).toISOString()}</time></header><div>${body}</div>${attachments ? `<footer>${attachments}</footer>` : ''}</article>`;
    })
    .join('\n');

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ticket #${escapeHtml(ticket.id)}</title><style>body{font:15px system-ui,sans-serif;background:#1e1f22;color:#e3e5e8;margin:0;padding:24px}main{max-width:900px;margin:auto}h1{color:#fff}article{background:#2b2d31;border-radius:8px;padding:14px;margin:12px 0;overflow-wrap:anywhere}header{display:flex;justify-content:space-between;gap:12px;color:#fff}time,footer{font-size:12px;color:#b5bac1}article div{margin-top:8px;line-height:1.5}a{color:#00a8fc}</style></head><body><main><h1>Ticket #${escapeHtml(ticket.id)} · ${escapeHtml(getCategory(ticket.categoryId)?.label || 'Destek')}</h1><p>Talep sahibi: ${escapeHtml(ticket.ownerId)} · Açılış: ${escapeHtml(ticket.createdAt)}</p><p>Son 300 mesajın dökümü</p>${ordered}</main></body></html>`;
  return Buffer.from(html, 'utf8');
}

async function deliverTranscript(guild, channel, ticket) {
  const buffer = await createTranscript(channel, ticket);
  const file = new AttachmentBuilder(buffer, { name: `ticket-${ticket.id}.html` });
  const message = `📄 Ticket #${ticket.id} konuşma dökümü · <#${ticket.channelId}>`;
  const deliveredToLog = await postLog(guild, message, [file]);
  if (!deliveredToLog) {
    await channel.send({ content: message, files: [file], allowedMentions: { parse: [] } });
  }
}

function makeCloseModal(ticketId) {
  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Kapatma nedeni')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(500);
  return new ModalBuilder()
    .setCustomId(`ticket:close_submit:${ticketId}`)
    .setTitle(`Talep #${ticketId} kapatılıyor`)
    .addComponents(new ActionRowBuilder().addComponents(reason));
}

function makeUserActionModal(ticketId, action) {
  const isAssignment = action === 'assign';
  const isRemoval = action === 'remove_member';
  const userId = new TextInputBuilder()
    .setCustomId('user_id')
    .setLabel(isAssignment ? 'Yetkilinin Discord ID’si' : 'Kullanıcının Discord ID’si')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Örn. 123456789012345678')
    .setMinLength(17)
    .setMaxLength(20)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId(`ticket:${action}_submit:${ticketId}`)
    .setTitle(`Ticket #${ticketId} · ${isAssignment ? 'Yetkiliye devret' : (isRemoval ? 'Üyeyi çıkar' : 'Üye ekle')}`)
    .addComponents(new ActionRowBuilder().addComponents(userId));
}

async function handleCreateModal(interaction, categoryId) {
  if (!getCategory(categoryId)) {
    await interaction.reply({ content: '❌ Bu ticket kategorisi kullanılamıyor.', ephemeral: true });
    return;
  }
  await createTicket(interaction, categoryId);
}

async function handleUserAction(interaction, ticketId, action) {
  const ticket = await fetchTicketChannel(interaction, ticketId);
  if (!ticket) return;
  if (!isStaff(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: '❌ Bu işlem yalnızca destek ekibi içindir.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  if (ticket.status === 'closed') {
    await interaction.editReply({ content: 'Kapalı ticket’ta işlem yapmak için önce yeniden aç.' });
    return;
  }
  const userId = interaction.fields.getTextInputValue('user_id').trim();
  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.editReply({ content: '❌ Geçerli bir Discord kullanıcı ID’si gir.' });
    return;
  }

  let member;
  try {
    member = await interaction.guild.members.fetch(userId);
  } catch (error) {
    if (error.code !== 10007 && error.status !== 404) throw error;
  }
  if (!member || member.user.bot) {
    await interaction.editReply({ content: '❌ Bu ID ile sunucuda bir kullanıcı bulunamadı.' });
    return;
  }

  if (action === 'assign_submit') {
    if (!isStaff(member.id, member)) {
      await interaction.editReply({ content: '❌ Bu kullanıcı destek yetkilisi olarak yapılandırılmamış.' });
      return;
    }
    ticket.assignedToId = member.id;
    ticket.status = 'claimed';
    ticket.claimedAt = new Date().toISOString();
    await writeTicket(ticket);
    await refreshTicket(interaction, ticket);
    await auditTicket(interaction.guild, ticket, `Yetkiliye devredildi: ${member.user.tag}`, interaction.user.id);
    await interaction.editReply({ content: `✅ Ticket ${member} kullanıcısına devredildi.` });
    return;
  }

  if (action === 'remove_member_submit') {
    if (member.id === ticket.ownerId || !(ticket.memberIds || []).includes(member.id)) {
      await interaction.editReply({ content: '❌ Bu kullanıcı ticket’a eklenmiş bir üye değil veya ticket’ın sahibi.' });
      return;
    }
    await interaction.channel.permissionOverwrites.delete(member.id, `Ticket #${ticket.id} üyesi çıkarıldı`);
    ticket.memberIds = ticket.memberIds.filter(id => id !== member.id);
    await writeTicket(ticket);
    await auditTicket(interaction.guild, ticket, `Üye çıkarıldı: ${member.user.tag}`, interaction.user.id);
    await interaction.editReply({ content: `✅ ${member} ticket’tan çıkarıldı.` });
    return;
  }

  await interaction.channel.permissionOverwrites.edit(member.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
  }, { reason: `Ticket #${ticket.id} için yetkili tarafından eklendi` });
  ticket.memberIds = [...new Set([...(ticket.memberIds || []), member.id])];
  await writeTicket(ticket);
  await auditTicket(interaction.guild, ticket, `Üye eklendi: ${member.user.tag}`, interaction.user.id);
  await interaction.editReply({ content: `✅ ${member} ticket’a eklendi.` });
}

async function createVoiceSupport(interaction, ticket) {
  await interaction.deferReply({ ephemeral: true });
  if (ticket.voiceChannelId) {
    let existing;
    try {
      existing = await interaction.guild.channels.fetch(ticket.voiceChannelId);
    } catch (error) {
      if (error.code !== 10003 && error.status !== 404) throw error;
    }
    if (existing) {
      await interaction.editReply({ content: `🔊 Sesli destek kanalı zaten açık: ${existing}` });
      return;
    }
  }

  const voice = await interaction.guild.channels.create({
    name: `ses-ticket-${ticket.id}`,
    type: ChannelType.GuildVoice,
    parent: TICKET_CONFIG.categoryId,
    permissionOverwrites: supportOverwrites(interaction.guild, ticket.ownerId, true, true),
    reason: `Ticket #${ticket.id} için sesli destek`,
  });
  ticket.voiceChannelId = voice.id;
  await writeTicket(ticket);
  await auditTicket(interaction.guild, ticket, 'Özel sesli destek açıldı', interaction.user.id);
  await interaction.editReply({ content: `🔊 Özel sesli destek kanalı açıldı: ${voice}` });
}

async function handleActionSelect(interaction, ticketId) {
  const ticket = await fetchTicketChannel(interaction, ticketId);
  if (!ticket) return;
  if (ticket.status === 'closed') {
    await interaction.reply({ content: 'Kapalı ticket’ta işlem yapmak için önce yeniden aç.', ephemeral: true });
    return;
  }
  if (!isStaff(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: '❌ Bu işlem yalnızca destek ekibi içindir.', ephemeral: true });
    return;
  }

  const action = interaction.values[0];
  if (action === 'assign') {
    await interaction.showModal(makeUserActionModal(ticket.id, 'assign'));
    return;
  }
  if (action === 'add_member') {
    await interaction.showModal(makeUserActionModal(ticket.id, 'add_member'));
    return;
  }
  if (action === 'remove_member') {
    await interaction.showModal(makeUserActionModal(ticket.id, 'remove_member'));
    return;
  }
  if (action === 'change_category') {
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId(`ticket:move_category:${ticket.id}`)
      .setPlaceholder('Yeni talep konusunu seç')
      .addOptions(Object.entries(CATEGORIES).map(([value, category]) => ({
        label: category.label,
        value,
        description: category.description,
        emoji: category.emoji,
      })));
    await interaction.reply({
      content: 'Bu ticket için yeni talep konusunu seç:',
      components: [new ActionRowBuilder().addComponents(categorySelect)],
      ephemeral: true,
    });
    return;
  }
  if (action === 'voice') {
    await createVoiceSupport(interaction, ticket);
    return;
  }
  if (action === 'transcript') {
    await interaction.deferReply({ ephemeral: true });
    await deliverTranscript(interaction.guild, interaction.channel, ticket);
    await interaction.editReply({
      content: TICKET_CONFIG.logChannelId
        ? '✅ Konuşma dökümü kayıt kanalına gönderildi.'
        : '✅ Konuşma dökümü bu ticket kanalına gönderildi.',
    });
    return;
  }

  await interaction.reply({ content: '❌ Geçersiz ticket işlemi.', ephemeral: true });
}

async function handleButton(interaction, parts) {
  const [action, ticketId, extra] = parts;

  if (action === 'form') {
    const category = getCategory(ticketId);
    if (!category) {
      await interaction.reply({ content: '❌ Bu ticket kategorisi kullanılamıyor.', ephemeral: true });
      return;
    }
    await interaction.showModal(makeCategoryModal(ticketId));
    return;
  }

  if (action === 'cancel_form') {
    await interaction.update({ content: 'Talep açma işlemi iptal edildi.', embeds: [], components: [] });
    return;
  }

  const ticket = await fetchTicketChannel(interaction, ticketId);
  if (!ticket) return;

  if (action === 'rate') {
    const rating = Number(extra);
    if (interaction.user.id !== ticket.ownerId || ticket.status !== 'closed' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      await interaction.reply({ content: '❌ Bu değerlendirme yalnızca kapalı ticket’ın sahibi tarafından verilebilir.', ephemeral: true });
      return;
    }
    ticket.rating = rating;
    ticket.ratedAt = new Date().toISOString();
    await writeTicket(ticket);
    await interaction.update({ embeds: [makeTicketEmbed(ticket)], components: makeTicketComponents(ticket) });
    return;
  }

  if (action === 'reopen') {
    if (interaction.user.id !== ticket.ownerId && !isStaff(interaction.user.id, interaction.member)) {
      await interaction.reply({ content: '❌ Bu ticket’ı yalnızca sahibi veya destek ekibi yeniden açabilir.', ephemeral: true });
      return;
    }
    if (ticket.status !== 'closed') {
      await interaction.reply({ content: 'Bu ticket zaten açık.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    await interaction.channel.permissionOverwrites.edit(ticket.ownerId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true,
    }, { reason: `Ticket #${ticket.id} yeniden açıldı` });
    ticket.status = 'open';
    ticket.locked = false;
    ticket.assignedToId = null;
    ticket.closeReason = null;
    ticket.closedAt = null;
    ticket.rating = null;
    ticket.ratedAt = null;
    ticket.lastActivityAt = new Date().toISOString();
    ticket.lastStaffReminderAt = null;
    ticket.lastUserReminderAt = null;
    await writeTicket(ticket);
    await refreshTicket(interaction, ticket);
    await auditTicket(interaction.guild, ticket, 'Talep yeniden açıldı', interaction.user.id);
    await interaction.editReply({ content: `✅ Ticket #${ticket.id} yeniden açıldı.` });
    return;
  }

  if (!isStaff(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: '❌ Bu işlem yalnızca destek ekibi içindir.', ephemeral: true });
    return;
  }

  if (action === 'close') {
    await interaction.showModal(makeCloseModal(ticket.id));
    return;
  }

  if (ticket.status === 'closed') {
    await interaction.reply({ content: 'Kapalı ticket’ta işlem yapmak için önce yeniden aç.', ephemeral: true });
    return;
  }

  if (action === 'claim' && ticket.assignedToId) {
    await interaction.reply({ content: `Bu talep zaten <@${ticket.assignedToId}> tarafından üstlenilmiş.`, ephemeral: true });
    return;
  }
  if (!['claim', 'waiting', 'lock'].includes(action)) {
    await interaction.reply({ content: '❌ Geçersiz ticket işlemi.', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();
  if (action === 'claim') {
    ticket.assignedToId = interaction.user.id;
    ticket.status = 'claimed';
    ticket.claimedAt = new Date().toISOString();
  } else if (action === 'waiting') {
    ticket.status = ticket.status === 'waiting_user' ? (ticket.assignedToId ? 'claimed' : 'open') : 'waiting_user';
  } else {
    const shouldLock = !ticket.locked;
    await interaction.channel.permissionOverwrites.edit(ticket.ownerId, {
      SendMessages: !shouldLock,
      AttachFiles: !shouldLock,
    }, { reason: shouldLock ? `Ticket #${ticket.id} kilitlendi` : `Ticket #${ticket.id} kilidi açıldı` });
    ticket.locked = shouldLock;
  }

  await writeTicket(ticket);
  await refreshTicket(interaction, ticket);
  await auditTicket(interaction.guild, ticket, action === 'claim'
    ? 'Talep üstlenildi'
    : action === 'waiting'
      ? `Durum değiştirildi: ${statusLabel(ticket)}`
      : (ticket.locked ? 'Talep kilitlendi' : 'Talep kilidi açıldı'), interaction.user.id);
  await interaction.followUp({
    content: action === 'claim'
      ? `✅ Ticket #${ticket.id} üstlenildi.`
      : action === 'waiting'
        ? `✅ Ticket durumu: ${statusLabel(ticket)}.`
        : `✅ Ticket ${ticket.locked ? 'kilitlendi' : 'kilidi açıldı'}.`,
    ephemeral: true,
  });
}

async function handleCloseSubmit(interaction, ticketId) {
  const ticket = await fetchTicketChannel(interaction, ticketId);
  if (!ticket) return;
  if (!isStaff(interaction.user.id, interaction.member)) {
    await interaction.reply({ content: '❌ Bu işlem yalnızca destek ekibi içindir.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const reason = interaction.fields.getTextInputValue('reason').trim();
  if (ticket.status === 'closed') {
    await interaction.editReply({ content: 'Bu ticket zaten kapalı.' });
    return;
  }

  await deliverTranscript(interaction.guild, interaction.channel, ticket);
  const oldLocked = ticket.locked;
  await interaction.channel.permissionOverwrites.edit(ticket.ownerId, {
    SendMessages: false,
    AttachFiles: false,
  }, { reason: `Ticket #${ticket.id} kapatıldı` });

  ticket.status = 'closed';
  ticket.locked = true;
  ticket.closeReason = reason;
  ticket.closedAt = new Date().toISOString();
  try {
    await writeTicket(ticket);
  } catch (error) {
    await interaction.channel.permissionOverwrites.edit(ticket.ownerId, {
      SendMessages: !oldLocked,
      AttachFiles: !oldLocked,
    }, { reason: `Ticket #${ticket.id} kapanış kaydı başarısız oldu; önceki izinler geri yüklendi` });
    throw error;
  }

  if (ticket.voiceChannelId) {
    let voice;
    let voiceGone = false;
    try {
      voice = await interaction.guild.channels.fetch(ticket.voiceChannelId);
    } catch (error) {
      if (error.code === 10003 || error.status === 404) voiceGone = true;
      else console.error(`[Ticket] #${ticket.id} ses kanalı alınamadı:`, error);
    }
    if (voice) {
      try {
        await voice.delete(`Ticket #${ticket.id} kapatıldı`);
        voiceGone = true;
      } catch (error) {
        if (error.code === 10003 || error.status === 404) voiceGone = true;
        else console.error(`[Ticket] #${ticket.id} ses kanalı kapatılamadı:`, error);
      }
    }
    if (voiceGone) {
      ticket.voiceChannelId = null;
      await writeTicket(ticket);
    }
  }

  await refreshTicket(interaction, ticket);
  await auditTicket(interaction.guild, ticket, `Kapatıldı: ${normalizeText(reason, 500)}`, interaction.user.id);
  await interaction.editReply({ content: `✅ Ticket #${ticket.id} kapatıldı. Konuşma dökümü kaydedildi.` });
}

function ticketStats(guildId) {
  const tickets = Object.values(readStore().tickets).filter(ticket => ticket.guildId === guildId);
  const open = tickets.filter(ticket => ACTIVE_STATUSES.has(ticket.status)).length;
  const closed = tickets.filter(ticket => ticket.status === 'closed').length;
  const rated = tickets.filter(ticket => Number.isInteger(ticket.rating));
  const average = rated.length
    ? (rated.reduce((sum, ticket) => sum + ticket.rating, 0) / rated.length).toFixed(2)
    : 'Henüz yok';
  const firstResponses = tickets
    .filter(ticket => ticket.firstResponseAt)
    .map(ticket => new Date(ticket.firstResponseAt).getTime() - new Date(ticket.createdAt).getTime())
    .filter(duration => Number.isFinite(duration) && duration >= 0);
  const averageFirstResponse = firstResponses.length
    ? formatDuration(firstResponses.reduce((sum, duration) => sum + duration, 0) / firstResponses.length)
    : 'Henüz yok';
  const byCategory = Object.entries(CATEGORIES)
    .map(([id, category]) => `${category.emoji} ${category.label}: **${tickets.filter(ticket => ticket.categoryId === id).length}**`)
    .join('\n');

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 Ticket İstatistikleri')
    .addFields(
      { name: 'Toplam', value: String(tickets.length), inline: true },
      { name: 'Açık', value: String(open), inline: true },
      { name: 'Kapalı', value: String(closed), inline: true },
      { name: 'Ortalama puan', value: average, inline: true },
      { name: 'Ort. ilk yanıt süresi', value: averageFirstResponse, inline: true },
      { name: 'Kategoriler', value: byCategory || 'Henüz ticket yok', inline: false },
    )
    .setTimestamp();
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}g ${hours}s`;
  if (hours) return `${hours}s ${minutes}dk`;
  return `${minutes}dk`;
}

async function handleTicketMessage(message) {
  if (message.author.bot || !message.guild || !message.channel.topic?.startsWith('ticket:')) return;
  const match = message.channel.topic.match(/^ticket:(\d+);/);
  if (!match) return;

  const ticket = getTicket(match[1]);
  if (!ticket || ticket.channelId !== message.channelId || ticket.status === 'closed') return;

  const now = new Date().toISOString();
  ticket.lastActivityAt = now;
  ticket.lastStaffReminderAt = null;
  ticket.lastUserReminderAt = null;

  if (message.author.id === ticket.ownerId && ticket.status === 'waiting_user') {
    ticket.status = ticket.assignedToId ? 'claimed' : 'open';
  } else if (message.author.id !== ticket.ownerId && isStaff(message.author.id, message.member)) {
    if (!ticket.firstResponseAt) ticket.firstResponseAt = now;
    if (!ticket.assignedToId) {
      ticket.assignedToId = message.author.id;
      ticket.claimedAt = now;
    }
    ticket.status = 'waiting_user';
  }

  await writeTicket(ticket);
  await message.channel.messages.fetch(ticket.messageId).then(panelMessage =>
    panelMessage.edit({
      embeds: [makeTicketEmbed(ticket)],
      components: makeTicketComponents(ticket),
      allowedMentions: { parse: [] },
    })
  );
}

async function runTicketReminders(client) {
  const now = Date.now();
  const store = readStore();
  for (const ticket of Object.values(store.tickets)) {
    if (!ACTIVE_STATUSES.has(ticket.status)) continue;
    try {
      const channel = await client.channels.fetch(ticket.channelId);
      if (!channel || !channel.isTextBased()) continue;

      const lastActivity = new Date(ticket.lastActivityAt || ticket.createdAt).getTime();
      const lastReminder = ticket.status === 'waiting_user'
        ? ticket.lastUserReminderAt
        : ticket.lastStaffReminderAt;
      const reminderInterval = ticket.status === 'waiting_user'
        ? TICKET_CONFIG.userResponseReminderMs
        : TICKET_CONFIG.staffReminderMs;
      const lastReminderTime = lastReminder ? new Date(lastReminder).getTime() : null;
      if (!Number.isFinite(lastActivity) || (lastReminderTime && now - lastReminderTime < reminderInterval)) continue;

      const elapsed = now - lastActivity;
      if (ticket.status === 'waiting_user' && elapsed >= TICKET_CONFIG.userResponseReminderMs) {
        await channel.send({
          content: `<@${ticket.ownerId}> ⏳ Ticket #${ticket.id} için ekibimiz yanıtını bekliyor. Devam etmek istemiyorsan destek ekibinden kapatmasını isteyebilirsin.`,
          allowedMentions: { users: [ticket.ownerId] },
        });
        ticket.lastUserReminderAt = new Date(now).toISOString();
        await writeTicket(ticket);
      } else if (ticket.status !== 'waiting_user' && elapsed >= TICKET_CONFIG.staffReminderMs) {
        const recipients = TICKET_CONFIG.supportRoleIds.length
          ? TICKET_CONFIG.supportRoleIds.map(roleId => `<@&${roleId}>`).join(' ')
          : `<@${TICKET_CONFIG.ownerId}>`;
        await channel.send({
          content: `${recipients} ⏰ Ticket #${ticket.id} uzun süredir ilk yanıtı bekliyor.`,
          allowedMentions: {
            users: TICKET_CONFIG.supportRoleIds.length ? [] : [TICKET_CONFIG.ownerId],
            roles: TICKET_CONFIG.supportRoleIds,
          },
        });
        ticket.lastStaffReminderAt = new Date(now).toISOString();
        await writeTicket(ticket);
      }
    } catch (error) {
      console.error(`[Ticket] #${ticket.id} hatırlatma işlemi başarısız:`, error);
    }
  }
}

export default {
  name: 'ticket',
  aliases: ['destek'],
  description: 'Destek panelini gönderir veya ticket istatistiklerini gösterir.',

  async execute(message, args) {
    if (!message.guild) {
      await message.reply('❌ Ticket sistemi yalnızca sunucuda kullanılabilir.');
      return;
    }
    if (!isStaff(message.author.id, message.member)) {
      await message.reply('❌ Bu komut yalnızca sistem sahibi veya destek ekibi tarafından kullanılabilir.');
      return;
    }

    const subcommand = args[0]?.toLowerCase();
    if (subcommand === 'istatistik' || subcommand === 'stats') {
      await message.reply({ embeds: [ticketStats(message.guild.id)] });
      return;
    }

    const category = await message.guild.channels.fetch(TICKET_CONFIG.categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) {
      throw new Error(`Ticket kategorisi bulunamadı veya kategori kanalı değil: ${TICKET_CONFIG.categoryId}`);
    }
    await message.reply(makePanel());
  },

  async onButton(interaction, parts) {
    await handleButton(interaction, parts);
  },

  async onSelect(interaction, parts) {
    const [action, ticketId] = parts;
    if (action === 'category') {
      const categoryId = interaction.values[0];
      const category = getCategory(categoryId);
      if (!category) {
        await interaction.reply({ content: '❌ Bu ticket kategorisi kullanılamıyor.', ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${category.emoji} ${category.label}`)
        .setDescription([
          category.checklist,
          '',
          'Devam ettiğinde kısa bir form dolduracaksın. Gizli bilgilerini forma yazma.',
        ].join('\n'));
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket:form:${categoryId}`)
          .setLabel('Talep Formunu Aç')
          .setEmoji('📝')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ticket:cancel_form')
          .setLabel('Vazgeç')
          .setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    if (action === 'move_category') {
      const ticket = await fetchTicketChannel(interaction, ticketId);
      if (!ticket) return;
      if (!isStaff(interaction.user.id, interaction.member)) {
        await interaction.reply({ content: '❌ Bu işlem yalnızca destek ekibi içindir.', ephemeral: true });
        return;
      }
      if (ticket.status === 'closed') {
        await interaction.reply({ content: 'Kapalı ticket’ta işlem yapmak için önce yeniden aç.', ephemeral: true });
        return;
      }

      const categoryId = interaction.values[0];
      const category = getCategory(categoryId);
      if (!category) {
        await interaction.reply({ content: '❌ Bu ticket kategorisi kullanılamıyor.', ephemeral: true });
        return;
      }
      if (ticket.categoryId === categoryId) {
        await interaction.reply({ content: 'Bu ticket zaten seçtiğin kategoride.', ephemeral: true });
        return;
      }

      await interaction.deferUpdate();
      await interaction.channel.setName(`ticket-${ticket.id}-${slugify(categoryId)}`);
      await interaction.channel.setTopic(`ticket:${ticket.id};owner:${ticket.ownerId};type:${categoryId}`);
      ticket.categoryId = categoryId;
      ticket.lastActivityAt = new Date().toISOString();
      ticket.lastStaffReminderAt = null;
      ticket.lastUserReminderAt = null;
      await writeTicket(ticket);
      await refreshTicket(interaction, ticket);
      await auditTicket(interaction.guild, ticket, `Talep konusu değiştirildi: ${category.label}`, interaction.user.id);
      await interaction.editReply({ content: `✅ Ticket #${ticket.id} konusu **${category.label}** olarak değiştirildi.`, components: [] });
      return;
    }

    if (action === 'actions') {
      await handleActionSelect(interaction, ticketId);
      return;
    }
    await interaction.reply({ content: '❌ Geçersiz ticket menüsü.', ephemeral: true });
  },

  async onModalSubmit(interaction, parts) {
    const [action, value] = parts;
    if (action === 'submit') {
      await handleCreateModal(interaction, value);
      return;
    }
    if (['assign_submit', 'add_member_submit', 'remove_member_submit'].includes(action)) {
      await handleUserAction(interaction, value, action);
      return;
    }
    if (action === 'close_submit') {
      await handleCloseSubmit(interaction, value);
      return;
    }
    await interaction.reply({ content: '❌ Geçersiz ticket formu.', ephemeral: true });
  },

  startMaintenance(client) {
    client.on('messageCreate', message => {
      handleTicketMessage(message).catch(error => {
        console.error('[Ticket] Mesaj durumu güncellenemedi:', error);
      });
    });

    const timer = setInterval(() => {
      runTicketReminders(client).catch(error => {
        console.error('[Ticket] Hatırlatma kontrolü başarısız:', error);
      });
    }, 60 * 60 * 1000);
    timer.unref();
  },
};
