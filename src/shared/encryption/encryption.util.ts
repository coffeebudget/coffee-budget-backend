import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null;

  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

export function decrypt(
  encryptedValue: string | null | undefined,
): string | null {
  if (encryptedValue == null) return null;

  const key = getKey();
  const [ivB64, authTagB64, ciphertext] = encryptedValue.split(":");

  if (
    ivB64 === undefined ||
    authTagB64 === undefined ||
    ciphertext === undefined
  ) {
    throw new Error(
      "Invalid encrypted value format. Expected iv:authTag:ciphertext",
    );
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function encryptJson(value: any | null | undefined): string | null {
  if (value == null) return null;
  return encrypt(JSON.stringify(value));
}

export function decryptJson(
  encryptedValue: string | null | undefined,
): any | null {
  if (encryptedValue == null) return null;
  const json = decrypt(encryptedValue)!;
  return JSON.parse(json);
}
