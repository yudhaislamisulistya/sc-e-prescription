// src/lib/eth.ts
//
// Client-side Ethereum helpers (viem). Talks to an injected EIP-1193 wallet for
// signing + sending transactions, and a read-only public client for queries.
// Contract addresses come from NEXT_PUBLIC_* env (inlined at build time); when
// they are absent the UI degrades gracefully instead of crashing.
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  keccak256,
  toBytes,
  type Chain,
  type EIP1193Provider,
} from "viem";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 1337);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545";

export const besuChain: Chain = {
  id: CHAIN_ID,
  name: "Besu Consortium",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

export const ADDR = {
  identity: process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as `0x${string}` | undefined,
  prescription: process.env.NEXT_PUBLIC_PRESCRIPTION_REGISTRY_ADDRESS as `0x${string}` | undefined,
  keyAccess: process.env.NEXT_PUBLIC_KEY_ACCESS_REGISTRY_ADDRESS as `0x${string}` | undefined,
};

export function getInjected(): EIP1193Provider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
}

export function publicClient() {
  return createPublicClient({ chain: besuChain, transport: http(RPC_URL) });
}

export function walletClientFor(provider: EIP1193Provider) {
  return createWalletClient({ chain: besuChain, transport: custom(provider) });
}

// --- Minimal ABIs (only the fragments the consoles call) ---------------------

export const PRESCRIPTION_REGISTRY_ABI = [
  {
    name: "issuePrescription",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "prescriptionId", type: "bytes32" },
      { name: "patientRef", type: "bytes32" },
      { name: "cid", type: "string" },
      { name: "payloadHash", type: "bytes32" },
      { name: "expiresAt", type: "uint64" },
      { name: "totalUnits", type: "uint32" },
      { name: "refillsAllowed", type: "uint8" },
    ],
    outputs: [],
  },
  {
    name: "dispense",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "prescriptionId", type: "bytes32" },
      { name: "units", type: "uint32" },
    ],
    outputs: [],
  },
  {
    name: "refill",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "prescriptionId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "revoke",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "prescriptionId", type: "bytes32" }],
    outputs: [],
  },
  {
    name: "getPrescription",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "prescriptionId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "doctor", type: "address" },
          { name: "patientRef", type: "bytes32" },
          { name: "cid", type: "string" },
          { name: "payloadHash", type: "bytes32" },
          { name: "issuedAt", type: "uint64" },
          { name: "expiresAt", type: "uint64" },
          { name: "totalUnits", type: "uint32" },
          { name: "dispensedUnits", type: "uint32" },
          { name: "refillsAllowed", type: "uint8" },
          { name: "refillsUsed", type: "uint8" },
          { name: "state", type: "uint8" },
        ],
      },
    ],
  },
] as const;

export const KEY_ACCESS_REGISTRY_ABI = [
  {
    name: "grantAccess",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "prescriptionId", type: "bytes32" },
      { name: "recipient", type: "bytes32" },
      { name: "wrappedKey", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const IDENTITY_REGISTRY_ABI = [
  {
    name: "registerActor",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "actor", type: "address" },
      { name: "role", type: "bytes32" },
      { name: "licenseHash", type: "bytes32" },
      { name: "institutionId", type: "bytes32" },
      { name: "encryptionPubKey", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "registerPatient",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "patientRef", type: "bytes32" },
      { name: "encryptionPubKey", type: "bytes" },
      { name: "custodian", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "setActorStatus",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "actor", type: "address" },
      { name: "status", type: "uint8" },
    ],
    outputs: [],
  },
] as const;

// Role identifiers match the contract's keccak256("<NAME>") constants.
export const ROLE_NAMES = {
  DOCTOR_ROLE: "DOCTOR_ROLE",
  PHARMACIST_ROLE: "PHARMACIST_ROLE",
  PATIENT_CUSTODIAN_ROLE: "PATIENT_CUSTODIAN_ROLE",
} as const;

export function roleHash(name: string): `0x${string}` {
  return keccak256(toBytes(name));
}

/** Encode an EOA as the bytes32 recipient slot the KeyAccessRegistry expects. */
export function addrToRecipient(addr: string): `0x${string}` {
  return `0x${addr.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}
