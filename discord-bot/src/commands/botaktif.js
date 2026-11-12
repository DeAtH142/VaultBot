// src/commands/botaktif.js — 🤖 REXAL Discord Bot Aktif Tutucu Paneli
// Fotoğraftaki panelin bot entegrasyonu:
//  - Bot Ekle & Aktif Tut: KENDİ bot tokenin ile botu 7/24 aktif tut
//  - Durum Güncelle: online/idle/dnd/görünmez + aktivite (Oynuyor/Yayında/Dinliyor/İzliyor/Yarışıyor)
//  - Aktif Botlarım: sistemdeki botlarını durumlarıyla listeler
//  - Botu Kapat / Sil: botun aktivitesini durdurur ve sistemden siler
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} from 'discord.js';
import {
  addBot, listBots, stopBotById, countBots, ACTIVITY_TYPES,
} from '../utils/botKeeperRunner.js';
import { COLORS, errorEmbed, BRAND, UX, section, bullet, statusLine, THIN_DIVIDER } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('REXAL Bot Keeper');

// userId -> { botKey, action }
const pendingUpdate = new Map();

const STATUS_ROWS = [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('botaktif:durum:online').setLabel('Online').setEmoji('🟢').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('botaktif:durum:idle').setLabel('Boşta').setEmoji('🌙').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('botaktif:durum:dnd').setLabel('DND').setEmoji('🔴').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('botaktif:durum:gorunmez').setLabel('Görünmez').setEmoji('👻').setStyle(ButtonStyle.Secondary),
  ),
];

const ACTIVITY_ROW = () => [
  new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('botaktif:aktivite')
      .setPlaceholder('🎮 Aktivite türünü seç...')
      .addOptions(ACTIVITY_TYPES.map(a => ({ label: a.label, value: a.value, emoji: a.label.split(' ')[0] }))),
  ),
];

function buildPanel(userId) {
  const bots = listBots(userId);
  const aktifList = bots.length
    ? bots.map(b =>
      `> ${b.ready ? '🤖' : '⭕'} **${b.botTag}** — ${statusIcon(b.status)} \`${b.status}\` • ${actText(b)} • \`${b.minutes} dk\``
    ).join('\n')
    : '> ⚫ *Sisteme eklenmiş bot yok — "Bot Ekle & Aktif Tut" ile başla!*';

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: `${BRAND.name} • REXAL Bot Aktif Tutucu ${BRAND.version}` })
    .setTitle('🤖 REXAL — Discord Bot Aktif Tutucu')
    .setDescription([
      UX.header,
      `> 🔑 **Bot Ekle & Aktif Tut:** Discord **Bot Tokenini** girerek botunu **7/24 kesintisiz aktif** tutar.`,
      `> 🔄 **Durum Güncelle:** Botunun görünüm durumunu (Online, Idle, DND, Görünmez) ve`,
      `> aktivite türünü (Oynuyor, Yayında, Dinliyor, İzliyor, Yarışıyor) değiştirir.`,
      `> 📋 **Aktif Botlarım:** Sisteme eklediğin size ait botların durumunu ve canlılık bilgisini listeler.`,
      `> 🗑️ **Botu Kapat / Sil:** Eklediğin botun aktivliğini durdurup sistemden siler.`,
      '',
      section('Aktif Botlarım'),
      aktifList,
      '',
      `📈 **Sistemde:** \`${countBots(userId)}\` bot aktif tutuluyor`,
      '♻️ Reboot Recovery: bot yeniden başlasa bile tüm botlar geri bağlanır',
      '💓 Keep-Alive: 6 dk\'da bir durum tazelenir, bağlantı koparsa otomatik yeniden bağlanır',
    ].join('\n'))
    .setFooter(FOOTER())
    .setTimestamp();
}

function statusIcon(s) {
  return { online: '🟢', idle: '🌙', dnd: '🔴', invisible: '👻' }[s] || '⚪';
}
function actText(b) {
  const emoji = { OYUYOR: '🎮', YAYINDA: '📡', DINLIYOR: '🎧', IZLIYOR: '👁️', YARISIYOR: '🏁' }[b.activityType] || '🎮';
  return b.activityText ? `${emoji} \`${b.activityText}\`` : `${emoji} \`${b.activityType}\``;
}

export default {
  name: 'botaktif',
  aliases: ['botaktiftut', 'botkeeper', 'aktiftut'],
  description: 'REXAL 🤖 REXAL Discord Bot Aktif Tutucu Paneli',

  async execute(message) {
    await message.reply({
      embeds: [buildPanel(message.author.id)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('botaktif:ekle').setLabel('Bot Ekle & Aktif Tut').setEmoji('🤖').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('botaktif:guncelle').setLabel('Durum Güncelle').setEmoji('🔄').setStyle(ButtonStyle.Primary),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('botaktif:listele').setLabel('Aktif Botlarım').setEmoji('📋').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('botaktif:sil').setLabel('Botu Kapat / Sil').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('botaktif:yardim').setLabel('Yardım / SSS').setEmoji('❓').setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;
    const bots = listBots(userId);

    if (action === 'yardim') {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('❓ Bot Aktif Tutucu — Yardım & SSS')
          .setColor(COLORS.info)
          .setDescription([
            `\`${THIN_DIVIDER}\``,
            section('Bot tokeni nasıl alınır?'),
            '> 1️⃣ [Discord Developer Portal](https://discord.com/developers/applications) → New Application',
            '> 2️⃣ Bot sekmesi → Add Bot → Reset Token → Copy',
            '> 3️⃣ Tokeni "Bot Ekle & Aktif Tut" modalına yapıştır',
            '',
            section('"Used-disallowed-intents" hatası'),
            '> Bot sekmesinden **Presence Intent** ve **Message Content Intent**',
            '> ayarlarını açman gerekmez — bu modül sadece hazır kalır. Ama',
            '> privileged intentler kapalıysa ve hata devam ederse portalde aç.',
            '',
            section('"An invalid token was provided" hatası'),
            '> Token yanlış/yenilenmiş. Portalden Reset Token yapıp yeniden ekle.',
            '',
            section('Durum güncelleme nasıl çalışır?'),
            '> "Durum Güncelle" → botunu seç → önce durum (Online/Idle/DND/Görünmez),',
            '> sonra aktivite türü ve metnini seç. Anında yansır.',
            '',
            section('Bot profili neden bot gibi görünsün istiyorum?'),
            '> Bu modül botunu FİZİKSEL olarak Discord\'a bağlar — bot gerçekten çevrimiçi.',
            '> Bot taklit değildir, gerçek bot hesabıdır. Buyüzden botunu davet ettiğin',
            '> sunucular fark etmez; her yerde çevrimiçi görünür.',
            '',
            section('Bot sunucularına girmez mi?'),
            '> Girmez. Bot sadece bağlanır ve durum taşır — sunuculara katılmaz,',
            '> mesaj atmaz, hiçbir işlem yapmaz. Saf "aktif tutma".',
            '',
            section('7/24 aktif mi kalır?'),
            '> Bot paneli açık olduğu sürece evet. Senin bilgisayarın kapandığında',
            '> bot de bağlantısı kesilir — sunucuda barındırmak istersen botu VPS\'te çalıştır.',
          ].join('\n'))
          .setFooter(FOOTER()).setTimestamp()],
        ephemeral: true,
      });
    }

    // ── Bot Ekle ──
    if (action === 'ekle') {
      const modal = new ModalBuilder().setCustomId('botaktif:ekle_modal').setTitle('🤖 Bot Ekle & Aktif Tut');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('bot_token').setLabel('Bot Tokeni')
          .setPlaceholder('MTIxxx... (Developer Portal → Bot → Reset Token)').setStyle(TextInputStyle.Short).setRequired(true),
      ));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('status').setLabel('Durum (online/idle/dnd/gorunmez)')
          .setPlaceholder('online').setStyle(TextInputStyle.Short).setRequired(false),
      ));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('aktivite_tip').setLabel('Aktivite türü (OYUYOR/DINLIYOR/IZLIYOR...)')
          .setPlaceholder('OYUYOR — boş bırakırsan aktivite eklenmez').setStyle(TextInputStyle.Short).setRequired(false),
      ));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('aktivite_metin').setLabel('Aktivite metni')
          .setPlaceholder('örn: Rise of Kingdoms — boş = aktivite yok').setStyle(TextInputStyle.Short).setRequired(false),
      ));
      return interaction.showModal(modal);
    }

    // ── Durum Güncelle ──
    if (action === 'guncelle') {
      if (bots.length === 0) return interaction.reply({ content: '⚠️ Sisteminde aktif bot yok — önce **Bot Ekle & Aktif Tut**.', ephemeral: true });
      if (bots.length === 1) {
        pendingUpdate.set(userId, { botKey: bots[0].key });
        return interaction.reply({ content: `**🔄 ${bots[0].botTag} için yeni durumu seç:**`, components: STATUS_ROWS, ephemeral: true });
      }
      const options = bots.map(b => ({
        label: b.botTag.slice(0, 100),
        description: `${b.status} • ${b.activityType}`,
        value: b.key, emoji: statusIcon(b.status),
      }));
      return interaction.reply({
        content: '**🔄 Hangi botun durumunu güncelleyelim?**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('botaktif:guncelle_sec')
            .setPlaceholder('🤖 Bot seç...').addOptions(options),
        )], ephemeral: true,
      });
    }

    // ── Durum butonları (online/idle/dnd/gorunmez) ──
    if (action === 'durum') {
      const flow = pendingUpdate.get(userId);
      if (!flow?.botKey) return interaction.reply({ content: '⌛ Oturum kayboldu — "Durum Güncelle"ye tekrar bas.', ephemeral: true });
      flow.status = parts[1];
      return interaction.update({
        content: `**✅ Durum: \`${parts[1]}\` seçildi — şimdi aktivite türü seç:**`,
        components: [...STATUS_ROWS, ...ACTIVITY_ROW()],
      });
    }

    // ── Aktivite seçimi (select menu) ──
    // onSelect'te işlenir

    // ── Aktif Botlarım ──
    if (action === 'listele') {
      if (bots.length === 0) return interaction.reply({ content: '⚫ Sisteminde aktif bot yok.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle('📋 Aktif Botlarım')
        .setColor(0x5865f2)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          ...bots.map(b => [
            `> ${b.ready ? '🤖' : '⭕'} **${b.botTag}**`,
            `> ↳ ${statusIcon(b.status)} Durum: \`${b.status}\` • ${actText(b)}`,
            `> ↳ ⏱️ \`${b.minutes}\` dakikadır aktif  •  Bağlantı: \`${b.ready ? 'Sağlıklı ✅' : 'Yeniden bağlanıyor ⚠️'}\``,
            '',
          ].join('\n')),
          `\`${THIN_DIVIDER}\``,
          `> ♻️ Tüm botlar Reboot Recovery korumasında.`,
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── Botu Kapat / Sil ──
    if (action === 'sil') {
      if (bots.length === 0) return interaction.reply({ content: '⚫ Sisteminde aktif bot yok.', ephemeral: true });
      if (bots.length === 1) {
        const r = stopBotById(bots[0].key);
        return interaction.reply({ content: `🗑️ **${bots[0].botTag}** sistemden silindi ve kapatıldı.`, ephemeral: true });
      }
      const options = bots.map(b => ({
        label: b.botTag.slice(0, 100),
        value: b.key, emoji: '🗑️',
      }));
      return interaction.reply({
        content: '**🗑️ Hangi botu kapatalım?**',
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('botaktif:sil_sec')
            .setPlaceholder('🗑️ Bot seç...').addOptions(options),
        )], ephemeral: true,
      });
    }
  },

  async onSelect(interaction, parts) {
    const userId = interaction.user.id;

    // Durum güncelleme: bot seç
    if (parts[0] === 'guncelle_sec') {
      const key = interaction.values[0];
      pendingUpdate.set(userId, { botKey: key });
      return interaction.update({
        content: `**🔄 Yeni durumu seç:**`,
        components: STATUS_ROWS,
      });
    }

    // Aktivite türü seçimi
    if (parts[0] === 'aktivite') {
      const flow = pendingUpdate.get(userId);
      if (!flow?.botKey) return interaction.update({ content: '⌛ Oturum kayboldu.', components: [] });
      flow.activityType = interaction.values[0];

      // Metin modalı
      const modal = new ModalBuilder().setCustomId(`botaktif:metin_modal:${flow.botKey}:${flow.activityType}`).setTitle('✨ Aktivite Metni');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('aktivite_metin').setLabel('Aktivite metni')
          .setPlaceholder('örn: Rise of Kingdoms — boş = sadece tür').setStyle(TextInputStyle.Short).setRequired(false)
          .setMaxLength(100),
      ));
      return interaction.showModal(modal);
    }

    // Bot silme seçimi
    if (parts[0] === 'sil_sec') {
      const r = stopBotById(interaction.values[0]);
      return interaction.update({
        content: r.ok ? '🗑️ **Bot sistemden silindi ve kapatıldı.**' : '❌ Bot bulunamadı.',
        components: [],
      });
    }
  },

  async onModalSubmit(interaction, parts) {
    const userId = interaction.user.id;

    // ── Bot Ekle modalı ──
    if (parts[0] === 'ekle_modal') {
      const botToken = interaction.fields.getTextInputValue('bot_token').trim();
      const status = interaction.fields.getTextInputValue('status').trim() || 'online';
      const activityType = (interaction.fields.getTextInputValue('aktivite_tip').trim() || 'OYUYOR').toUpperCase();
      const activityText = interaction.fields.getTextInputValue('aktivite_metin').trim();

      await interaction.deferReply({ ephemeral: true });
      const res = await addBot(userId, botToken, { status, activityType, activityText });
      if (!res.ok) {
        return interaction.editReply({ embeds: [errorEmbed(`Bot eklenemedi:\n\`${res.error}\`\n\n**Kontrol listesi:**\n> • Token Developer Portal'dan kopyalanmış mı? (Reset Token sonrası)\n> • Bot hesabı mı, kullanıcı tokeni değil mi? (kullanıcı tokeni ÇALIŞMAZ)\n> • İnternet bağlantın stabil mi?`)] });
      }

      const embed = new EmbedBuilder()
        .setTitle('🤖 Bot Aktif Tutuluyor!')
        .setColor(COLORS.success)
        .setThumbnail(res.avatar)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 🤖 **Bot:** \`${res.botTag}\``,
          `> ${statusIcon(res.status)} **Durum:** \`${res.status}\``,
          activityText ? `> ${actText({ activityType: res.activityType, activityText })}` : null,
          '',
          `> ♻️ **Reboot Recovery:** \`Aktif\`  •  💓 **Keep-Alive:** \`6dk\`  •  🔁 **Auto-Reconnect:** \`Aktif\``,
          `> 📊 Sistemdeki toplam bot: \`${countBots(userId)}\``,
          `\`${THIN_DIVIDER}\``,
        ].filter(Boolean).join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // ── Aktivite metni modalı ──
    if (parts[0] === 'metin_modal') {
      const [, , botKey, activityType] = parts;
      const flow = pendingUpdate.get(userId);
      const activityText = interaction.fields.getTextInputValue('aktivite_metin').trim();

      const bots = listBots(userId);
      const target = bots.find(b => b.key === botKey);
      if (!target) return interaction.reply({ content: '❌ Bot bulunamadı.', ephemeral: true });

      await interaction.deferUpdate();
      // Botu aynı ayarlarla yeniden ekleyerek presence güncelle
      const { getSession } = await import('../utils/sessionStore.js');
      const saved = getSession('botkeeper', userId, target.botId);
      const token = saved ? Buffer.from(saved.botTokenEncrypted, 'base64').toString('utf8') : null;
      if (!token) return interaction.followUp({ content: '❌ Bot tokeni kayıtlı değil — botu silip yeniden ekle.', ephemeral: true });

      stopBotById(botKey, { silent: true });
      const res = await addBot(userId, token, {
        status: flow?.status || target.status,
        activityType,
        activityText,
      });
      if (!res.ok) return interaction.followUp({ embeds: [errorEmbed(`Güncellenemedi: \`${res.error}\``)], ephemeral: true });

      return interaction.followUp({
        embeds: [new EmbedBuilder()
          .setTitle('🔄 Durum Güncellendi!')
          .setColor(COLORS.success)
          .setDescription([
            `> 🤖 **Bot:** \`${res.botTag}\``,
            `> ${statusIcon(res.status)} **Durum:** \`${res.status}\``,
            activityText ? `> ✨ **Aktivite:** ${actText({ activityType, activityText })}` : `> ✨ **Aktivite türü:** \`${activityType}\``,
            '',
            `*Değişiklik 5-10 sn içinde profilde belirir.*`,
          ].join('\n'))
          .setFooter(FOOTER()).setTimestamp()],
        ephemeral: true,
      });
    }
  },
};
