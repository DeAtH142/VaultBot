// src/commands/dirlt.js — 🎭 REXAL Sunucu Diriltme (Senaryo) Paneli
// Fotoğraftaki "REXAL — Sunucu Dirltme (Senaryo)" sisteminin bot entegrasyonu:
//  - Vault'taki hesapları SIRAYLA konuşturur
//  - Mesajlar data/senaryo/senaryo{N}.txt dosyalarından okunur (N = hesap sayısı)
//  - 10 eşzamanlı slot, döngü modu, reboot recovery, anlık durdurma
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { getTokens } from '../utils/tokenStore.js';
import {
  startScenario, stopScenario, isScenarioRunning, getScenarioStatus,
  readScenarioFile, SCENARIO_DIR,
} from '../utils/scenarioRunner.js';
import { COLORS, errorEmbed, BRAND, UX, section, bullet, statusLine, THIN_DIVIDER } from '../utils/embeds.js';
import fs from 'node:fs';

const FOOTER = () => BRAND.footer('REXAL Dirltme Engine');

// userId -> { selected:Set<number>, channelId }
const pendingFlow = new Map();

function availableScenarios() {
  try {
    return fs.readdirSync(SCENARIO_DIR)
      .filter(f => /^senaryo\d+\.txt$/i.test(f))
      .map(f => ({ count: parseInt(f.match(/\d+/)[0], 10), file: f }))
      .sort((a, b) => a.count - b.count);
  } catch { return []; }
}

function buildPanel(userId) {
  const running = isScenarioRunning(userId);
  const st = running ? getScenarioStatus(userId) : null;
  const scList = availableScenarios();

  return new EmbedBuilder()
    .setColor(COLORS.darkPurple)
    .setAuthor({ name: `${BRAND.name} • REXAL Dirltme ${BRAND.version}` })
    .setTitle('📁 REXAL — Sunucu Diriltme (Senaryo)')
    .setDescription([
      UX.header,
      `🌍 **Plan:** \`Bronze VIP Özel\`   👤 **Durum:** \`${running ? 'ÇALIŞIYOR 🟢' : 'Hazır ⚪'}\``,
      '',
      section('🎭 Senaryo Sistemi Nedir?'),
      'Vault\'taki hesapları **sırayla konuşturur.** Mesajlar ve zamanlama önceden hazırlanmış',
      'dosyalardan okunur. Tamamen senin kontrolünde — **AI yok, insan gibi doğal konuşma akışı.**',
      '',
      section('🌙 Özellik Seti'),
      `> ${UX.dot2} ${bullet('⚡', '10 Eşzamanlı Slot', '10 ayrı senaryo işlemini aynı anda çalıştır')}`,
      `> ${UX.dot2} ${bullet('📜', 'Hazır Senaryolar', 'Kaç hesap seçersen o sayıya uygun dosya otomatik yüklenir')}`,
      `> ${UX.dot2} ${bullet('🔢', '2-10 Hesap', 'senaryo2.txt → senaryo10.txt arası dosyalar kullanılır')}`,
      `> ${UX.dot2} ${bullet('🔐', 'Vault Entegrasyonu', 'Hesaplar vault\'tan seçilir; token tekrar girilmez')}`,
      `> ${UX.dot2} ${bullet('🔁', 'Döngü Modu', 'Senaryo bitince baştan döner, 7/24 çalışır')}`,
      `> ${UX.dot2} ${bullet('♻️', 'Reboot Recovery', 'Bot yeniden başlasa bile kaldığı yerden devam eder')}`,
      `> ${UX.dot2} ${bullet('🛑', 'Anlık Durdurma', 'İstediğin slotu veya tümünü tek tıkla durdur')}`,
      '',
      section('Senaryo Dosyası Formatı'),
      '```' + [
        'Selam arkadaşlar yeni geldim',
        'wait:30          ← 30 sn bekle',
        'bu sunucu çok iyi yaw',
        '@hesap2          ← sırayı 2. hesaba zorla',
        'bence de kanka',
      ].join('\n') + '```',
      scList.length
        ? `📂 **Yüklü senaryolar:** ${scList.map(s => `\`senaryo${s.count}\``).join(' ')}`
        : `⚠️ Henüz senaryo dosyası yok! Bot klasöründe \`data/senaryo/senaryo2.txt\` oluştur (her satır bir mesaj).`,
      '',
      running ? [
        section('▶️ Aktif Senaryo'),
        `> 📨 Gönderilen: \`${st.sentCount}\`  •  Adım: \`${st.stepIdx}/${st.totalSteps}\`  •  Süre: \`${st.minutes} dk\``,
        `> 👥 Hesaplar: ${st.accounts.map(a => `\`${a.username}\``).join(', ')}`,
        `> 🔁 Döngü: \`${st.loop ? 'Açık' : 'Kapalı'}\`  •  Son hata: \`${st.lastError || 'yok'}\``,
      ].join('\n') : section('Kontrol Paneli'),
    ].join('\n'))
    .setFooter(FOOTER())
    .setTimestamp();
}

const BUTTONS = (running) => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dirlt:baslat').setLabel('Senaryo Başlat').setEmoji('🚀').setStyle(ButtonStyle.Success).setDisabled(running),
    new ButtonBuilder().setCustomId('dirlt:durdur').setLabel('Durdur').setEmoji('🛑').setStyle(ButtonStyle.Danger).setDisabled(!running),
    new ButtonBuilder().setCustomId('dirlt:durum').setLabel('Durum').setEmoji('📊').setStyle(ButtonStyle.Secondary).setDisabled(!running),
    new ButtonBuilder().setCustomId('dirlt:yardim').setLabel('Yardım').setEmoji('❓').setStyle(ButtonStyle.Secondary),
  ),
];

export default {
  name: 'dirlt',
  aliases: ['senaryo', 'dirltme', 'sunucudirilt'],
  description: 'REXAL 🎭 REXAL Sunucu Diriltme (Senaryo) Paneli',

  async execute(message) {
    await message.reply({ embeds: [buildPanel(message.author.id)], components: BUTTONS(isScenarioRunning(message.author.id)) });
  },

  async onButton(interaction, parts) {
    const action = parts[0];
    const userId = interaction.user.id;

    if (action === 'yardim') {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('❓ Diriltme — Yardım & SSS')
          .setColor(COLORS.info)
          .setDescription([
            `\`${THIN_DIVIDER}\``,
            section('Senaryo dosyası nasıl oluşturulur?'),
            '> Bot klasöründe `data/senaryo/` klasörü aç, içine `senaryo3.txt` gibi dosyalar koy.',
            '> **Kural:** Dosya adındaki sayı = kaç hesap seçeceğin. 3 hesapla çalıştıracaksan',
            '> `senaryo3.txt` kullanılır. Her satır bir mesajdır.',
            '',
            section('Zamanlama nasıl ayarlanır?'),
            '> - Satıra `wait:45` yazarsan o noktada 45 sn bekler.',
            '> - Yazmazsan: modalda girdiğin min-max arası **rastgele** bekler (insansı).',
            '',
            section('Sırayı kontrol edebilir miyim?'),
            '> Evet! Satıra `@hesap2` yazarsan o mesajı 2. hesap söyler.',
            '> Yazmazsan sıradaki hesap konuşur (sırayla döner).',
            '',
            section('Hesaplar kanala girmek zorunda mı?'),
            '> Evet — seçtiğin tüm hesaplar, kanalın olduğu sunucuda üye olmalı.',
            '> Değilse o hesap atlanır ve hataya düşer.',
            '',
            section('Döngü modu ne demek?'),
            '> Açık: dosya bitince baştan başlar (7/24). Kapalı: dosya bitince durur.',
            '',
            section('"Senaryo dosyası yok" hatası'),
            '> Seçtiğin hesap sayısı için dosya eksik. Ya dosyayı oluştur ya da',
            '> hesap sayısına uygun bir dosya varsa o kadar hesap seç.',
          ].join('\n'))
          .setFooter(FOOTER()).setTimestamp()],
        ephemeral: true,
      });
    }

    if (action === 'baslat') {
      const tokens = getTokens(userId);
      if (tokens.length === 0) return interaction.reply({ content: '📦 Kasanızda hesap yok! Önce `!hesaplarim` ile ekleyin.', ephemeral: true });
      if (tokens.length < 2) return interaction.reply({ content: '⚠️ Senaryo için **en az 2 hesap** gerekir (birbirine konuşacaklar).', ephemeral: true });

      pendingFlow.set(userId, { selected: new Set() });

      const options = tokens.slice(0, 25).map((t, i) => ({
        label: `${i + 1}. ${t.label || t.username || `Hesap ${i + 1}`}`.slice(0, 100),
        description: 'Seç / kaldır (çoklu seçim)',
        value: String(i), emoji: '🎭',
      }));
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('dirlt:hesaplar')
          .setPlaceholder('🎭 Konuşacak hesapları seç (2-10 adet)...')
          .setMinValues(1).setMaxValues(Math.min(10, tokens.length))
          .addOptions(options),
      );
      return interaction.reply({ content: '**ADIM 1/2 — Konuşacak hesapları seç:**', components: [row], ephemeral: true });
    }

    if (action === 'durdur') {
      const st = getScenarioStatus(userId);
      if (!st) return interaction.reply({ content: '⚫ Aktif senaryo yok.', ephemeral: true });
      if (st.accounts.length > 1) {
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('dirlt:durdur_slot')
            .setPlaceholder('🛑 Tek hesabı çıkarmak için seç (veya "TÜMÜNÜ")')
            .addOptions([
              ...st.accounts.map(a => ({ label: `${a.username}`, value: String(a.tokenIndex), emoji: '🛑' })),
              { label: '💀 TÜMÜNÜ DURDUR', value: 'all', emoji: '💀' },
            ]),
        );
        return interaction.reply({ content: '**Hangisini durduralım?**', components: [row], ephemeral: true });
      }
      stopScenario(userId);
      return interaction.reply({ content: '🛑 Senaryo durduruldu. Bot yeniden başlasa bile bu senaryo geri gelmez.', ephemeral: true });
    }

    if (action === 'durum') {
      const st = getScenarioStatus(userId);
      if (!st) return interaction.reply({ content: '⚫ Aktif senaryo yok.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle('📊 Senaryo Durumu')
        .setColor(COLORS.darkPurple)
        .setDescription([
          `\`${THIN_DIVIDER}\``,
          `> 📨 Gönderilen mesaj: \`${st.sentCount}\``,
          `> 📍 Konum: adım \`${st.stepIdx}/${st.totalSteps}\`  •  \`${st.minutes}\` dakikadır çalışıyor`,
          `> 🔁 Döngü: \`${st.loop ? 'Açık (7/24)' : 'Kapalı'}\``,
          `> 👥 Hesaplar: ${st.accounts.map(a => `\`${a.username}\``).join(', ')}`,
          st.lastError ? `> ⚠️ Son hata: \`${st.lastError}\`` : '> ✅ Son hata: yok',
          `\`${THIN_DIVIDER}\``,
        ].join('\n'))
        .setFooter(FOOTER()).setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  async onSelect(interaction, parts) {
    const userId = interaction.user.id;
    const flow = pendingFlow.get(userId);

    // Çoklu hesap seçimi
    if (parts[0] === 'hesaplar') {
      if (!flow) return interaction.update({ content: '⌛ Oturum süresi doldu, yeniden başlat.', components: [] });
      flow.selected = new Set(interaction.values.map(Number));

      const modal = new ModalBuilder().setCustomId('dirlt:modal').setTitle('🎭 Senaryo Ayarları');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('kanal').setLabel('Kanal ID (konuşulacak kanal)')
          .setPlaceholder('örn: 123456789012345678').setStyle(TextInputStyle.Short).setRequired(true),
      ));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('delay').setLabel('Mesaj arası min-max sn (boş=25-60)')
          .setPlaceholder('örn: 20-45').setStyle(TextInputStyle.Short).setRequired(false),
      ));
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('dongu').setLabel('Döngü modu (evet/hayır, boş=hayır)')
          .setPlaceholder('evet').setStyle(TextInputStyle.Short).setRequired(false),
      ));
      return interaction.showModal(modal);
    }

    // Slot bazlı durdurma
    if (parts[0] === 'durdur_slot') {
      const val = interaction.values[0];
      if (val === 'all') {
        stopScenario(userId);
        return interaction.update({ content: '💀 **Tüm senaryo durduruldu.**', components: [] });
      }
      const r = stopScenario(userId, { tokenIndex: Number(val) });
      return interaction.update({
        content: r.ok ? `🛑 Hesap senaryodan çıkarıldı — kalan hesaplar devam ediyor.` : '❌ Hesap bulunamadı.',
        components: [],
      });
    }
  },

  async onModalSubmit(interaction, parts) {
    if (parts[0] !== 'modal') return;
    const userId = interaction.user.id;
    const flow = pendingFlow.get(userId);
    if (!flow?.selected?.size) return interaction.reply({ content: '⌛ Oturum kayboldu, yeniden başlat.', ephemeral: true });

    const kanal = interaction.fields.getTextInputValue('kanal').trim();
    if (!/^\d{17,20}$/.test(kanal)) {
      return interaction.reply({ embeds: [errorEmbed('Kanal ID geçersiz (17-20 haneli sayı olmalı).')], ephemeral: true });
    }
    const delayStr = (interaction.fields.getTextInputValue('delay') || '').trim();
    const m = delayStr.match(/^(\d+)\s*[-,:]\s*(\d+)$/);
    const minDelaySec = m ? parseInt(m[1], 10) : 25;
    const maxDelaySec = m ? parseInt(m[2], 10) : 60;
    const donguStr = (interaction.fields.getTextInputValue('dongu') || '').trim().toLowerCase();
    const loop = ['evet', 'e', 'yes', 'y', 'açik', 'açık', '1'].includes(donguStr);

    // Dosya ön kontrolü — kullanıcıya net hata ver
    const check = readScenarioFile(flow.selected.size);
    if (!check.ok) {
      return interaction.reply({
        embeds: [errorEmbed(`${check.error}\n\n**Nasıl düzeltilir:**\n> \`data/senaryo/\` klasörüne \`${flow.selected.size} hesap\` için uygun dosya oluştur.\n> Her satır bir mesaj; \`wait:30\` ile bekleme, \`@hesap2\` ile sıra kontrolü yapılır.`)],
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });
    const res = await startScenario(userId, [...flow.selected], kanal, { loop, minDelaySec, maxDelaySec });
    if (!res.ok) return interaction.editReply({ embeds: [errorEmbed(`Senaryo başlatılamadı:\n\`${res.error}\``)] });

    const embed = new EmbedBuilder()
      .setTitle('🎭 Senaryo Başlatıldı!')
      .setColor(COLORS.success)
      .setDescription([
        `\`${THIN_DIVIDER}\``,
        `> 📜 **Senaryo:** \`${res.lines}\` adım  •  👥 **Hesap:** \`${res.accounts}\``,
        `> 📺 **Kanal:** <#${kanal}> (\`${res.channelName}\`)`,
        `> 🔁 **Döngü:** \`${res.loop ? 'Açık — 7/24 döner' : 'Kapalı — bitince durur'}\``,
        `> ⏱️ **Tempo:** \`${minDelaySec}-${maxDelaySec} sn\` rastgele (insansı)`,
        `> 📂 Dosya: \`${res.file}\``,
        '',
        `> ♻️ Reboot Recovery aktif — bot yeniden başlasa bile devam eder.`,
        `> 🛑 Durdurmak için paneldeki \`Durdur\` butonunu kullan.`,
        `\`${THIN_DIVIDER}\``,
      ].join('\n'))
      .setFooter(FOOTER()).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  },
};
