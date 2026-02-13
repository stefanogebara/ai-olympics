/**
 * Shared AES-256-GCM encryption utilities
 * Used for encrypting API keys, verification session answers, etc.
 */

import crypto from 'crypto';

// Derive a 256-bit key from the configured secret or service key
const explicitKey = process.env.API_KEY_ENCRYPTION_KEY;
const keySource = explicitKey || process.env.SUPABASE_SERVICE_KEY;

if (!keySource) {
  throw new Error(
    'Missing encryption key. Set API_KEY_ENCRYPTION_KEY or SUPABASE_SERVICE_KEY environment variable.'
  );
}

if (!explicitKey) {
  console.warn(
    '[crypto] WARNING: Using SUPABASE_SERVICE_KEY as encryption key fallback. ' +
    'Set API_KEY_ENCRYPTION_KEY for production use. ' +
    'If the service key is rotated, all encrypted data becomes unrecoverable.'
  );
}

if (process.env.NODE_ENV === 'production' && explicitKey) {
  console.info(
    '[crypto] NOTE: Encryption key loaded from environment variable. ' +
    'For enhanced security, consider using a KMS (AWS KMS, GCP Cloud KMS, or HashiCorp Vault) ' +
    'to manage encryption keys instead of plain environment variables.'
  );
}

const ENCRYPTION_KEY: Buffer = crypto.createHash('sha256').update(keySource).digest();

/**
 * Encrypt plaintext with AES-256-GCM
 * Returns iv:authTag:ciphertext (all hex)
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt AES-256-GCM ciphertext
 * Expects iv:authTag:ciphertext format (all hex)
 */
export function decrypt(encryptedStr: string): string {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
