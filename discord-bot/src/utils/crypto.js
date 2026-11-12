// src/utils/crypto.js
import crypto from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config();

const rawKey = process.env.ENCRYPTION_KEY?.replace(/^base64:/, '') ?? '';
const ENCRYPTION_KEY = Buffer.from(rawKey, 'base64');

if (ENCRYPTION_KEY.length !== 32) {
  console.error('⚠️  ENCRYPTION_KEY 32 byte (base64) olmalı!');
  console.error('    Oluşturmak için:  node -e "console.log(\'base64:\' + require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  process.exit(1);
}

/**
 * AES-256-GCM ile şifrele
 * @param {string} plainText
 * @returns {{ iv: string, authTag: string, ciphertext: string }}
 */
export function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

/**
 * AES-256-GCM ile çöz
 * @param {{ iv: string, authTag: string, ciphertext: string }} data
 * @returns {string}
 */
export function decrypt({ iv, authTag, ciphertext }) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
