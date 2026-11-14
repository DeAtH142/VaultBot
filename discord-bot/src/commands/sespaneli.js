// src/commands/sespaneli.js
import { 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';
import archiver from 'archiver';
import fetch from 'node-fetch';
import { Client as SelfClient } from 'discord.js-selfbot-v13';
import { decrypt } from '../utils/crypto.js';
import { COLORS, BRAND, E, THIN_DIVIDER } from '../utils/embeds.js';

const AUTHORIZED_ADMINS = ['1160564359727173792']; // Kendi ID'ni yaz kral!

export default {
  name: 'sespaneli',
  description: 'Sunucudaki ses panosu seslerini çek, ZIP yap veya başka sunucuya yükle',
  aliases: ['sesler', 'soundboard'],

  async execute(message) {
    if (!AUTHORIZED_ADMINS.includes(message.author.id)) {
      return message.reply({ content: '❌ Bu komutu kullanma yetkiniz yok!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`${E.music} REXAL — Ses Paneli Sistemi`)
      .setDescription([
        `${THIN_DIVIDER}`,
        `> ${E.gear} **Yönetici:** <@${message.author.id}>`,
        '',
        `${E.info} **NE YAPABİLİRSİN?**`,
        '> 1️⃣ Sunucudaki tüm ses panosu seslerini listele',
        '> 2️⃣ Seçtiğin sesleri ZIP dosyası olarak indir',
        '> 3️⃣ Selfbot ile başka bir sunucuya yükle',
        '',
        `${E.warning} **DİKKAT**`,
        '> Ses dosyaları MP3/OGG, max 512KB ve 5.2 saniye olmalıdır.',
        `${THIN_DIVIDER}`,
      ].join('\n'))
      .setFooter(BRAND.footer('Soundboard System'));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('sespaneli:selectguild')
        .setPlaceholder('🌐 İşlem yapmak istediğin sunucuyu seç...')
        .addOptions(
          message.client.guilds.cache.map(g => ({
            label: g.name,
            value: g.id,
            description: `ID: ${g.id}`,
          })).slice(0, 25)
        )
    );

    await message.reply({ embeds: [embed], components: [row] });
  },

  async onSelect(interaction, actionParts) {
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Yetkiniz yok!', ephemeral: true });
    }

    const action = actionParts[0];

    if (action === 'selectguild') {
      const guildId = interaction.values[0];
      const guild = interaction.client.guilds.cache.get(guildId);
      
      if (!guild) {
        return interaction.reply({ content: '❌ Sunucu bulunamadı!', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const sounds = await guild.soundboardSounds.fetch();
        
        if (sounds.size === 0) {
          return interaction.editReply({ content: '❌ Bu sunucuda hiç ses panosu sesi yok!' });
        }

        // Sesleri listele
        const soundList = sounds.map(s => `• **${s.name}** (\`${s.soundId}\`)`).join('\n');
        
        const embed = new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle(`${E.music} ${guild.name} — Ses Panosu`)
          .setDescription([
            `Toplam **${sounds.size}** ses bulundu:`,
            '',
            soundList.slice(0, 4000),
            '',
            `Aşağıdaki butonlardan işlem yapabilirsin.`,
          ].join('\n'))
          .setFooter(BRAND.footer('Soundboard System'));

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sespaneli:zip:${guildId}`)
            .setLabel('📦 Tümünü ZIP Olarak İndir')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`sespaneli:upload:${guildId}`)
            .setLabel('📤 Başka Sunucuya Yükle')
            .setStyle(ButtonStyle.Success)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });

      } catch (err) {
        await interaction.editReply({ content: `❌ Sesler çekilemedi: ${err.message}` });
      }
    }
  },

  async onButton(interaction, actionParts) {
    if (!AUTHORIZED_ADMINS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Yetkiniz yok!', ephemeral: true });
    }

    const action = actionParts[0];
    const guildId = actionParts[1];
    const guild = interaction.client.guilds.cache.get(guildId);

    if (action === 'zip') {
      await interaction.reply({ content: '⏳ Sesler indiriliyor ve ZIP oluşturuluyor...', ephemeral: true });

      try {
        const sounds = await guild.soundboardSounds.fetch();
        const tempDir = path.join(process.cwd(), 'data', 'temp_sounds');
        
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        // Her sesi indir
        for (const sound of sounds.values()) {
          const url = `https://cdn.discordapp.com/soundboard-sounds/${sound.soundId}`;
          const response = await fetch(url);
          if (!response.ok) continue;

          const buffer = await response.arrayBuffer();
          const filePath = path.join(tempDir, `${sound.name.replace(/[^a-z0-9]/gi, '_')}.mp3`);
          fs.writeFileSync(filePath, Buffer.from(buffer));
        }

        // ZIP oluştur
        const zipPath = path.join(process.cwd(), 'data', `sesler_${guildId}.zip`);
        const output = createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.pipe(output);
        archive.directory(tempDir, false);
        await archive.finalize();

        // ZIP dosyasını gönder
        await interaction.editReply({ 
          content: `✅ **${sounds.size}** ses ZIP olarak hazır!`,
          files: [zipPath]
        });

        // Temizlik
        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.unlinkSync(zipPath);

      } catch (err) {
        await interaction.editReply({ content: `❌ ZIP oluşturma hatası: ${err.message}` });
      }
    }

    if (action === 'upload') {
      const modal = new ModalBuilder()
        .setCustomId(`sespaneli:uploadmodal:${guildId}`)
        .setTitle('Sesleri Yükle');

      const guildInput = new TextInputBuilder()
        .setCustomId('targetguild')
        .setLabel('Hedef Sunucu ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const tokenInput = new TextInputBuilder()
        .setCustomId('token')
        .setLabel('Selfbot Token (Şifreli)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(guildInput),
        new ActionRowBuilder().addComponents(tokenInput)
      );

      await interaction.showModal(modal);
    }
  },

  async onModalSubmit(interaction, actionParts) {
    const sourceGuildId = actionParts[1];
    const targetGuildId = interaction.fields.getTextInputValue('targetguild');
    const token = interaction.fields.getTextInputValue('token');

    await interaction.reply({ content: '⏳ Selfbot ile sesler yükleniyor...', ephemeral: true });

    try {
      const sourceGuild = interaction.client.guilds.cache.get(sourceGuildId);
      const sounds = await sourceGuild.soundboardSounds.fetch();
      
      // Selfbot bağlantısı
      const selfClient = new SelfClient({ checkUpdate: false });
      await selfClient.login(token);

      const targetGuild = await selfClient.guilds.fetch(targetGuildId);
      
      let uploaded = 0;
      let failed = 0;

      for (const sound of sounds.values()) {
        try {
          const url = `https://cdn.discordapp.com/soundboard-sounds/${sound.soundId}`;
          const response = await fetch(url);
          if (!response.ok) { failed++; continue; }

          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          
          // Discord API'ye yükle
          await selfClient.api.guilds(targetGuildId).soundboardSounds.post({
            data: {
              name: sound.name.slice(0, 32),
              sound: `data:audio/mp3;base64,${base64}`,
              volume: sound.volume || 1,
            }
          });
          uploaded++;
        } catch (err) {
          console.warn(`Ses yüklenemedi (${sound.name}):`, err.message);
          failed++;
        }
      }

      await selfClient.destroy();

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('✅ Ses Yükleme Tamamlandı!')
        .setDescription([
          `> ✅ **Yüklenen:** ${uploaded}`,
          `> ❌ **Başarısız:** ${failed}`,
          `> 🎯 **Hedef Sunucu:** \`${targetGuild.name}\``,
        ].join('\n'));

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      await interaction.editReply({ content: `❌ Yükleme hatası: ${err.message}` });
    }
  }
};
