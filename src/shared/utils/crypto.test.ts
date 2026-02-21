import { describe, it, expect, vi } from 'vitest';

// Must set env before crypto.ts module loads (top-level key derivation)
vi.hoisted(() => {
  process.env.API_KEY_ENCRYPTION_KEY = 'vitest-crypto-test-key-32chars!!';
});

import { encrypt, decrypt } from './crypto.js';

describe('crypto utilities', () => {
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
      const plaintext = 'Hello 世界 🌍 Ñoño';
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
  });

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
  });

  describe('decrypt error handling', () => {
    it('throws on invalid format (missing parts)', () => {
      expect(() => decrypt('invalid')).toThrow('Invalid encrypted format');
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
  });
});
