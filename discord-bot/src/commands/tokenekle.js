// src/commands/tokenekle.js
import { encrypt } from '../utils/crypto.js';
import { saveToken } from '../utils/tokenStore.js';
import { tokenAddedEmbed, errorEmbed } from '../utils/embeds.js';

export default {
  name: 'tokenekle',
  aliases: ['settoken', 'addtoken'],
  description: 'Token ekler ve AES-256-GCM ile şifreler.',

  async execute(message, args) {
    // Komutu hemen sil (token açık kalmasın)
    await message.delete().catch(() => {});

    const rawToken = args[0];
    if (!rawToken) {
      return message.channel.send({
        embeds: [errorEmbed('Kullanım: `!tokenekle <token>` veya `!tokenekle <token> <etiket>`\n\n⚠️ Komutu DM üzerinden yazmanız önerilir!')],
      });
    }

    const label = args.slice(1).join(' ') || `Hesap`;

    // Şifrele
    const encrypted = encrypt(rawToken);
    encrypted.label = label;

    // Kaydet
    const index = saveToken(message.author.id, encrypted);

    const embed = tokenAddedEmbed(message.author, label, index);
    await message.channel.send({ embeds: [embed] });
  },
};
