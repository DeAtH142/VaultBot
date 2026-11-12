// src/commands/autoleave.js — 🌙 REXAL Auto-Leave Sistemi
// Vault'tan seçilen hesabın sunucularını listeler / toplu çıkış yapar.
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { loginVaultAccount, destroyClient, sleep } from '../utils/selfbotHelpers.js';
import { getTokens } from '../utils/tokenStore.js';
import { COLORS, THIN_DIVIDER, errorEmbed, BRAND, UX, section, bullet, statusLine } from '../utils/embeds.js';

const FOOTER = () => BRAND.footer('Exit Sweep Engine');
const LEAVE_DELAY_MS = 1000; // rate-limit için sunucular arası bekleme

export default {
  name: 'autoleave',
  aliases: ['otocik', 'cikis', 'autoleavepanel'],
  description: 'REXAL — Auto-Leave Sistemi Kontrol Paneli',

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setAuthor({ name: `${BRAND.name} • Exit Sweep Engine ${BRAND.version}` })
      .setTitle(`🌙 REXAL — Auto-Leave Sistemi`)
      .setDescription([
        UX.header,
        UX.footerLine,
        '',
        statusLine([['🟢', 'Sistem', 'Hazır'], ['🚪', 'Mod', 'Seçmeli/Tümü'], ['⏱️', 'Hız', 'Güvenli']]),
        '',
        section('Auto-Leave Nedir?'),
        `Kasadaki seçilen hesabın girdiği tüm sunucuları listeler ve toplu çıkış yapmanı sağlar. Token temizliği ve hesap güvenliği için kullanışlıdır.`,
        '',
        section('Özellikler'),
        `> ${UX.dot2} ${bullet('🛡️', 'Sunucu Listesi', 'Hesabın girdiği tüm sunucular DM\'e gönderilir')}`,
        `> ${UX.dot2} ${bullet('🛡️', 'Toplu Çıkış', 'Belirttiğin sunuculardan veya tümünden çıkar')}`,
        `> ${UX.dot2} ${bullet('🛡️', 'Güvenli Hız', 'Rate-limit yememek için sunucular arası `1sn` bekleme')}`,
      ].join('\n'))
      .setFooter(FOOTER())
      .setTimestamp();

    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('autoleave:listele').setLabel('Sunucuları Listele').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('autoleave:cikis').setLabel('Toplu Çıkış Yap').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      ),
    ];

    await message.reply({ embeds: [embed], components: rows });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const tokens = getTokens(interaction.user.id);
    if (tokens.length === 0) {
      return interaction.reply({ content: '❌ Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
    }

    const options = tokens.map((t, i) => ({
      label: t.label || `Hesap ${i + 1}`,
      description: `Durum: ${t.status || 'pasif'} — ${action === 'listele' ? 'sunucuları DM\'e gelecek' : 'çıkış yapılacak'}`,
      value: String(i),
      emoji: action === 'listele' ? '🛡️' : '🗑️',
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`autoleave:select:${action}`)
        .setPlaceholder(action === 'listele' ? 'Sunucuları listelenecek hesabı seç...' : 'Toplu çıkış yapılacak hesabı seç...')
        .addOptions(options),
    );

    return interaction.reply({
      content: action === 'listele' ? '🛡️ **Sunucuları listelenecek hesabı seç:**' : '⚠️ **Toplu çıkış yapılacak hesabı seç:**',
      components: [row],
      ephemeral: true,
    });
  },

  async onSelect(interaction, parts) {
    const action = parts[0]; // 'select' — parts[1] = listele|cikis
    const sub = parts[1];
    const tokenIndex = parseInt(interaction.values[0], 10);

    if (sub === 'listele') {
      await interaction.deferReply({ ephemeral: true });
      const login = await loginVaultAccount(interaction.user.id, tokenIndex);
      if (!login.success) {
        return interaction.editReply({ embeds: [errorEmbed(`Giriş başarısız: ${login.error}`)] });
      }

      try {
        const guilds = [...login.client.guilds.cache.values()];
        const lines = guilds.map((g, i) => `> \`${i + 1}.\` **${g.name}** — ID: \`${g.id}\``);

        const chunks = [];
        for (let i = 0; i < lines.length; i += 40) chunks.push(lines.slice(i, i + 40));

        const dmEmbeds = chunks.map((chunk, page) => new EmbedBuilder()
          .setTitle(`🛡️ Sunucu Listesi ${chunks.length > 1 ? `(${page + 1}/${chunks.length})` : ''}`)
          .setColor(COLORS.info)
          .setDescription(chunk.join('\n') || '> ℹ️ Hesap hiçbir sunucuda değil.')
          .setFooter(FOOTER())
          .setTimestamp());

        await interaction.user.send({ embeds: dmEmbeds }).catch(() => {
          throw new Error('DM gönderilemedi — DM\'leriniz kapalı olabilir, açıp tekrar deneyin.');
        });

        return interaction.editReply({
          content: `✅ **${login.username}** — \`${guilds.length}\` sunucu DM kutunuza gönderildi.`,
        });
      } catch (err) {
        return interaction.editReply({ embeds: [errorEmbed(err.message)] });
      } finally {
        destroyClient(login.client);
      }
    }

    if (sub === 'cikis') {
      // ⚠️ Tehlikeli işlem — miktar sor, sonra onay
      const modal = new ModalBuilder()
        .setCustomId(`autoleave:modal:${tokenIndex}`)
        .setTitle('Toplu Çıkış — Onay');

      const scopeInput = new TextInputBuilder()
        .setCustomId('scope')
        .setLabel('Kapsam ("tumu" veya sunucu ID listesi)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('"tumu" yazarsan TÜM sunuculardan çıkar.\nYa da virgülle ID: 1234..., 5678...')
        .setValue('tumu')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(scopeInput));
      return interaction.showModal(modal);
    }
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'modal') return;
    const tokenIndex = parseInt(parts[1], 10);
    const scope = interaction.fields.getTextInputValue('scope').trim();

    await interaction.deferReply({ ephemeral: true });

    const login = await loginVaultAccount(interaction.user.id, tokenIndex);
    if (!login.success) {
      return interaction.editReply({ embeds: [errorEmbed(`Giriş başarısız: ${login.error}`)] });
    }

    try {
      const guilds = [...login.client.guilds.cache.values()];
      let targets;
      if (scope.toLowerCase() === 'tumu') {
        targets = guilds;
      } else {
        const ids = scope.split(/[, ]+/).filter(Boolean);
        targets = guilds.filter(g => ids.includes(g.id));
        if (targets.length === 0) {
          throw new Error('Belirtilen ID\'lere ait sunucu bu hesapta bulunamadı.');
        }
      }

      let left = 0;
      for (const g of targets) {
        await g.leave().catch(() => { });
        left++;
        await sleep(LEAVE_DELAY_MS); // 🛡️ güvenli hız
      }

      const embed = new EmbedBuilder()
        .setTitle(`🌙 Auto-Leave Raporu`)
        .setColor(colorForLeave(left))
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 👤 **Hesap:** \`${login.username}\``,
          `> 🚪 **Çıkılan sunucu:** \`${left}/${targets.length}\``,
          `> ⏱️ **Gecikme:** \`1sn\` / sunucu (rate-limit koruması)`,
          `\`${THIN_DIVIDER}\``,
        ].join('\n'))
        .setFooter(FOOTER())
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed(err.message)] });
    } finally {
      destroyClient(login.client);
    }
  },
};

function colorForLeave(n) {
  return n > 0 ? COLORS.danger : COLORS.info;
}
