// lib/ipfs-encrypted.ts
//
// Encrypted IPFS client for the e-prescription envelope scheme.
//
// Only ENCRYPTED package bytes are ever uploaded to IPFS — plaintext
// prescription content never leaves the caller. The flow is:
//
//   plaintext --(AES-256-GCM under CEK)--> EncryptedPackage
//             --(JSON canonical bytes)----> packageBytes
//             --(keccak256)----------------> payloadHash  (anchored on-chain)
//             --(Kubo /api/v0/add)---------> cid
//
// On retrieval the integrity gate (keccak256(packageBytes) === payloadHash)
// is checked BEFORE any decryption is attempted, so a tampered ciphertext
// is rejected without ever feeding it to the AES-GCM decipher.
//
// This module talks to a Kubo node over its HTTP API using the Node 22
// global `fetch` / `FormData` / `Blob` — no Helia / IPFS-JS deps are used.
// Endpoints are env-driven (see C8):
//   - IPFS_API_URL     (default http://localhost:5001) → /api/v0/add, /api/v0/pin/rm
//   - IPFS_GATEWAY_URL (default http://localhost:8080)  → /ipfs/<cid>
//
// The existing `lib/ipfs.ts` is intentionally left untouched; this is a
// separate, encrypted-only client.

import {
  encrypt,
  decrypt,
  packageToBytes,
  packageFromBytes,
  type EncryptedPackage,
} from "./crypto";
import { keccak256 } from "viem";

const IPFS_API_URL = process.env.IPFS_API_URL || "http://localhost:5001";
const IPFS_GATEWAY_URL = process.env.IPFS_GATEWAY_URL || "http://localhost:8080";

export interface UploadResult {
  cid: string;
  payloadHash: `0x${string}`;
  encryptedPackage: EncryptedPackage;
}

/** Shape of the JSON returned by Kubo's `/api/v0/add` endpoint. */
interface KuboAddResponse {
  Name?: string;
  Hash: string;
  Size?: string;
}

/**
 * Pin an ALREADY-encrypted package to IPFS without re-encrypting it.
 *
 * This is the integrity-preserving path used by the prepare/submit flow: the
 * package (and therefore its random IV) was produced in `prepare`, the doctor's
 * EIP-712 signature commits to its `payloadHash`, and `submit` must pin the
 * EXACT same bytes so the on-chain hash matches what was signed. Re-encrypting
 * (as `encryptAndUpload` does) would mint a fresh IV and a different hash,
 * silently breaking the signature→content binding.
 *
 * Returns the IPFS `cid` and the `payloadHash` (keccak256 over the canonical
 * package bytes) to anchor on-chain.
 */
export async function uploadPackage(
  pkg: EncryptedPackage
): Promise<{ cid: string; payloadHash: `0x${string}` }> {
  const pkgBytes = packageToBytes(pkg);
  const payloadHash = keccak256(pkgBytes);

  // Only the encrypted package bytes are uploaded — never plaintext.
  const form = new FormData();
  form.append(
    "file",
    new Blob([pkgBytes], { type: "application/octet-stream" })
  );

  const res = await fetch(`${IPFS_API_URL}/api/v0/add?pin=true`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`IPFS upload failed: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as KuboAddResponse;
  const cid = body.Hash;
  if (!cid) {
    throw new Error("IPFS upload failed: response missing Hash (cid)");
  }

  return { cid, payloadHash };
}

/**
 * Encrypt `plaintext` under `cek` (AES-256-GCM), serialize the resulting
 * package to its canonical bytes, compute the on-chain `payloadHash`
 * (keccak256 over those exact bytes), and pin the bytes to IPFS.
 *
 * Returns the IPFS `cid`, the `payloadHash` to anchor on-chain, and the
 * in-memory `encryptedPackage` (handy for tests / re-pinning).
 */
export async function encryptAndUpload(
  plaintext: Buffer,
  cek: Buffer
): Promise<UploadResult> {
  const pkg = encrypt(cek, plaintext);
  const { cid, payloadHash } = await uploadPackage(pkg);
  return { cid, payloadHash, encryptedPackage: pkg };
}

/**
 * Fetch the encrypted package bytes for `cid` from the IPFS gateway, verify
 * their integrity against `payloadHash`, then decrypt under `cek`.
 *
 * The integrity check (keccak256(packageBytes) === payloadHash) runs BEFORE
 * decryption: a mismatch throws immediately and the ciphertext is never fed
 * to the AES-GCM decipher.
 */
export async function fetchAndDecrypt(
  cid: string,
  payloadHash: `0x${string}`,
  cek: Buffer
): Promise<Buffer> {
  const res = await fetch(`${IPFS_GATEWAY_URL}/ipfs/${cid}`);
  if (!res.ok) {
    throw new Error(`IPFS fetch failed: ${res.status} ${res.statusText}`);
  }
  const pkgBytes = Buffer.from(await res.arrayBuffer());

  // Integrity gate — verify BEFORE decrypting.
  const actualHash = keccak256(pkgBytes);
  if (actualHash !== payloadHash) {
    throw new Error(
      `payloadHash mismatch — ciphertext tampered (expected ${payloadHash}, got ${actualHash})`
    );
  }

  const pkg = packageFromBytes(pkgBytes);
  return decrypt(cek, pkg);
}

/**
 * Unpin `cid` from the local Kubo node so it can be garbage-collected.
 * Best-effort: a non-OK response (e.g. "not pinned") is surfaced as an error
 * for the caller to handle.
 */
export async function unpinCID(cid: string): Promise<void> {
  const res = await fetch(
    `${IPFS_API_URL}/api/v0/pin/rm?arg=${encodeURIComponent(cid)}`,
    { method: "POST" }
  );
  if (!res.ok) {
    throw new Error(`IPFS unpin failed: ${res.status} ${res.statusText}`);
  }
}
