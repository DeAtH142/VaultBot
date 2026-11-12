// src/utils/dmSender.js — 💌 Toplu DM Sender
// Kasadaki hesaplarla belirli kullanıcılara toplu DM. Hesap ↔ kullanıcı eşleşmesi round-robin.
import { loginVaultAccount, destroyClient, sleep } from './selfbotHelpers.js';

export const DM_DELAY_PER_TARGET_MS = 4000;   // aynı hesabın hedefleri arası
export const DM_INTER_ACCOUNT_MS = 6000;      // hesaplar arası

/**
 * Toplu DM gönderir.
 * @param {string} ownerId
 * @param {number[]} accountIndices kullanılacak hesap indexleri
 * @param {string[]} targetIds hedef kullanıcı ID'leri
 * @param {string[]} templates mesaj şablonları (rastgele seçilir)
 * @param {{delayPerTargetMs?:number, interAccountMs?:number}} opts
 * @returns {Promise<Array<{tokenIndex, username, ok, summary, error?, sent}>>}
 */
export async function runBulkDm(ownerId, accountIndices, targetIds, templates, opts = {}) {
  const delayPerTarget = opts.delayPerTargetMs ?? DM_DELAY_PER_TARGET_MS;
  const interAccount = opts.interAccountMs ?? DM_INTER_ACCOUNT_MS;

  const reports = [];
  for (let a = 0; a < accountIndices.length; a++) {
    const idx = accountIndices[a];
    if (a > 0) await sleep(interAccount);

    const login = await loginVaultAccount(ownerId, idx);
    if (!login.success) {
      reports.push({ tokenIndex: idx, ok: false, error: login.error, sent: 0 });
      continue;
    }

    // Round-robin: hedefleri hesaplara böl
    const myTargets = targetIds.filter((_, tIdx) => tIdx % accountIndices.length === a);
    let sent = 0, failed = 0, lastError = null;

    for (const targetId of myTargets) {
      try {
        const user = await login.client.users.fetch(targetId).catch(() => null);
        if (!user) { failed++; lastError = `Kullanıcı bulunamadı (${targetId})`; continue; }
        const template = templates[Math.floor(Math.random() * templates.length)];
        const content = template.replace(/\{@user\}/g, `<@${targetId}>`).replace(/\{@me\}/g, login.username);
        await user.send(content);
        sent++;
      } catch (err) {
        failed++; lastError = err.message;
        if (/rate|limit|Too Many/i.test(err.message)) await sleep(8000);
      }
      await sleep(delayPerTarget);
    }

    reports.push({
      tokenIndex: idx, username: login.username, ok: true, sent, failed,
      summary: `${sent} DM gönderildi${failed ? `, ${failed} başarısız` : ''}${lastError ? ` — ${lastError}` : ''}`,
    });
    destroyClient(login.client);
  }
  return reports;
}
