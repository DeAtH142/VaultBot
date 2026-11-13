// src/utils/roleAwarder.js — 🎖️ Rol Dağıtıcı
//
// Süre eşiği dolunca (playtimeStore.applyAccrual → awarded[]) buradaki fonksiyon
// çağrılır ve gerçek Discord rolü verilir.
//
// ⚠️ ÖNEMLİ: Bu repo SELF-BOT (kullanıcı hesabı token'ları) ile çalışır.
// Selfbot ile rol VERİLEMEZ (Discord API kısıtı + ToS ihlali). Bu yüzden rol
// verme için ayrı bir GERÇEK BOT TOKEN'i gerekir:
//
//   ROLE_BOT_TOKEN = <gerçek bot token>          (zorunlu)
//   AİT OLDUĞU SUNUCU  = ROLE_GUILD_ID           (opsiyonel, yoksa otomatik bulur)
//   ROL HARİTASI       = ROLE_TIER_ROLES         ör. "1:123456789,2:987654321"
//
// Gerçek bot şu yetkilerle davet edilmeli:
//   • sunucuda üye olmalı
//   • Rolleri Yönet (Manage Roles)
//   • verilecek rol, botun EN YÜKSEK rolünün ALTINDA olmalı
//
// Bot yoksa/yetki yoksa sistem ÇÖKMEZ: kazanım kayda "pending" olarak düşülür
// ve `!surem rolver` ile manuel tekrar denenebilir.

import { Client, GatewayIntentBits, Partials } from 'discord.js';

let botClient = null;
let botReady = null; // Promise
let lastError = null;

/** Rol id haritası: "1:123,2:456" → { 1: '123', 2: '456' } */
export function getTierRoleMap() {
  const raw = (process.env.ROLE_TIER_ROLES || '').trim();
  const map = {};
  if (!raw) return map;
  for (const part of raw.split(/[,\n;]+/)) {
    const [tier, roleId] = part.split(':').map(s => s && s.trim());
    if (tier && roleId && /^\d{5,}$/.test(roleId)) map[Number(tier)] = roleId;
  }
  return map;
}

export function isRoleBotEnabled() {
  return !!process.env.ROLE_BOT_TOKEN;
}

/** Gerçek bot client'ını tembel başlat (tek kez) */
async function getBotClient() {
  if (!isRoleBotEnabled()) return null;
  if (botReady) return botReady;

  botReady = new Promise((resolve) => {
    try {
      botClient = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
        partials: [Partials.GuildMember],
      });

      const timeout = setTimeout(() => {
        console.warn('[RoleAwarder] Bot hazır olmadı (25s) — rol verilemedi.');
        resolve(null);
      }, 25000);

      botClient.once('ready', () => {
        clearTimeout(timeout);
        console.log(`[RoleAwarder] 🎖️ Rol botu hazır: ${botClient.user.tag} (${botClient.guilds.cache.size} sunucu)`);
        resolve(botClient);
      });

      botClient.once('error', (err) => {
        clearTimeout(timeout);
        lastError = err.message;
        console.error('[RoleAwarder] Bot hatası:', err.message);
        resolve(null);
      });

      botClient.login(process.env.ROLE_BOT_TOKEN).catch((err) => {
        clearTimeout(timeout);
        lastError = err.message;
        console.error('[RoleAwarder] Bot girişi başarısız:', err.message);
        resolve(null);
      });
    } catch (err) {
      lastError = err.message;
      resolve(null);
    }
  });

  return botReady;
}

/** Rolün verileceği sunucuyu seç */
function pickGuild(client) {
  const wanted = (process.env.ROLE_GUILD_ID || '').trim();
  if (wanted) {
    return client.guilds.cache.get(wanted) || null;
  }
  return client.guilds.cache.first() || null;
}

/**
 * Bir kazanımı (tier) kullanıcıya tek tek uygula.
 * @returns {Promise<{ success: boolean, awarded: boolean, dm: boolean, error?: string }>}
 */
export async function awardTier(userId, tier, meta = {}) {
  const client = await getBotClient();
  if (!client) {
    return { success: false, awarded: false, dm: false, error: lastError || 'ROLE_BOT_TOKEN ayarlanmamış veya bot açılamadı' };
  }

  const roleId = getTierRoleMap()[tier];
  if (!roleId) {
    return { success: false, awarded: false, dm: false, error: `Tier ${tier} için ROLE_TIER_ROLES'ta rol ID tanımlı değil` };
  }

  const guild = pickGuild(client);
  if (!guild) {
    return { success: false, awarded: false, dm: false, error: 'Bot hiçbir sunucuda bulunamadı (ROLE_GUILD_ID ayarla)' };
  }

  // Botun rolü, verilecek rolün üstünde mi? (Discord kuralı)
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const targetRole = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!targetRole) {
    return { success: false, awarded: false, dm: false, error: `Rol bulunamadı: ${roleId}` };
  }
  if (me && me.roles.highest.comparePositionTo(targetRole) <= 0) {
    return { success: false, awarded: false, dm: false, error: `Botun rolü "${targetRole.name}" rolünün altında — rolleri yukarı taşı` };
  }

  // Kullanıcı sunucuda mı?
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return { success: false, awarded: false, dm: false, error: 'Kullanıcı sunucuda değil (veya bot üyeleri göremiyor)' };
  }

  // Zaten verilmiş mi?
  if (member.roles.cache.has(roleId)) {
    const dmOk = await sendDm(client, member, tier, meta, true);
    return { success: true, awarded: false, alreadyHad: true, dm: dmOk };
  }

  try {
    await member.roles.add(roleId, `Süre ödülü — tier ${tier}`);
  } catch (err) {
    return { success: false, awarded: false, dm: false, error: `Rol eklenemedi: ${err.message}` };
  }

  // DM başarısız olsa bile rolü geri ALMA — sadece kaydet.
  const dmOk = await sendDm(client, member, tier, meta, false);
  console.log(`[RoleAwarder] ✅ ${userId} → ${targetRole.name} (tier ${tier})${dmOk ? '' : ' • DM gönderilemedi'}`);
  return { success: true, awarded: true, dm: dmOk, roleName: targetRole.name };
}

/** Kazanım DM'i — kapalıysa sorun değil */
async function sendDm(client, member, tier, meta, alreadyHad) {
  try {
    const { EmbedBuilder } = await import('discord.js');
    const roleName = meta.roleName || guildRoleName(client, tier) || `Rol ${tier}`;
    const nextHours = meta.nextHours;

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(alreadyHad ? '✨ Rolün zaten sende!' : '🎉 Yeni rol kazandın!')
      .setDescription([
        `**Rol:** <@&${getTierRoleMap()[tier]}>`,
        '',
        meta.usedHours
          ? `Bu rolü botun uygun sistemlerini **${meta.usedHours}** kullanarak kazandın.`
          : 'Bu rolü botun uygun sistemlerini kullanarak kazandın.',
        nextHours
          ? `Süren sıfırlandı; sıradaki rol için **${nextHours}** gerekiyor.`
          : 'Tüm rolleri tamamladın! 👑',
      ].join('\n'))
      .setFooter({ text: 'REXAL SYSTEMS • Süre Ödülü' })
      .setTimestamp();

    await member.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

function guildRoleName(client, tier) {
  const guild = pickGuild(client);
  const id = getTierRoleMap()[tier];
  return id && guild ? guild.roles.cache.get(id)?.name : null;
}

/** Bir kullanıcının bekleyen kazanımlarını tekrar dene (manuel) */
export async function retryPending(userId, pendingList) {
  const results = [];
  for (const p of pendingList) {
    const res = await awardTier(userId, p.tier, p);
    results.push({ tier: p.tier, ...res });
    if (!res.success) break; // ilk hatada dur — sıra bozulmasın
  }
  return results;
}

/** Bot durum bilgisi (panelde gösterim) */
export function roleBotStatus() {
  return {
    enabled: isRoleBotEnabled(),
    ready: !!(botClient && botClient.isReady?.()),
    tag: botClient?.user?.tag || null,
    lastError,
    tierRoles: getTierRoleMap(),
  };
}
