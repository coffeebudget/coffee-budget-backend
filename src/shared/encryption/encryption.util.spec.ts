import { encrypt, decrypt, encryptJson, decryptJson } from "./encryption.util";

// Use a fixed test key (32 bytes = 64 hex chars)
const TEST_KEY = "a".repeat(64);

describe("encryption utility", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe("encrypt/decrypt", () => {
    it("should roundtrip a simple string", () => {
      const plaintext = "req_abc123";
      const encrypted = encrypt(plaintext);
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(":");
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    it("should return null for null input", () => {
      expect(encrypt(null)).toBeNull();
      expect(decrypt(null)).toBeNull();
    });

    it("should return null for undefined input", () => {
      expect(encrypt(undefined)).toBeNull();
      expect(decrypt(undefined)).toBeNull();
    });

    it("should produce different ciphertexts for the same input (random IV)", () => {
      const plaintext = "same-value";
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      expect(a).not.toBe(b);
      expect(decrypt(a)).toBe(plaintext);
      expect(decrypt(b)).toBe(plaintext);
    });

    it("should handle empty string", () => {
      const encrypted = encrypt("");
      expect(decrypt(encrypted)).toBe("");
    });

    it("should handle long strings", () => {
      const long = "x".repeat(10000);
      expect(decrypt(encrypt(long))).toBe(long);
    });

    it("should detect tampered ciphertext", () => {
      const encrypted = encrypt("sensitive")!;
      const parts = encrypted.split(":");
      parts[2] = "tampered" + parts[2];
      expect(() => decrypt(parts.join(":"))).toThrow();
    });
  });

  describe("encryptJson/decryptJson", () => {
    it("should roundtrip an object", () => {
      const data = { apiKey: "sk_123", accountId: "acc_456" };
      const encrypted = encryptJson(data);
      expect(typeof encrypted).toBe("string");
      expect(encrypted).toContain(":");
      expect(decryptJson(encrypted)).toEqual(data);
    });

    it("should roundtrip an array", () => {
      const data = ["id1", "id2", "id3"];
      const encrypted = encryptJson(data);
      expect(decryptJson(encrypted)).toEqual(data);
    });

    it("should return null for null input", () => {
      expect(encryptJson(null)).toBeNull();
      expect(decryptJson(null)).toBeNull();
    });

    it("should return null for undefined input", () => {
      expect(encryptJson(undefined)).toBeNull();
      expect(decryptJson(undefined)).toBeNull();
    });
  });
});
