// src/utils/subscriptionChecker.js
import { getAllUsers, setUserSubscription, scanAndCleanInvalidTokens, getUserSubscription } from './tokenStore.js';
import { Client as SelfClient } from 'discord.js-selfbot-v13';
import { decrypt } from './crypto.js';

/**
 * Otomatik süre kontrolü ve token scan sistemi
 * Her 1 saatte bir çalışır ve süreleri kontrol eder
 */

let checkInterval = null;

export function startSubscriptionChecker(client) {
  if (checkInterval) return;

  console.log('⏰ [SubscriptionChecker] Otomatik süre kontrolü başlatıldı');

  // İlk kontrolü 1 dakika sonra yap
  setTimeout(() => checkAllSubscriptions(client), 60 * 1000);

  // Sonra her 1 saatte bir kontrol et
  checkInterval = setInterval(() => {
    checkAllSubscriptions(client);
  }, 60 * 60 * 1000); // 1 saat
}

export function stopSubscriptionChecker() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('⏰ [SubscriptionChecker] Otomatik süre kontrolü durduruldu');
  }
}

async function checkAllSubscriptions(client) {
  try {
    console.log('⏰ [SubscriptionChecker] Süre kontrolü başlatılıyor...');

    const allUsers = getAllUsers();
    let expiredCount = 0;
    let scannedCount = 0;

    for (const userData of allUsers) {
      const { userId, subscription, tokens } = userData;

      // Eğer ücretsizse veya sınırsızsa atla
      if (!subscription || subscription.type === 'Ücretsiz' || subscription.expiresAt === 'infinite') {
        continue;
      }

      // Süre kontrolü
      if (subscription.expiresAt) {
        const now = Date.now();
        const expires = new Date(subscription.expiresAt).getTime();

        if (now > expires) {
          console.log(`⏰ [SubscriptionChecker] Kullanıcı ${userId} için süre doldu, scan ediliyor...`);

          // Token scan fonksiyonu
          const testToken = async (tokenObj) => {
            try {
              const raw = decrypt(tokenObj);
              const testClient = new SelfClient({ checkUpdate: false });

              const isValid = await new Promise((resolve) => {
                const timer = setTimeout(() => resolve(false), 7000);
                testClient.once('ready', () => {
                  clearTimeout(timer);
                  testClient.destroy();
                  resolve(true);
                });
                testClient.login(raw).catch(() => {
                  clearTimeout(timer);
                  resolve(false);
                });
              });

              return isValid;
            } catch {
              return false;
            }
          };

          // Tokenlerini scan et
          const result = await scanAndCleanInvalidTokens(userId, testToken);

          // Discord'dan rolü al (eğer guild bilgisi varsa)
          if (subscription.roleId && subscription.guildId) {
            try {
              const guild = client.guilds.cache.get(subscription.guildId);
              if (guild) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                  await member.roles.remove(subscription.roleId).catch(() => { });
                  console.log(`⏰ [SubscriptionChecker] Kullanıcı ${userId} rolü Discord'dan alındı`);
                }
              }
            } catch (err) {
              console.error(`⏰ [SubscriptionChecker] Rol alma hatası (${userId}):`, err.message);
            }
          }

          // Aboneliği ücretsiz'e çevir
          setUserSubscription(userId, {
            type: 'Ücretsiz',
            expiresAt: null,
            capacity: 2,
            roleId: null,
            guildId: null,
          });

          expiredCount++;
          scannedCount += result.cleaned;

          console.log(`⏰ [SubscriptionChecker] Kullanıcı ${userId} → Ücretsiz'e düştü → Geçerli: ${result.valid}, Silinen: ${result.cleaned}`);

          // Kullanıcıya bildirim gönder
          try {
            const user = await client.users.fetch(userId);
            const { EmbedBuilder } = await import('discord.js');
            const { COLORS, BRAND, E, THIN_DIVIDER } = await import('./embeds.js');

            const embed = new EmbedBuilder()
              .setColor(COLORS.danger)
              .setTitle(`${E.warning} REXAL — Paket Süresi Doldu`)
              .setDescription([
                `${THIN_DIVIDER}`,
                `> ${E.info} Premium paketiniz otomatik olarak sona erdi.`,
                '',
                `> 🎭 **Önceki Paket:** \`${subscription.type}\``,
                `> 🏷️ **Yeni Paket:** \`Ücretsiz\``,
                `> 📊 **Yeni Kapasite:** \`2 token\``,
                '',
                `${E.warning} **OTOMATİK SCAN YAPILDI:**`,
                `> Geçersiz tokenleriniz temizlendi.`,
                `> Silinen: \`${result.cleaned}\` token`,
                `> Kalan: \`${result.valid}\` token`,
                '',
                `${E.info} Premium pakete tekrar sahip olmak için yöneticiye başvurabilirsin!`,
                `${THIN_DIVIDER}`,
              ].join('\n'))
              .setFooter(BRAND.footer('Otomatik Sistem'))
              .setTimestamp();

            await user.send({ embeds: [embed] }).catch(() => { });
            console.log(`⏰ [SubscriptionChecker] Kullanıcı ${userId} bilgilendirildi`);
          } catch (err) {
            console.error(`⏰ [SubscriptionChecker] Bildirim hatası (${userId}):`, err.message);
          }
        }
      }
    }

    if (expiredCount > 0) {
      console.log(`⏰ [SubscriptionChecker] ${expiredCount} kullanıcı ücretsiz'e çevrildi, ${scannedCount} geçersiz token temizlendi`);
    } else {
      console.log('⏰ [SubscriptionChecker] Süresi dolan paket yok');
    }
  } catch (err) {
    console.error('⏰ [SubscriptionChecker] Kontrol hatası:', err);
  }
}

/**
 * Manuel süre kontrolü tetikle (admin için)
 */
export async function manualCheck(client) {
  console.log('⏰ [SubscriptionChecker] Manuel kontrol tetiklendi');
  await checkAllSubscriptions(client);
  return true;
}
