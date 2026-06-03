import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = Buffer.from(
  process.env.SETTINGS_ENCRYPTION_KEY ||
  'GD7UtieV9FO6s/l3i0e5Nncp9E7itF8pORGNJnADbE0=',
  'base64'
);

/**
 * Encrypt a plaintext string. Returns base64 encoded string: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine: base64(iv + authTag + encrypted)
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt a base64 encoded string back to plaintext.
 */
export function decrypt(encoded: string): string {
  const combined = Buffer.from(encoded, 'base64');

  const iv = combined.subarray(0, 12);
  const authTag = combined.subarray(12, 28);
  const encrypted = combined.subarray(28);

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Mask a sensitive string for display (e.g., API key).
 * Shows first 4 and last 4 characters with asterisks in between.
 */
export function maskSensitive(value: string): string {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '*'.repeat(Math.min(value.length - 8, 24)) + value.slice(-4);
}
