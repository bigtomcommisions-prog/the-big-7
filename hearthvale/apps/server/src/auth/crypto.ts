import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** Symmetric encryption for Discord tokens at rest, keyed from SESSION_SECRET. */
export function createTokenCipher(secret: string) {
  const key = Buffer.from(hkdfSync('sha256', secret, 'hearthvale', 'discord-token-encryption', 32));
  return {
    encrypt(plain: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
    },
    decrypt(enc: string): string {
      const [iv, tag, data] = enc.split('.').map((p) => Buffer.from(p, 'base64url'));
      if (!iv || !tag || !data) throw new Error('Malformed ciphertext');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    },
  };
}

export type TokenCipher = ReturnType<typeof createTokenCipher>;

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
