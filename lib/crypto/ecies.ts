// lib/crypto/ecies.ts
// ECIES key-wrapping (secp256k1) for distributing the per-prescription CEK
// to each recipient (patient, doctor, pharmacist) via KeyAccessRegistry.
//
// eciesjs 0.5.0 returns Uint8Array (not Buffer) from encrypt/decrypt, so the
// results are wrapped with Buffer.from(...) to preserve a Buffer-based API.
import { encrypt as eciesEncrypt, decrypt as eciesDecrypt } from "eciesjs";

/**
 * Wrap (encrypt) a CEK for a recipient identified by their secp256k1 public key.
 * @param recipientPubKeyHex hex-encoded public key (compressed or uncompressed,
 *   with or without a leading "0x").
 * @param cek the 32-byte content encryption key to wrap.
 * @returns the wrapped key as a Buffer (format: ephemeralPubKey || ciphertext).
 */
export function wrapCEK(recipientPubKeyHex: string, cek: Buffer): Buffer {
  const pubKey = Buffer.from(recipientPubKeyHex.replace(/^0x/, ""), "hex");
  return Buffer.from(eciesEncrypt(pubKey, cek));
}

/**
 * Unwrap (decrypt) a wrapped CEK using the recipient's secp256k1 private key.
 * @param recipientPrivKeyHex hex-encoded private key (with or without "0x").
 * @param wrappedKey the wrapped key produced by wrapCEK.
 * @returns the recovered 32-byte CEK as a Buffer.
 */
export function unwrapCEK(recipientPrivKeyHex: string, wrappedKey: Buffer): Buffer {
  const privKey = Buffer.from(recipientPrivKeyHex.replace(/^0x/, ""), "hex");
  return Buffer.from(eciesDecrypt(privKey, wrappedKey));
}

/**
 * Encode an EOA address as the bytes32 recipient key used in KeyAccessRegistry.
 * recipient = bytes32(uint256(uint160(addr))) - i.e. left-padded to 32 bytes.
 */
export function addrToRecipientBytes32(address: string): `0x${string}` {
  const addr = address.toLowerCase().replace(/^0x/, "");
  return `0x${addr.padStart(64, "0")}`;
}
