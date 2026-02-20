import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must set env before crypto.ts module loads (top-level key derivation)
vi.hoisted(() => {
  process.env.API_KEY_ENCRYPTION_KEY = 'vitest-crypto-test-key-32chars!!';
});

import { encrypt, decrypt } from './crypto.js';

describe('crypto utilities', () => {
  // ================================================================
  // Round-trip encryption/decryption
  // ================================================================
  describe('encrypt/decrypt round-trip', () => {
    it('encrypts and decrypts a simple string', () => {
      const plaintext = 'sk-abc123-secret-key';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('encrypts and decrypts an empty string', () => {
      const encrypted = encrypt('');
      expect(decrypt(encrypted)).toBe('');
    });

    it('encrypts and decrypts unicode text', () => {
      const plaintext = 'Hello \u4E16\u754C \uD83C\uDF0D \u00D1o\u00F1o';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('encrypts and decrypts a long string', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('produces different ciphertexts for the same plaintext (random IV)', () => {
      const plaintext = 'same-key';
      const enc1 = encrypt(plaintext);
      const enc2 = encrypt(plaintext);
      expect(enc1).not.toBe(enc2);
      // But both decrypt to the same value
      expect(decrypt(enc1)).toBe(plaintext);
      expect(decrypt(enc2)).toBe(plaintext);
    });

    it('handles special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('handles newlines and whitespace', () => {
      const plaintext = 'line1\nline2\r\ntab\there';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('handles JSON strings', () => {
      const plaintext = JSON.stringify({ key: 'value', nested: { arr: [1, 2, 3] } });
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('handles strings with colons (matching the delimiter)', () => {
      const plaintext = 'key:with:colons:everywhere';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });
  });

  // ================================================================
  // Output format validation
  // ================================================================
  describe('encrypt output format', () => {
    it('produces iv:authTag:ciphertext format with hex values', () => {
      const encrypted = encrypt('test');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      // IV is 16 bytes = 32 hex chars
      expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
      // Auth tag is 16 bytes = 32 hex chars
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
      // Ciphertext is hex
      expect(parts[2]).toMatch(/^[0-9a-f]+$/);
    });

    it('returns a string type', () => {
      const encrypted = encrypt('test');
      expect(typeof encrypted).toBe('string');
    });

    it('ciphertext length scales with plaintext length', () => {
      const short = encrypt('a');
      const long = encrypt('a'.repeat(1000));
      const shortCipherLen = short.split(':')[2].length;
      const longCipherLen = long.split(':')[2].length;
      expect(longCipherLen).toBeGreaterThan(shortCipherLen);
    });

    it('empty plaintext still produces valid 3-part format', () => {
      const encrypted = encrypt('');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^[0-9a-f]{32}$/);
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
      // Empty plaintext produces empty ciphertext hex
      expect(parts[2]).toBe('');
    });
  });

  // ================================================================
  // Decrypt error handling
  // ================================================================
  describe('decrypt error handling', () => {
    it('throws on invalid format (missing parts)', () => {
      expect(() => decrypt('invalid')).toThrow('Invalid encrypted format');
    });

    it('throws on empty string', () => {
      expect(() => decrypt('')).toThrow('Invalid encrypted format');
    });

    it('throws on single colon', () => {
      expect(() => decrypt('a:b')).toThrow('Invalid encrypted format');
    });

    it('throws on invalid format (too many parts)', () => {
      expect(() => decrypt('a:b:c:d')).toThrow('Invalid encrypted format');
    });

    it('throws on tampered ciphertext', () => {
      const encrypted = encrypt('secret');
      const parts = encrypted.split(':');
      // Flip a character in the ciphertext
      const tampered = parts[2].replace(/[0-9a-f]/, (c) => c === 'a' ? 'b' : 'a');
      expect(() => decrypt(`${parts[0]}:${parts[1]}:${tampered}`)).toThrow();
    });

    it('throws on tampered auth tag', () => {
      const encrypted = encrypt('secret');
      const parts = encrypted.split(':');
      const tampered = parts[1].replace(/[0-9a-f]/, (c) => c === 'a' ? 'b' : 'a');
      expect(() => decrypt(`${parts[0]}:${tampered}:${parts[2]}`)).toThrow();
    });

    it('throws on tampered IV', () => {
      const encrypted = encrypt('secret');
      const parts = encrypted.split(':');
      const tampered = parts[0].replace(/[0-9a-f]/, (c) => c === 'a' ? 'b' : 'a');
      expect(() => decrypt(`${tampered}:${parts[1]}:${parts[2]}`)).toThrow();
    });

    it('throws on completely random hex values', () => {
      const randomHex = (len: number) => Array.from({ length: len }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      expect(() => decrypt(`${randomHex(32)}:${randomHex(32)}:${randomHex(16)}`)).toThrow();
    });

    it('throws when ciphertext from one key is decrypted with another', async () => {
      // The current module uses one key. Encrypting here, then importing with a different
      // key would require resetModules. Instead, verify tampered data fails.
      const encrypted = encrypt('secret-data');
      // Completely replace the ciphertext portion
      const parts = encrypted.split(':');
      const wrongCipher = 'ff'.repeat(parts[2].length / 2);
      expect(() => decrypt(`${parts[0]}:${parts[1]}:${wrongCipher}`)).toThrow();
    });
  });

  // ================================================================
  // Module-level behavior (env var handling)
  // ================================================================
  describe('module-level key derivation', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.unstubAllEnvs();
    });

    it('throws when neither API_KEY_ENCRYPTION_KEY nor SUPABASE_SERVICE_KEY is set', async () => {
      vi.stubEnv('API_KEY_ENCRYPTION_KEY', '');
      vi.stubEnv('SUPABASE_SERVICE_KEY', '');

      await expect(import('./crypto.js')).rejects.toThrow(
        'Missing encryption key'
      );
    });

    it('uses SUPABASE_SERVICE_KEY fallback and logs warning', async () => {
      vi.stubEnv('API_KEY_ENCRYPTION_KEY', '');
      vi.stubEnv('SUPABASE_SERVICE_KEY', 'my-supabase-service-key-for-test');
      vi.stubEnv('NODE_ENV', 'test');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { encrypt: enc, decrypt: dec } = await import('./crypto.js');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using SUPABASE_SERVICE_KEY as encryption key fallback')
      );

      // Verify it actually works with the fallback key
      const plaintext = 'test-with-fallback';
      const encrypted = enc(plaintext);
      expect(dec(encrypted)).toBe(plaintext);

      warnSpy.mockRestore();
    });

    it('uses API_KEY_ENCRYPTION_KEY when both keys are set (no warning)', async () => {
      vi.stubEnv('API_KEY_ENCRYPTION_KEY', 'explicit-key-for-testing-12345');
      vi.stubEnv('SUPABASE_SERVICE_KEY', 'service-key-should-be-ignored');
      vi.stubEnv('NODE_ENV', 'test');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { encrypt: enc, decrypt: dec } = await import('./crypto.js');

      // No fallback warning should appear
      expect(warnSpy).not.toHaveBeenCalled();

      // Verify encryption works
      const plaintext = 'explicit-key-test';
      const encrypted = enc(plaintext);
      expect(dec(encrypted)).toBe(plaintext);

      warnSpy.mockRestore();
    });

    it('logs KMS info in production with explicit key', async () => {
      vi.stubEnv('API_KEY_ENCRYPTION_KEY', 'production-key-for-test-here!');
      vi.stubEnv('SUPABASE_SERVICE_KEY', '');
      vi.stubEnv('NODE_ENV', 'production');

      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await import('./crypto.js');

      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('consider using a KMS')
      );

      infoSpy.mockRestore();
    });

    it('does not log KMS info in non-production', async () => {
      vi.stubEnv('API_KEY_ENCRYPTION_KEY', 'dev-key-for-testing-purposes!');
      vi.stubEnv('SUPABASE_SERVICE_KEY', '');
      vi.stubEnv('NODE_ENV', 'development');

      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await import('./crypto.js');

      // The KMS note should NOT appear in development
      const kmsCall = infoSpy.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('KMS')
      );
      expect(kmsCall).toBeUndefined();

      infoSpy.mockRestore();
    });

    it('derives different keys from different secrets', async () => {
      // Encrypt with key A
      vi.stubEnv('API_KEY_ENCRYPTION_KEY', 'key-a-for-encryption-test!!!');
      vi.stubEnv('SUPABASE_SERVICE_KEY', '');
      vi.stubEnv('NODE_ENV', 'test');

      const modA = await import('./crypto.js');
      const encrypted = modA.encrypt('secret-data');

      // Reset and load with key B
      vi.resetModules();
      vi.stubEnv('API_KEY_ENCRYPTION_KEY', 'key-b-completely-different!!!');
      vi.stubEnv('SUPABASE_SERVICE_KEY', '');

      const modB = await import('./crypto.js');

      // Decrypting with a different key should fail
      expect(() => modB.decrypt(encrypted)).toThrow();
    });
  });
});
