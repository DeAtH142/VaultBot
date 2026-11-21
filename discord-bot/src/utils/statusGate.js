// src/utils/statusGate.js — 🚩 REXAL Durum Şartı Motoru
//
// Amaç: "Özel sistemler" (owo, sesafk, ! komutları, ? komutları) için tek bir
// kapı. Kullanıcı Discord hesabının ÖZEL DURUMUNA (custom status / bio) şart
// metnini yazmadıysa sistemleri kullanamaz; yazdıysa kullanır.
// Şartı kaldırırsa → çalışan tüm sistemler ANINDA durdurulur (denetleyici).
//
// Şart metni:  discord.gg/rexal  •  .gg/rexal  •  /rexal
// Doğrulama:   bot hesabı üyeyi yeniden çeker (force fetch) → activities +
//              bio alanında şart metni aranır. Görünmez/Çevrimdışı ise
//              durum okunamaz → şart karşılanmamış sayılır.
// Muafiyet:    Gold / Platinum / Diamond paketleri (roleId ile, config'den).

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { COLORS, BRAND } from './embeds.js';
import { getActivePackage } from './tierPerms.js';

// ── Ayarlar ───────────────────────────────────────────────────────────────
export const STATUS_GATE = {
  ID: 'statusgate',
  // Özel durumda geçmesi gereken ifadeler (küçük harf karşılaştırma)
  MARKERS: ['discord.gg/rexal', '.gg/rexal', '/rexal'],
  // Bu paketlerdeki kullanıcılar şarttan muaf
  EXEMPT_ROLES: ['gold', 'platinum', 'diamond'],
  // Denetim aralığı (ms) — şart kalkınca en geç bu süre içinde sistemler durur
  CHECK_INTERVAL_MS: 60_000,
  // Aynı kişi için tekrar doğrulama bekleme süresi (ms)
  VERIFY_CACHE_MS: 45_000,
  // Başarısız denetimde kaç kez üst üste şart yok sayılırsa sistemler durur
  STRIKES_TO_STOP: 2,
  // Discord saatleri — 03:00–06:00 arası otomatik doğrulama yapılmaz (API nezaketi)
  QUIET_HOURS: [3, 6],
  // Erişim şartı (istek üzerine) — false yaparsan herkes kullanabilir
  REQUIRE_ACCESS: true,
};

// ── Bellek ────────────────────────────────────────────────────────────────
/** userId -> { verified, at, reason, cached, member: {status, activities, bio, avatar} } */
const verifyCache = new Map();
/** userId -> { strikes, exempt, lastOk, lastCheck } */
const monitorState = new Map();
/** userId -> Set<"modül:index"> — şart düşünce durdurulacak çalışan sistemler */
const runningSystems = new Map();
/** userId -> { channelId, messageId } — kalıcı "Durum Şartı" mesajı */
const gateMessages = new Map();

const isWithin = (h, a, b) => (a < b ? h >= a && h < b : h >= a || h < b);

// ── Metin / süre yardımcıları ─────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const stamp = (d = new Date()) => `<t:${Math.floor(d.getTime() / 1000)}:f>`;
const rel = (d = new Date()) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;
const msHuman = (ms) => {
  if (ms <= 0) return 'hemen';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk ${s % 60} sn`;
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
};

/** Küçük harfe indir, görünmez karakterleri (zero-width vb.) temizle */
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bir metin şart ifadelerinden birini içeriyor mu? */
export function hasMarker(text) {
  const t = normalize(text);
  if (!t) return false;
  return STATUS_GATE.MARKERS.some((m) => t.includes(m));
}

/** Kullanıcı şarttan muaf mı? (Gold / Platinum / Diamond) */
export function isExempt(userId) {
  const pkg = getActivePackage(userId);
  if (!pkg) return false;
  const role = normalize(pkg.roleId || '');
  const name = normalize(pkg.name || '');
  return STATUS_GATE.EXEMPT_ROLES.some((r) => role.includes(r) || name.includes(r));
}

// ── Doğrulama ─────────────────────────────────────────────────────────────
/**
 * Discord gateway presence önbelleğinden üyenin özel durumunu okur.
 * @returns {{ok:boolean, reason:string, cached:boolean, member:object}}
 */
export async function verifyUserStatus(client, userId, { force = false, member: sourceMember = null } = {}) {
  const cached = verifyCache.get(userId);
  if (!force && cached && Date.now() - cached.at < STATUS_GATE.VERIFY_CACHE_MS) {
    return { ...cached, cached: true };
  }

  const fail = (reason, extra = {}) => {
    const res = { ok: false, reason, cached: false, member: null, ...extra };
    verifyCache.set(userId, { ...res, at: Date.now() });
    return res;
  };

  try {
    const matchesUser = (member) => member && String(member.id) === String(userId);
    let guildMember = matchesUser(sourceMember) && sourceMember.presence ? sourceMember : null;
    if (!guildMember) {
      for (const guild of client.guilds?.cache?.values?.() || []) {
        const candidate = guild.members?.cache?.get?.(userId);
        if (candidate?.presence) {
          guildMember = candidate;
          break;
        }
      }
    }
    if (!guildMember && matchesUser(sourceMember)) guildMember = sourceMember;

    const presence = guildMember?.presence;
    const user = guildMember?.user || client.users?.cache?.get?.(userId);
    if (!guildMember && !user) return fail('hesap-bulunamadi');

    const activities = presence?.activities || [];
    const custom = activities.find((a) => a?.name === 'Custom Status' || a?.type === 4);
    const customText = custom?.state || '';
    const bio = user?.bio || '';

    const member = {
      status: presence?.status || 'offline',
      customText,
      activities: activities.map((a) => a?.name).filter(Boolean),
      bio,
      avatar: user?.displayAvatarURL?.({ size: 128 }) || null,
    };

    // Durum okunamıyorsa (gizli/çevrimdışı) şartı doğrulayamayız
    if (['offline', 'invisible'].includes(member.status)) {
      return fail('durum-gizli', { member });
    }

    const blob = [customText, bio, ...activities.map((a) => a?.state || '')].join(' ');
    if (hasMarker(blob)) {
      const res = { ok: true, reason: 'sart-tamam', cached: false, member };
      verifyCache.set(userId, { ...res, at: Date.now() });
      return res;
    }
    return fail('sart-yok', { member });
  } catch (err) {
    return fail(`hata:${err?.message || 'bilinmeyen'}`);
  }
}

// ── Embed ─────────────────────────────────────────────────────────────────
const DIV = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const THIN = '──────────────────────────────';

/**
 * Pro "Durum Şartı" embed'i.
 * @param {object} o
 * @param {string} o.userId
 * @param {string} o.command        — hangi komut istendi (!owo, ?hesaplarim ...)
 * @param {object} o.result         — verifyUserStatus() çıktısı
 * @param {boolean} o.exempt
 * @param {object} o.stats          — { active, stopped, total }
 * @param {number} o.cooldownLeft   — ms
 */
export function buildStatusGateEmbed({ userId, command = '?hesaplarim', result, exempt = false, stats = {}, cooldownLeft = 0 }) {
  const ok = !!result?.ok || exempt;
  const member = result?.member || {};
  const now = new Date();
  const nextIn = Math.max(0, STATUS_GATE.CHECK_INTERVAL_MS - (verifyCache.get(userId)?.at ? Date.now() - verifyCache.get(userId).at : 0));

  const reasonText = {
    'sart-tamam': 'Özel durum doğrulandı — sistemlere erişim açık.',
    'sart-yok': 'Özel durumunda şart ifadesi bulunamadı.',
    'durum-gizli': 'Durumun **Görünmez / Çevrimdışı** olduğu için doğrulanamadı.',
    'hesap-bulunamadi': 'Hesabın Discord üzerinden okunamadı.',
  }[result?.reason] || 'Durum doğrulanamadı.';

  const statusIcon = {
    online: '🟢', idle: '🟡', dnd: '🔴', offline: '⚫', invisible: '⚫',
  }[member.status] || '⚪';

  const title = exempt
    ? '✅ Durum Şartı — Muafiyet Aktif'
    : ok
      ? '✅ Durum Şartı Karşılandı'
      : '⛔ Durum Şartı Karşılanmıyor';

  const lines = [
    DIV,
    `> 📌 **İstenen Komut** — \`${command}\``,
    `> 🛡️ **Erişim Durumu** — ${ok ? '`AÇIK`' : '`KAPALI`'}`,
    `> 🎫 **Paket** — ${exempt ? '`Muafiyet (Gold+)`' : '`Standart`'}`,
    `> 🕒 **Kontrol** — ${stamp(now)} · ${rel(now)}`,
    DIV,
  ];

  if (exempt) {
    lines.push(
      '### 🎖️ Muafiyet',
      '> Gold, Platinum ve Diamond üyeleri durum şartından **muaftır**.',
      '> Herhangi bir özel durum ayarlamana gerek yok — sistemler doğrudan açılır.',
      '',
    );
  } else {
    lines.push(
      '### 🔍 Hesap Durumu',
      `> ${statusIcon} **Görünürlük** — \`${(member.status || 'bilinmiyor').toUpperCase()}\``,
      `> 💬 **Özel Durum** — ${member.customText ? `\`${member.customText.slice(0, 80)}\`` : '`(boş)`'}`,
      `> 📝 **Bio** — ${member.bio ? `\`${member.bio.slice(0, 80)}\`` : '`(boş)`'}`,
      `> 📡 **Sonuç** — ${reasonText}`,
      '',
      '### 🛠️ Nasıl Aktif Edilir?',
      '**1.** Discord profilini aç ve **Özel Durumumu** düzenle.',
      '**2.** Özel durumuna aşağıdaki ifadelerden birini ekle:',
      '```',
      ...STATUS_GATE.MARKERS.map((m) => `  ${m}`),
      '```',
      '**3.** Durumunu kaydet ve **Çevrimiçi** olduğundan emin ol.',
      '**4.** İşlem tamamlandıktan sonra aşağıdaki **Doğrula** butonuna bas.',
      '',
    );
  }

  const active = stats.active ?? 0;
  const stopped = stats.stopped ?? 0;
  const total = stats.total ?? 0;

  lines.push(
    '### 📊 Sistem Durumu',
    `> 🟢 **Çalışan** — \`${active}\`  ·  🛑 **Durdurulan** — \`${stopped}\`  ·  📦 **Toplam** — \`${total}\``,
    `> ⏱️ **Otomatik denetim** — her \`${Math.round(STATUS_GATE.CHECK_INTERVAL_MS / 1000)} sn\` · sıradaki ${msHuman(nextIn)}`,
    '',
    '### ℹ️ Bilmeniz Gerekenler',
    '> ⚠️ Şartı kaldırdığın anda **çalışan tüm sistemler anında durdurulur.**',
    '> 🕶️ Görünmez / Çevrimdışı durumda özel durum doğrulanamaz.',
    '> 🎖️ **Gold**, **Platinum** ve **Diamond** aboneleri bu şarttan muaftır.',
    '> 🔁 Sistem tekrar kullanıldığında durum yeniden kontrol edilir.',
    '',
    THIN,
    `> 🔐 Bu mesajı sadece **sen** görebilirsin.  ·  ${cooldownLeft > 0 ? `Doğrulama bekleme: \`${msHuman(cooldownLeft)}\`` : 'Doğrulama hazır.'}`,
  );

  return new EmbedBuilder()
    .setColor(ok ? COLORS.success || COLORS.vault : COLORS.danger || 0xED4245)
    .setAuthor({ name: 'REXAL SYSTEMS · Durum Şartı', iconURL: member.avatar || undefined })
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .setFooter(BRAND?.footer ? BRAND.footer('Sistem Erişimi') : { text: 'REXAL SYSTEMS' })
    .setTimestamp();
}

// ── Kalıcı şart mesajı (tıkla → embed) ────────────────────────────────────
export function rememberGateMessage(userId, channelId, messageId) {
  gateMessages.set(userId, { channelId, messageId });
}
export function getGateMessage(userId) {
  return gateMessages.get(userId) || null;
}

// ── Çalışan sistem kaydı ──────────────────────────────────────────────────
export function registerSystem(userId, key) {
  if (!runningSystems.has(userId)) runningSystems.set(userId, new Set());
  runningSystems.get(userId).add(key);
}
export function unregisterSystem(userId, key) {
  const set = runningSystems.get(userId);
  if (!set) return;
  set.delete(key);
  if (set.size === 0) runningSystems.delete(userId);
}
export function getRunningSystems(userId) {
  return [...(runningSystems.get(userId) || [])];
}
export function getSystemStats(userId) {
  const set = runningSystems.get(userId);
  const st = monitorState.get(userId);
  return {
    active: set ? set.size : 0,
    stopped: st?.stopped || 0,
    total: set ? set.size : 0,
    lastCheck: st?.lastCheck || null,
  };
}

// ── Kapı ──────────────────────────────────────────────────────────────────
/**
 * Komutun durum şartını kontrol eder. `null` dönerse erişim serbest.
 * Aksi halde panelin doğrudan gönderebileceği bir yanıt nesnesi döner.
 */
export async function checkStatusGate(client, userId, commandName = '?hesaplarim', { force = false, member = null } = {}) {
  const exempt = isExempt(userId);
  if (exempt) {
    const ms = monitorState.get(userId) || {};
    monitorState.set(userId, { ...ms, exempt: true, lastCheck: Date.now(), lastOk: Date.now() });
    return null;
  }

  const result = await verifyUserStatus(client, userId, { force, member });
  const st = monitorState.get(userId) || { strikes: 0, stopped: 0 };
  monitorState.set(userId, { ...st, exempt: false, lastCheck: Date.now() });

  if (result.ok) {
    monitorState.set(userId, { ...st, exempt: false, strikes: 0, lastOk: Date.now(), lastCheck: Date.now() });
    return null;
  }

  const cached = verifyCache.get(userId);
  const cooldownLeft = cached ? Math.max(0, STATUS_GATE.VERIFY_CACHE_MS - (Date.now() - cached.at)) : 0;

  return {
    embeds: [buildStatusGateEmbed({
      userId, command: commandName, result, exempt, stats: getSystemStats(userId), cooldownLeft,
    })],
    components: gateComponents(),
    allowedMentions: { users: [] },
  };
}

// ── Butonlar ──────────────────────────────────────────────────────────────
export function gateComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('statusgate:verify').setLabel('Doğrula').setEmoji('🔄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('statusgate:howto').setLabel('Nasıl Aktif Edilir?').setEmoji('🛠️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('statusgate:stopall').setLabel('Sistemleri Durdur').setEmoji('⛔').setStyle(ButtonStyle.Danger),
    ),
  ];
}

// ── Denetleyici ───────────────────────────────────────────────────────────
let monitorTimer = null;
let onRevoke = null;

/** Şart düşünce çağrılacak fonksiyon: (userId, systemKeys) => void */
export function setRevokeHandler(fn) {
  onRevoke = fn;
}

/**
 * ⏱️ Süreli denetleyici — çalışan sistemi olan kullanıcıları tarar.
 * Şart kalkmışsa sistemleri ANINDA durdurur (STRIKES_TO_STOP sonrası).
 */
export async function runStatusMonitor(client) {
  const hour = new Date().getHours();
  if (isWithin(hour, STATUS_GATE.QUIET_HOURS[0], STATUS_GATE.QUIET_HOURS[1])) return { skipped: 'quiet-hours' };

  let stopped = 0;
  for (const [userId, set] of [...runningSystems.entries()]) {
    if (!set || set.size === 0) continue;
    if (isExempt(userId)) continue;

    const res = await verifyUserStatus(client, userId, { force: true });
    const st = monitorState.get(userId) || { strikes: 0, stopped: 0 };
    st.lastCheck = Date.now();

    if (res.ok) {
      st.strikes = 0;
      st.lastOk = Date.now();
      monitorState.set(userId, st);
      continue;
    }

    st.strikes = (st.strikes || 0) + 1;
    monitorState.set(userId, st);

    if (st.strikes >= STATUS_GATE.STRIKES_TO_STOP) {
      const keys = [...set];
      const count = keys.length;
      runningSystems.delete(userId);
      st.stopped = (st.stopped || 0) + count;
      monitorState.set(userId, st);
      stopped += count;
      try { onRevoke?.(userId, keys); } catch (e) { console.error('[StatusGate] revoke hatası:', e?.message); }
      console.log(`⛔ [StatusGate] ${userId}: şart kalktı → ${count} sistem durduruldu (${keys.join(', ')})`);
    }
  }
  return { stopped };
}

export function startStatusMonitor(client) {
  if (monitorTimer) return monitorTimer;
  monitorTimer = setInterval(() => {
    runStatusMonitor(client).catch((e) => console.error('[StatusGate] monitor hatası:', e?.message));
  }, STATUS_GATE.CHECK_INTERVAL_MS);
  if (monitorTimer.unref) monitorTimer.unref();
  console.log(`🚩 [StatusGate] Denetleyici aktif (${STATUS_GATE.CHECK_INTERVAL_MS / 1000} sn)`);
  return monitorTimer;
}

export function stopStatusMonitor() {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = null;
}

export default {
  STATUS_GATE, hasMarker, isExempt, verifyUserStatus, buildStatusGateEmbed,
  checkStatusGate, gateComponents, registerSystem, unregisterSystem,
  getRunningSystems, getSystemStats, runStatusMonitor, startStatusMonitor,
  setRevokeHandler, rememberGateMessage, getGateMessage,
};
