// lib/crypto/patientRef.ts
// Off-chain derivation of the on-chain patientRef. Keeps zero PII on-chain:
// only the salted hash of the patient DID is ever stored.
import { keccak256, encodePacked, stringToHex } from "viem";
import { randomBytes } from "crypto";

/** Generate a fresh random 32-byte salt as a 0x-prefixed hex string. */
export function generateSalt(): `0x${string}` {
  return `0x${randomBytes(32).toString("hex")}`;
}

/**
 * Derive the patientRef from a salt and a patient DID (UTF-8 string).
 *
 * patientRef = keccak256(abi.encodePacked(salt, bytes(did)))
 *
 * The DID string is hex-encoded with viem's stringToHex so that encodePacked
 * treats it as a raw `bytes` value. This matches the Solidity equivalent:
 *
 *     keccak256(abi.encodePacked(salt, bytes(did)))
 *
 * where `bytes(did)` is the UTF-8 byte encoding of the DID. The two
 * derivations therefore produce identical refs on- and off-chain.
 */
export function derivePatientRef(salt: `0x${string}`, did: string): `0x${string}` {
  return keccak256(encodePacked(["bytes32", "bytes"], [salt, stringToHex(did)]));
}
