// ═══════════════════════
// 🏛️ REXAL SYSTEMS — MERKEZİ CONFIG
// Bu dosya botun tüm paket, emoji ve yetki ayarlarını tutar.
// ═══════════════════════

// ── 📦 6 PAKET (VIP KATMANLARI) ──────────────────────────────
// features:
//   webhook    → VIP Webhook bildirimi (TÜM paketler: true)
//   stats      → !kasaistatistik detaylı rapor (Lidya ve üstü)
//   antiban    → Anti-Ban Güvenli Mod (Zoktay + Esin)
export const PACKAGES = [
  {
    id: 'paket1',
    name: '1. Paket Mina 🏮',
    roleId: '1571141362076622912',
    capacity: 3,
    tier: 1,
    features: { webhook: true, stats: false, antiban: false },
  },
  {
    id: 'paket2',
    name: '2. Paket Sueda 🌲',
    roleId: '1571141360986234960',
    capacity: 7,
    tier: 2,
    features: { webhook: true, stats: false, antiban: false },
  },
  {
    id: 'paket3',
    name: '3. Paket Lidya 🌷',
    roleId: '1571141359258181652',
    capacity: 14,
    tier: 3,
    features: { webhook: true, stats: true, antiban: false },
  },
  {
    id: 'paket4',
    name: '4. Paket Hilal 💜',
    roleId: '1571141344418594951',
    capacity: 20,
    tier: 4,
    features: { webhook: true, stats: true, antiban: false },
  },
  {
    id: 'paket5',
    name: '5. Paket Zoktay ☄️',
    roleId: '1571141342845739159',
    capacity: 25,
    tier: 5,
    features: { webhook: true, stats: true, antiban: true },
  },
  {
    id: 'paket6',
    name: '6. Paket Esin 💛',
    roleId: '1571141341797290004',
    capacity: 50,
    tier: 6,
    features: { webhook: true, stats: true, antiban: true },
  },
];

// Rol ID → paket eşlemesi (hızlı lookup)
export const PACKAGE_BY_ROLE_ID = Object.fromEntries(PACKAGES.map(p => [p.roleId, p]));
export const PACKAGE_BY_ID = Object.fromEntries(PACKAGES.map(p => [p.id, p]));

// ── 🎨 EMOJI MAP ─────────────────────────────────────────────
// Dev portalda eklediğin emojileri buraya ekle.
// Format: anahtar: '<:emoji_adi:emoji_id>' veya emoji yoksa standart emoji fallback kullanılır.
// Yanına // ile "bu ... sisteminde kullanılacak" notu ekleyebilirsin.
//
// ÖRNEKLER (kendine göre doldur):
//   owocoin:  '<:owocoin:1234567890123456789>',  // ← OwO farm embedlerinde kullanılacak
//   kalkan:   '<:kalkan:1234567890123456789>',   // ← Anti-Ban güvenli mod embedlerinde kullanılacak
//   token:    '<:token:1234567890123456789>',    // ← Kasa/vault embedlerinde kullanılacak
// getEmoji('owocoin', '🪙') şeklinde çağrılır — custom emoji yoksa fallback gösterilir.
export const EMOJI_MAP = {
  // ⬇️ Buraya kendi custom emojilerini ekle (üstteki örneklere bak)
  // owocoin: '<:owocoin:ID>',
  // kalkan:  '<:kalkan:ID>',
  // token:   '<:token:ID>',
  // webhook: '<:webhook:ID>',
  // istatistik: '<:istatistik:ID>',
};

/** Custom emoji varsa onu, yoksa fallback standart emojisi döndürür */
export function getEmoji(key, fallback = '•') {
  const v = EMOJI_MAP[key];
  return v && typeof v === 'string' && v.length > 0 ? v : fallback;
}

// ── 👥 YETKİLİ KULLANICILAR ──────────────────────────────────
// SELFBOT_USERS: Bu ID'ler !owo, !spotify, !mobil gibi selfbot sistemlerini kullanabilir.
// NOT: Erişim ≠ kapasite. Kapasite yine rol aboneliğinden gelir.
// Bu liste dışındaki kullanıcılar selfbot komutlarını KULLANAMAZ (hata embed'i görür).
export const SELFBOT_USERS = [
  '1160564359727173792', // ← Admin / kendi ID'n
  // '123456789012345678', // ← yeni kullanıcı ID'lerini buraya ekle
];

/** Kullanıcı selfbot sistemlerini kullanabilir mi? */
export function canUseSelfbot(userId) {
  return SELFBOT_USERS.includes(userId);
}

export const TICKET_CONFIG = Object.freeze({
  ownerId: '1160564359727173792',
  categoryId: '1573294586108051486',
  // Add support role IDs here; with an empty list, only the owner manages tickets.
  supportRoleIds: ['1571141326517313536'],
  // Optional per-topic routing, e.g. bug: ['roleId']; falls back to supportRoleIds.
  supportRoleIdsByCategory: {},
  // When empty, transcripts are posted inside the private ticket channel.
  logChannelId: '1573301034670100490',
  maxOpenTicketsPerUser: 2,
  openCooldownMs: 60 * 1000,
  // Inactivity reminders; tickets are never auto-deleted.
  staffReminderMs: 24 * 60 * 60 * 1000,
  userResponseReminderMs: 72 * 60 * 60 * 1000,
});
