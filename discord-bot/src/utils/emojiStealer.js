// src/utils/emojiStealer.js — 🌙 REXAL Emoji & Sticker Çalı Motoru
// Kaynak sunucudaki tüm özel emojileri ve sticker'ları vault'taki bir hesap
// üzerinden çeker; hedef sunucuya (botun bulunduğu) yükler.
//
// Akış:
//  1) Hesap kaynak sunucuya bağlanır (zaten üye ise direkt, değilse davet linkiyle girer)
//  2) Emojiler + sticker'lar CDN URL'leriyle listelenir
//  3) Base64 olarak indirilir
//  4) Hedef sunucuya bot (vault bot tokeni) ile yüklenir — multipart/form-data
//
// Not: Hedef sunucuya yükleme için BOT hesabı kullanılır (kullanıcı tokeni ile
// emoji oluşturma API'si risklidir). Yükleme yetkisi: "Emoji Yönet" + "Sticker Yönet".

import { loginVaultAccount, destroyClient, sleep } from './selfbotHelpers.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

// ── Mini ZIP yazıcı (saf Node, harici paket gerekmez) ─────────────────────
// Basit stored/deflate zip archive üretir. emojiStickerZip'te kullanılır.
function crc32(buf) {
  if (!crc32.table) {
    crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crc32.table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crc32.table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}

/**
 * @param {Array<{name:string,data:Buffer}>} files
 * @returns {Buffer} zip dosyası
 */
function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const compressed = zlib.deflateRawSync(f.data, { level: 9 });
    const crc = crc32(f.data);
    const useDeflate = compressed.length < f.data.length;
    const payload = useDeflate ? compressed : f.data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // local header signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // flags: UTF-8 isim
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);           // mod time
    local.writeUInt16LE(0, 12);           // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra len
    chunks.push(local, nameBuf, payload);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);     // central dir signature
    cen.writeUInt16LE(20, 4);             // version made by
    cen.writeUInt16LE(20, 6);             // version needed
    cen.writeUInt16LE(0x0800, 8);         // flags
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(payload.length, 20);
    cen.writeUInt32LE(f.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);        // local header offset
    central.push(Buffer.concat([cen, nameBuf]));

    offset += local.length + nameBuf.length + payload.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);       // EOCD signature
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

/**
 * Emojileri hareketli/hareketsiz klasörlerine ayrılmış zip olarak üretir.
 * @param {Array<{name:string,animated:boolean,data:Buffer}>} emojiFiles
 * @param {Array<{name:string,data:Buffer,format:number}>} stickerFiles
 */
export function buildEmojiZip(emojiFiles, stickerFiles = []) {
  const files = [];
  const used = new Set();
  const safe = (name, ext) => {
    let base = (name || 'emoji').replace(/[\\/:*?"<>|.]/g, '_').slice(0, 40) || 'emoji';
    let candidate = `${base}.${ext}`;
    let i = 1;
    while (used.has(candidate.toLowerCase())) candidate = `${base}_${i++}.${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  };
  for (const f of emojiFiles) {
    const ext = f.animated ? 'gif' : 'png';
    const folder = f.animated ? 'hareketli' : 'hareketsiz';
    files.push({ name: `emojiler/${folder}/${safe(f.name, ext)}`, data: f.data });
  }
  for (const f of stickerFiles) {
    const ext = f.format === 3 ? 'json' : f.format === 2 ? 'apng' : 'png';
    files.push({ name: `stickerlar/${safe(f.name, ext)}`, data: f.data });
  }
  return buildZip(files);
}

/**
 * Kaynak sunucudaki emojileri/sticker'ları indirip ZIP buffer döndürür.
 * (Sunucuya yükleme YAPMAZ — DM'den dosya göndermek için.)
 */
export async function fetchEmojisAsZip(ownerId, tokenIndex, sourceGuildId, inviteCode) {
  const login = await loginVaultAccount(ownerId, tokenIndex);
  if (!login.success) return { ok: false, error: login.error };

  const client = login.client;
  try {
    let guild = client.guilds.cache.get(sourceGuildId);
    if (!guild && inviteCode) {
      await client.fetchInvite(inviteCode).then(i => i.acceptInvite()).catch(e => { throw new Error(`Davete katılınamadı: ${e.message}`); });
      await sleep(3000);
      guild = client.guilds.cache.get(sourceGuildId);
    }
    if (!guild) return { ok: false, error: 'Hesap kaynak sunucuda değil ve davet kodu verilmedi ya da geçersiz.' };

    const fetched = await guild.fetch().catch(() => null);
    if (!fetched) return { ok: false, error: 'Kaynak sunucu bilgileri alınamadı.' };

    const emojis = [...(fetched.emojis?.cache?.values() || [])];
    let stickers = [];
    try {
      const raw = await client.rest.get(`/guilds/${sourceGuildId}/stickers`).catch(() => []);
      stickers = raw || [];
    } catch { stickers = []; }

    if (emojis.length + stickers.length === 0) return { ok: false, error: 'Kaynak sunucuda özel emoji/sticker bulunamadı.' };

    fs.mkdirSync(TMP_DIR, { recursive: true });
    const emojiFiles = [];
    for (const e of emojis) {
      const buf = await download(e.url).catch(() => null);
      if (buf) emojiFiles.push({ name: e.name, animated: e.animated, data: buf });
      await sleep(DOWNLOAD_DELAY_MS);
    }
    const stickerFiles = [];
    for (const s of stickers) {
      const fmt = s.format_type || 1;
      const url = `https://cdn.discordapp.com/stickers/${s.id}.${fmt === 3 ? 'json' : fmt === 2 ? 'apng' : 'png'}?size=4096&lossless=true`;
      const buf = await download(url).catch(() => null);
      if (buf) stickerFiles.push({ name: s.name, data: buf, format: fmt });
      await sleep(DOWNLOAD_DELAY_MS);
    }

    const zipBuffer = buildEmojiZip(emojiFiles, stickerFiles);
    return {
      ok: true,
      username: login.username,
      source: sourceGuildId,
      zip: zipBuffer,
      emojiCount: emojiFiles.length,
      animatedCount: emojiFiles.filter(f => f.animated).length,
      staticCount: emojiFiles.filter(f => !f.animated).length,
      stickerCount: stickerFiles.length,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    destroyClient(client);
  }
}

/**
 * İzin kontrolü: vault hesabı kaynak sunucuda emoji yükleme iznine sahip mi?
 * @returns {{ok:boolean, hasPermission?:boolean, guildName?:string, error?:string}}
 */
export async function checkManageEmojiPermission(ownerId, tokenIndex, guildId, inviteCode) {
  const login = await loginVaultAccount(ownerId, tokenIndex);
  if (!login.success) return { ok: false, error: login.error };

  const client = login.client;
  try {
    let guild = client.guilds.cache.get(guildId);
    if (!guild && inviteCode) {
      await client.fetchInvite(inviteCode).then(i => i.acceptInvite()).catch(e => { throw new Error(`Davete katılınamadı: ${e.message}`); });
      await sleep(3000);
      guild = client.guilds.cache.get(guildId);
    }
    if (!guild) return { ok: false, error: 'Hesap kaynak sunucuda değil ve davet kodu verilmedi ya da geçersiz.' };

    // Selfbot tokeni ile emoji yükleme testi riskli olduğu için SADECE izin kontrolü yapılır.
    // Eğer izin varsa emojiler kendi hesabından, yoksa DM'den zip gönderilir.
    const me = guild.me || guild.members?.me || client.guilds.cache.get(guildId)?.members?.cache?.get(client.user.id);
    if (!me) return { ok: false, error: 'Kendi üyelik bilgisi alınamadı.' };
    const perm = me.permissions;
    const hasPerm = perm.has('ManageGuildExpressions') || perm.has('Administrator') || perm.has('ManageEmojisAndStickers');
    return { ok: true, hasPermission: !!hasPerm, guildName: guild.name };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    destroyClient(client);
  }
}

/**
 * Vault hesabının KENDİ tokeni ile emoji yükler (kullanıcı "yönetici" olduğu sunucuya).
 * Selfbot token ile emoji yükleme API'si — Discord resmi bot endpoint'i değildir.
 * Dikkat: bu işlem kullanıcı tokeninin abuse riski taşır.
 */
export async function uploadEmojisWithSelfbot(ownerId, tokenIndex, sourceGuildId, inviteCode, targetGuildId) {
  const login = await loginVaultAccount(ownerId, tokenIndex);
  if (!login.success) return { ok: false, error: login.error };

  const client = login.client;
  try {
    // Kaynağa bağlan
    let srcGuild = client.guilds.cache.get(sourceGuildId);
    if (!srcGuild && inviteCode) {
      await client.fetchInvite(inviteCode).then(i => i.acceptInvite()).catch(e => { throw new Error(`Davete katılınamadı: ${e.message}`); });
      await sleep(3000);
      srcGuild = client.guilds.cache.get(sourceGuildId);
    }
    if (!srcGuild) return { ok: false, error: 'Hesap kaynak sunucuda değil ve davet kodu verilmedi ya da geçersiz.' };

    const src = await srcGuild.fetch().catch(() => null);
    if (!src) return { ok: false, error: 'Kaynak sunucu bilgileri alınamadı.' };

    // Hedef sunucunun izin kontrolü
    let tgtGuild = client.guilds.cache.get(targetGuildId);
    if (!tgtGuild) return { ok: false, error: 'Hesap hedef sunucuda üye değil.' };
    const me = tgtGuild.me || tgtGuild.members?.me || client.guilds.cache.get(targetGuildId)?.members?.cache?.get(client.user.id);
    if (!me) return { ok: false, error: 'Hedef sunucuda kendi üyelik bilgisi alınamadı.' };
    const perm = me.permissions;
    const hasPerm = perm.has('ManageGuildExpressions') || perm.has('Administrator') || perm.has('ManageEmojisAndStickers');
    if (!hasPerm) return { ok: false, error: 'Hedef sunucuda "Emoji Yönet" yetkin yok — bunun yerine DM Zip seçeneğini kullan.' };

    const emojis = [...(src.emojis?.cache?.values() || [])];
    if (emojis.length === 0) return { ok: false, error: 'Kaynak sunucuda özel emoji bulunamadı.' };

    let ok = 0, fail = 0;
    const failReasons = [];
    for (const e of emojis) {
      try {
        const existing = await client.rest.get(`/guilds/${targetGuildId}/emojis`).catch(() => []);
        const existingNames = (existing || []).map(x => x.name);
        if (existingNames.includes(e.name)) { fail++; failReasons.push(`${e.name}: isim çakışması`); continue; }
        if (existingNames.length >= 100) { fail++; failReasons.push(`${e.name}: emoji slotu dolu`); continue; }

        const buf = await download(e.url);
        const ext = e.animated ? 'gif' : 'png';
        await client.rest.post(`/guilds/${targetGuildId}/emojis`, {
          body: { name: e.name, image: `data:image/${ext};base64,${buf.toString('base64')}` },
        });
        ok++;
      } catch (err) {
        fail++;
        failReasons.push(`${e.name}: ${err.message?.slice(0, 80)}`);
      }
      await sleep(1500);
    }

    return {
      ok: true,
      username: login.username,
      source: sourceGuildId,
      target: targetGuildId,
      emojiOk: ok,
      emojiFail: fail,
      emojiTotal: emojis.length,
      failReasons: failReasons.slice(0, 12),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    destroyClient(client);
  }
}

const MAX_EMOJI = 100;         // Discord sunucu emoji slotu (standart)
const MAX_STICKER = 40;        // sticker slotu (normal sunucularda genelde yetersiz ama denesin)
const DOWNLOAD_DELAY_MS = 700; // CDN indirme arası
const UPLOAD_DELAY_MS = 1500;  // yükleme arası (rate limit koruması)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dirname, '..', '..', 'data', 'emoji_tmp');

/**
 * Kaynak sunucudaki emojileri & sticker'ları toplar ve hedef sunucuya kopyalar.
 * @param {string} ownerId vault sahibi kullanıcı ID
 * @param {number} tokenIndex kaynak sunucuya erişebilen vault hesabı
 * @param {string} sourceGuildId kaynak sunucu ID
 * @param {string} inviteCode opsiyonel davet kodu (hesap sunucuda değilse katılmak için)
 * @param {object} mainClient ana botun Client'ı (hedef sunucuya yükleme için)
 * @param {string} targetGuildId hedef sunucu ID
 */
export async function stealEmojis(ownerId, tokenIndex, sourceGuildId, inviteCode, mainClient, targetGuildId) {
  const login = await loginVaultAccount(ownerId, tokenIndex);
  if (!login.success) return { ok: false, error: login.error };

  const client = login.client;
  try {
    // ── 1. Kaynak sunucuya erişim ──
    let guild = client.guilds.cache.get(sourceGuildId);
    if (!guild && inviteCode) {
      const joined = await client.fetchInvite(inviteCode).then(i => i.acceptInvite()).catch(e => { throw new Error(`Davete katılınamadı: ${e.message}`); });
      await sleep(3000); // guild cache'inin dolmasını bekle
      guild = client.guilds.cache.get(sourceGuildId);
    }
    if (!guild) {
      return { ok: false, error: 'Hesap kaynak sunucuda değil ve davet kodu verilmedi ya da geçersiz.' };
    }

    const fetched = await guild.fetch().catch(() => null);
    if (!fetched) return { ok: false, error: 'Kaynak sunucu bilgileri alınamadı.' };

    // ── 2. Emoji & sticker listesi ──
    const emojis = [...(fetched.emojis?.cache?.values() || [])].map(e => ({
      name: e.name,
      id: e.id,
      animated: e.animated,
      url: e.url,
    }));
    let stickers = [];
    try {
      const raw = await client.rest.get(`/guilds/${sourceGuildId}/stickers`).catch(() => []);
      stickers = (raw || []).map(s => ({
        name: s.name,
        id: s.id,
        format_type: s.format_type || 1, // 1=PNG, 2=APNG, 3=LOTTIE
        url: `https://cdn.discordapp.com/stickers/${s.id}.${s.format_type === 3 ? 'json' : s.format_type === 2 ? 'apng' : 'png'}?size=4096&lossless=true`,
        description: s.description || '',
        tags: s.tags || '',
      }));
    } catch { stickers = []; }

    const total = emojis.length + stickers.length;
    if (total === 0) return { ok: false, error: 'Kaynak sunucuda özel emoji/sticker bulunamadı.' };

    // ── 3. İndir (base64) ──
    fs.mkdirSync(TMP_DIR, { recursive: true });

    const emojiFiles = [];
    for (const e of emojis) {
      const buf = await download(e.url).catch(() => null);
      if (buf) emojiFiles.push({ name: e.name, animated: e.animated, data: buf });
      await sleep(DOWNLOAD_DELAY_MS);
    }

    const stickerFiles = [];
    for (const s of stickers) {
      // Lottie sticker'lar discord CDN'den .json olarak iner; upload yine olur.
      const buf = await download(s.url).catch(() => null);
      if (buf) stickerFiles.push({ name: s.name, data: buf, format: s.format_type, description: s.description, tags: s.tags });
      await sleep(DOWNLOAD_DELAY_MS);
    }

    // ── 4. Hedef sunucuya yükle ──
    const targetGuild = mainClient?.guilds?.cache?.get(targetGuildId);
    if (!targetGuild) return { ok: false, error: 'Hedef sunucu bot için bulunamadı — bot o sunucuda mı?' };

    let emojiOk = 0, emojiFail = 0, stickerOk = 0, stickerFail = 0;
    const failReasons = [];

    for (const f of emojiFiles.slice(0, MAX_EMOJI)) {
      try {
        // Var olanla aynı isim varsa atla (çakışma)
        if (targetGuild.emojis.cache.some(x => x.name === f.name)) { emojiFail++; failReasons.push(`${f.name}: isim çakışması`); continue; }
        const slotsFree = MAX_EMOJI - targetGuild.emojis.cache.size;
        if (slotsFree <= 0) { emojiFail++; failReasons.push(`${f.name}: emoji slotu dolu`); continue; }

        const ext = f.animated ? 'gif' : 'png';
        await targetGuild.emojis.create({
          attachment: `data:image/${f.animated ? 'gif' : 'png'};base64,${f.data.toString('base64')}`,
          name: f.name,
        });
        emojiOk++;
      } catch (err) {
        emojiFail++;
        failReasons.push(`${f.name}: ${err.message?.slice(0, 80)}`);
      }
      await sleep(UPLOAD_DELAY_MS);
    }

    for (const f of stickerFiles.slice(0, MAX_STICKER)) {
      try {
        if (targetGuild.stickers?.cache?.some(x => x.name === f.name)) { stickerFail++; continue; }
        const slotsFree = MAX_STICKER - (targetGuild.stickers?.cache?.size || 0);
        if (slotsFree <= 0) { stickerFail++; continue; }

        // discord.js v14: GuildStickerManager.create
        await mainClient.stickers.create({
          guild: targetGuild,
          name: f.name,
          description: f.description || '',
          tags: f.tags || 'sticker',
          file: { attachment: f.data, name: `${f.name}.${f.format === 3 ? 'json' : f.format === 2 ? 'apng' : 'png'}` },
        });
        stickerOk++;
      } catch (err) {
        stickerFail++;
        failReasons.push(`sticker ${f.name}: ${err.message?.slice(0, 80)}`);
      }
      await sleep(UPLOAD_DELAY_MS);
    }

    return {
      ok: true,
      username: login.username,
      source: sourceGuildId,
      total,
      emojiOk, emojiFail, emojiTotal: emojis.length,
      stickerOk, stickerFail, stickerTotal: stickers.length,
      failReasons: failReasons.slice(0, 12),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    destroyClient(client);
  }
}

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`indirme ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** tmp klasörünü temizle */
export function cleanupTmp() {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { }
}
