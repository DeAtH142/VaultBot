// src/commands/code.js
import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle 
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { setUserSubscription } from '../utils/tokenStore.js';
import { parseDuration } from '../utils/timeParser.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

const AUTHORIZED_ADMINS = ['SENIN_DISCORD_ID_BURAYA']; // KENDİ ID'ni yaz!
const codesFilePath = path.join(process.cwd(), 'data', 'codes.json');

// JSON Veritabanı İşlemleri
function loadCodes() {
  if (!fs.existsSync(codesFilePath)) return {};
  return JSON.parse(fs.readFileSync(codesFilePath, 'utf8'));
}
function saveCodes(codes) {
  fs.writeFileSync(codesFilePath, JSON.stringify(codes, null, 2));
}

// RX-1M-9A4F-7C2E-8B1D Formatında Kod Üret
function generateRandomCode() {
  const hex = () => Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, '0');
  return `RX-${hex()}-${hex()}-${hex()}-${hex()}`;
}

export default {
  name: 'code',
  description: 'Kod oluşturma paneli veya kod kullanma',

  async execute(message, args) {
    // ── KOD KULLANMA (Kullanıcılar) ──
    const code = args[0] ? args[0].toUpperCase() : null;
    if (code && code.startsWith('RX-')) {
      const codes = loadCodes();
      if (!codes[code]) return message.reply('❌ Geçersiz veya kullanılmış bir kod!');

      const codeData = codes[code];
      
      if (codeData.expiresAt !== 'infinite' && new Date() > new Date(codeData.expiresAt)) {
        delete codes[code]; saveCodes(codes);
        return message.reply('❌ Bu kodun süresi dolmuş!');
      }

      if (codeData.limit <= 0) {
        return message.reply('❌ Bu kodun kullanım limiti dolmuş! (İlk yazanlar aldı)');
      }

      const member = await message.guild.members.fetch(message.author.id);
      const role = message.guild.roles.cache.get(codeData.roleId);
      
      if (!role) return message.reply('❌ Rol bulunamadı, yöneticiye bildirin.');
      if (member.roles.cache.has(role.id)) return message.reply('⚠️ Bu role zaten sahipsin!');

      // Rolü ver, limiti düşür
      await member.roles.add(role.id);
      codeData.limit -= 1;
      saveCodes(codes);

      setUserSubscription(message.author.id, {
        type: role.name, 
        expiresAt: codeData.expiresAt, 
        capacity: 4, 
        roleId: role.id, 
        guildId: message.guild.id
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('🎁 Kod Başarıyla Kullanıldı!')
        .setDescription(`Tebrikler! **${role.name}** rolünü kazandın.\n> Kalan Hak: \`${codeData.limit}\``);
      await message.reply({ embeds: [embed] });
      return;
    }

    // ── KOD OLUŞTURMA PANELİ (Adminler) ──
    if (!AUTHORIZED_ADMINS.includes(message.author.id)) {
      return message.reply({ content: '❌ Bu komutu kullanma yetkiniz yok kral!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setTitle(`${E.crown} REXAL — Kod Dağıtım Paneli`)
      .setDescription([
        `${THIN_DIVIDER}`,
        `> ${E.gear} **Yönetici:** <@${message.author.id}>`,
        '',
        `${E.info} **NASIL KOD OLUŞTURULUR?**`,
        '> 1️⃣ Aşağıdaki menüden rol seç',
        '> 2️⃣ Açılan forma süreyi yaz (örn: `3 gün 20:00`)',
        '> 3️⃣ Kaç kişinin kazanacağını yaz (örn: `2`)',
        '> 4️⃣ İstersen özel kod yaz, boş bırakırsan rastgele üretilir',
        `${THIN_DIVIDER}`,
      ].join('\n'))
      .setFooter(BRAND.footer('Code System'));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('code:selectrole')
        .setPlaceholder('🎭 Kod dağıtılacak rolü seçin...')
        .addOptions(
          message.guild.roles.cache
            .filter(r => r.id !== message.guild.id && !r.managed)
            .map(r => ({ label: r.name, value: r.id, emoji: '🎁' }))
            .slice(0, 25)
        )
    );

    await message.reply({ embeds: [embed], components: [row] });
  },

  async onSelect(interaction, actionParts) {
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Yetkiniz yok!', ephemeral: true });
    }

    if (actionParts[0] === 'selectrole') {
      const roleId = interaction.values[0];
      const role = interaction.guild.roles.cache.get(roleId);

      const modal = new ModalBuilder()
        .setCustomId(`code:create:${roleId}`)
        .setTitle(`${role.name} - Kod Ayarları`);

      const durationInput = new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('Süre (örn: 3 gün 20:00, 1 hafta)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('3 gün 20:00')
        .setRequired(true);

      const limitInput = new TextInputBuilder()
        .setCustomId('limit')
        .setLabel('Kaç kişi kazanabilsin? (örn: 5)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('1')
        .setRequired(true);

      const customCodeInput = new TextInputBuilder()
        .setCustomId('customcode')
        .setLabel('Özel Kod (Boş bırakırsan rastgele üretir)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('RX-OZEL-KODUM (opsiyonel)')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(durationInput),
        new ActionRowBuilder().addComponents(limitInput),
        new ActionRowBuilder().addComponents(customCodeInput)
      );

      await interaction.showModal(modal);
    }
  },

  async onModalSubmit(interaction, actionParts) {
    const roleId = actionParts[1];
    const durationText = interaction.fields.getTextInputValue('duration');
    const limit = parseInt(interaction.fields.getTextInputValue('limit'));
    let customCode = interaction.fields.getTextInputValue('customcode').trim().toUpperCase();

    await interaction.reply({ content: '⏳ Kod oluşturuluyor...', ephemeral: true });

    try {
      const expiresAt = parseDuration(durationText);
      const role = interaction.guild.roles.cache.get(roleId);
      
      if (!role) throw new Error('Rol bulunamadı (Silinmiş olabilir).');
      if (isNaN(limit) || limit <= 0) throw new Error('Limit geçerli bir sayı olmalı!');

      const finalCode = customCode ? customCode : generateRandomCode();
      const codes = loadCodes();

      if (codes[finalCode]) throw new Error('Bu kod zaten kullanımda! Lütfen başka bir kod yazın.');

      codes[finalCode] = {
        roleId: roleId,
        expiresAt: expiresAt,
        limit: limit
      };
      saveCodes(codes);

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('✅ Kod Başarıyla Oluşturuldu!')
        .setDescription([
          `${THIN_DIVIDER}`,
          `> 🎭 **Rol:** ${role}`,
          `> ⏳ **Süre:** \`${durationText}\``,
          `> 👥 **Kazanan Sayısı:** \`${limit} Kişi\``,
          `> 🔑 **Kod:** \`${finalCode}\``,
          '',
          `*Kullanıcılar kodu belirlenen kanala yazarak ilk alan kapar mantığıyla kazanabilir.*`
        ].join('\n'))
        .setFooter(BRAND.footer('Code System'));
      
      await interaction.editReply({ content: null, embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ content: `❌ Hata: ${err.message}` });
    }
  }
};
