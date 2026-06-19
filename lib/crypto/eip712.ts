// lib/crypto/eip712.ts
// EIP-712 typed-data signing for prescriptions. The doctor (or patient
// custodian) signs the canonical prescription fields; the signature can be
// verified against the issuing wallet on- or off-chain.
import type { WalletClient } from "viem";

export const EIP712_DOMAIN = {
  name: "EPrescription",
  version: "1",
  chainId: 1337,
} as const;

export const PRESCRIPTION_TYPES = {
  Prescription: [
    { name: "prescriptionId", type: "bytes32" },
    { name: "doctor", type: "address" },
    { name: "patientRef", type: "bytes32" },
    { name: "payloadHash", type: "bytes32" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
    { name: "totalUnits", type: "uint32" },
    { name: "refillsAllowed", type: "uint8" },
  ],
} as const;

export interface PrescriptionTypedData {
  prescriptionId: `0x${string}`;
  doctor: `0x${string}`;
  patientRef: `0x${string}`;
  payloadHash: `0x${string}`;
  issuedAt: bigint;
  expiresAt: bigint;
  totalUnits: number;
  refillsAllowed: number;
}

/** Sign a prescription's typed data with the given wallet client. */
export async function signPrescription(
  walletClient: WalletClient,
  verifyingContract: `0x${string}`,
  data: PrescriptionTypedData
): Promise<`0x${string}`> {
  return walletClient.signTypedData({
    account: walletClient.account!,
    domain: { ...EIP712_DOMAIN, verifyingContract },
    types: PRESCRIPTION_TYPES,
    primaryType: "Prescription",
    message: data,
  });
}
