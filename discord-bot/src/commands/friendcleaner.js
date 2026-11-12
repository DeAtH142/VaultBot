// src/commands/friendcleaner.js — ⚡ Arkadaş Listesi Temizleyici
// Kasadaki TÜM geçerli hesapların arkadaş listesini temizler (exclude listesi ile).
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { loginVaultAccount, destroyClient, sleep, buildReportLines } from '../utils/selfbotHelpers.js';
import { getTokens } from '../utils/tokenStore.js';
import { COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('Purge Protocol Engine');
const DELETE_DELAY_MS = 1500; // her silme arası rate-limit koruması

async function runFriendCleanup(ownerId, excludeIds) {
  const tokens = getTokens(ownerId);
  const valid = tokens.map((t, i) => ({ t, i })).filter(({ t }) => t.status !== 'gecersiz');
  const exclude = new Set(excludeIds);
  const reports = [];

  for (let a = 0; a < valid.length; a++) {
    const idx = valid[a].i;
    if (a > 0) await sleep(2000); // hesaplar arası gecikme

    const login = await loginVaultAccount(ownerId, idx);
    if (!login.success) {
      reports.push({ tokenIndex: idx, ok: false, error: login.error });
      continue;
    }

    let removed = 0, protectedCount = 0, errors = 0;
    try {
      // Arkadaş listesini al (REST: /users/@me/relationships)
      const relationships = await login.client.rest
        .get('/users/@me/relationships')
        .catch(() => null);

      if (!Array.isArray(relationships)) throw new Error('Arkadaş listesi alınamadı');

      const friends = relationships.filter(r => r.type === 1); // 1 = friend
      const toRemove = friends.filter(f => !exclude.has(f.user.id));

      for (const f of toRemove) {
        try {
          await login.client.rest.delete(`/users/@me/relationships/${f.user.id}`);
          removed++;
        } catch {
          errors++;
        }
        await sleep(DELETE_DELAY_MS); // 🛡️ rate-limit koruması
      }
      protectedCount = friends.length - toRemove.length;

      reports.push({
        tokenIndex: idx, username: login.username, ok: true,
        summary: `\`${removed}\` silindi • \`${protectedCount}\` korundu${errors ? ` • \`${errors}\` hata` : ''}`,
        removed,
      });
    } catch (err) {
      reports.push({ tokenIndex: idx, username: login.username, ok: true, error: err.message });
    } finally {
      destroyClient(login.client);
    }
  }
  return reports;
}

export default {
  name: 'friendcleaner',
  aliases: ['arkadastemizle', 'fwcleaner', 'fw-temizle'],
  description: 'REXAL — Arkadaş Listesi Temizleyici Kontrol Paneli',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.danger)
      .setAuthor({ name: `${BRAND.name} • Purge Protocol ${BRAND.version}` })
      .setTitle(`⚡ REXAL — Arkadaş Listesi Temizleyici`)
      .setDescription([
        UX.header,
        UX.footerLine,
        '',
        statusLine([['⚡', 'Sistem', 'Hazır'], ['🎯', 'Hedef', 'Tüm Geçerli'], ['🛡️', 'Koruma', 'Exclude Listesi']]),
        '',
        section('Nasıl Çalışır?'),
        `> ${UX.dot2} ${bullet('💙', 'Kasa Entegrasyonu', '**Tüm geçerli hesaplara** uygulanır')}`,
        `> ${UX.dot2} ${bullet('💙', 'Hariç Tutma', 'Butona basınca **korunacak ID listesini** sorar')}`,
        `> ${UX.dot2} ${bullet('💙', 'Boş Liste', 'Boş bırakırsan **tüm** arkadaşlar silinir')}`,
        `> ${UX.dot2} ${bullet('💙', 'Rapor', 'İşlem bitince **hesap başı** rapor gelir')}`,
        '',
        section('Kontrol Paneli'),
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('friendcleaner:baslat').setLabel('Arkadaş Listesini Temizle').setEmoji('🔴').setStyle(ButtonStyle.Danger),
      ),
    ];

    await message.reply({ embeds: [embed], components: rows });
  },

  async onButton(interaction) {
    if (getTokens(interaction.user.id).length === 0) {
      return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId('friendcleaner:modal')
      .setTitle('Arkadaş Temizleyici — Hariç Tutma Listesi');

    const excludeInput = new TextInputBuilder()
      .setCustomId('exclude_ids')
      .setLabel('Hariç tutulacak ID (boş=tümü silinir)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('123456789012345678, 987654321098765432\nBOŞ bırakırsan TÜM arkadaşlar silinir!')
      .setRequired(false);

    const confirmInput = new TextInputBuilder()
      .setCustomId('confirm')
      .setLabel('ONAY — Başlatmak için EVET yazın')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('EVET')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(excludeInput),
      new ActionRowBuilder().addComponents(confirmInput),
    );

    return interaction.showModal(modal);
  },

  async onModalSubmit(interaction) {
    const excludeRaw = interaction.fields.getTextInputValue('exclude_ids').trim();
    const confirm = interaction.fields.getTextInputValue('confirm').trim().toUpperCase();

    if (confirm !== 'EVET') {
      return interaction.reply({ content: '❌ Onay verilmediği için işlem iptal edildi.', ephemeral: true });
    }

    const excludeIds = excludeRaw ? excludeRaw.split(/[\s,]+/).filter(/^\d+$/.test.bind(/^\d+$/)) : [];

    await interaction.deferReply({ ephemeral: true });

    try {
      const reports = await runFriendCleanup(interaction.user.id, excludeIds);
      const totalRemoved = reports.reduce((s, r) => s + (r.removed || 0), 0);

      const embed = new EmbedBuilder()
        .setTitle(`⚡ Arkadaş Temizleyici Raporu`)
        .setColor(COLORS.info)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 👥 **İşlenen Hesap:** \`${reports.length}\`  🗑️ **Toplam Silinen:** \`${totalRemoved}\``,
          `> 🛡️ **Korunan ID Sayısı:** \`${excludeIds.length}\``,
          ``,
          buildReportLines(reports),
          `\`${THIN_DIVIDER}\``,
        ].join('\n'))
        .setFooter(FOOTER())
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(err.message)] });
    }
  },
};
