// lib/crypto/aes-gcm.ts
// AES-256-GCM authenticated encryption for the per-prescription content
// encryption key (CEK) envelope scheme.
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

export interface EncryptedPackage {
  alg: "AES-256-GCM";
  iv: string; // base64, 12 bytes
  ciphertext: string; // base64
  authTag: string; // base64, 16 bytes
}

/** Generate a fresh 256-bit content encryption key (CEK). */
export function generateCEK(): Buffer {
  return randomBytes(32);
}

/** Encrypt plaintext under the CEK, producing a self-describing package. */
export function encrypt(cek: Buffer, plaintext: Buffer): EncryptedPackage {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    alg: "AES-256-GCM",
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypt an EncryptedPackage under the CEK.
 * Throws if the authTag does not authenticate the ciphertext (tamper detection).
 */
export function decrypt(cek: Buffer, pkg: EncryptedPackage): Buffer {
  const iv = Buffer.from(pkg.iv, "base64");
  const ciphertext = Buffer.from(pkg.ciphertext, "base64");
  const authTag = Buffer.from(pkg.authTag, "base64");
  const decipher = createDecipheriv("aes-256-gcm", cek, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Serialize a package to its canonical byte representation (the bytes stored on IPFS). */
export function packageToBytes(pkg: EncryptedPackage): Buffer {
  return Buffer.from(JSON.stringify(pkg), "utf8");
}

/** Parse the canonical byte representation back into a package. */
export function packageFromBytes(bytes: Buffer): EncryptedPackage {
  return JSON.parse(bytes.toString("utf8"));
}
