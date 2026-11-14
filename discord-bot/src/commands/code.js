// src/commands/code.js
import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { setUserSubscription } from '../utils/tokenStore.js';
import { parseDuration } from '../utils/timeParser.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

const AUTHORIZED_ADMINS = ['1160564359727173792'];
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
  description: 'Kod oluştur veya kodu kullan',

  async execute(message, args) {
    // Kod Kullanma (Herkes)
    const code = args[0] ? args[0].toUpperCase() : null;
    const codes = loadCodes();

    if (code && codes[code]) {
      const codeData = codes[code];
      
      // Süre kontrolü
      if (codeData.expiresAt !== 'infinite' && new Date() > new Date(codeData.expiresAt)) {
        delete codes[code]; saveCodes(codes);
        return message.reply('❌ Bu kodun süresi dolmuş!');
      }

      // Limit kontrolü
      if (codeData.limit <= 0) {
        return message.reply('❌ Bu kodun kullanım limiti dolmuş!');
      }

      const member = await message.guild.members.fetch(message.author.id);
      const role = message.guild.roles.cache.get(codeData.roleId);
      
      if (!role) return message.reply('❌ Rol bulunamadı, yöneticiye bildirin.');
      if (member.roles.cache.has(role.id)) return message.reply('⚠️ Bu role zaten sahipsin!');

      await member.roles.add(role.id);
      
      // Limiti düşür ve kaydet
      codeData.limit -= 1;
      saveCodes(codes);

      // Abonelik kaydı
      setUserSubscription(message.author.id, {
        type: role.name, expiresAt: codeData.expiresAt, capacity: 4, roleId: role.id, guildId: message.guild.id
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('🎁 Kod Kullanıldı!')
        .setDescription(`Tebrikler! **${role.name}** rolünü kazandın.\nKalan Hak: \`${codeData.limit}\``);
      await message.reply({ embeds: [embed] });
      return;
    }

    // Kod Oluşturma (Admin)
    if (args[0] === 'olustur') {
      if (!AUTHORIZED_ADMINS.includes(message.author.id)) return message.reply('❌ Yetkin yok!');

      // Kullanım: !code olustur @Rol <süre> <limit> [özel_kod_veya_random]
      const roleMention = message.mentions.roles.first();
      const durationArg = args[2]; // örn: 3gün20:00 veya 1hafta
      const limitArg = parseInt(args[3]); // örn: 2
      const customCode = args[4] ? args[4].toUpperCase() : generateRandomCode();

      if (!roleMention || !durationArg || isNaN(limitArg)) {
        return message.reply('❌ Kullanım: `!code olustur @Rol <süre> <limit> [özel_kod]`\nÖrnek: `!code olustur @Altın 1hafta 2`');
      }

      try {
        const expiresAt = parseDuration(durationArg);
        
        codes[customCode] = {
          roleId: roleMention.id,
          expiresAt: expiresAt,
          limit: limitArg
        };
        saveCodes(codes);

        const embed = new EmbedBuilder()
          .setColor(COLORS.gold)
          .setTitle('✅ Kod Başarıyla Oluşturuldu!')
          .setDescription(`> 🎭 **Rol:** ${roleMention}\n> ⏳ **Süre:** ${durationArg}\n> 👥 **Limit:** ${limitArg} Kişi\n\n**Kod:** \`${customCode}\``);
        
        await message.reply({ embeds: [embed] });
      } catch (err) {
        await message.reply(`❌ Hata: ${err.message}`);
      }
    }
  }
};
