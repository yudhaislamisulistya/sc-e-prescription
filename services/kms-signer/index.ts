// services/kms-signer/index.ts
//
// KMS signer microservice — patient-custodian CEK re-wrap (spec §10.5, mitigates V2).
//
// This service holds the PATIENT_CUSTODIAN_ROLE service EOA (KMS_SERVICE_KEY).
// It is the ONLY actor allowed to re-distribute a patient's content-encryption
// key (CEK) on their behalf. There is NO shared hot-wallet: the custodian EOA is
// scoped to a single role and never co-signs doctor/pharmacist transactions.
//
// Flow of POST /grant-access:
//   1. Unwrap the per-prescription CEK using the PATIENT private key. In
//      production this MUST be a non-extractable key operation inside an HSM
//      (AWS KMS / HashiCorp Vault Transit) — the raw private key NEVER leaves
//      the boundary; the service only receives the decrypted CEK. The
//      `getPatientPrivKey` abstraction below models that boundary; its
//      process.env fallback is DEV ONLY (see the comment on the function).
//   2. Re-wrap (ECIES) the CEK to the PHARMACY public key via `wrapCEK`.
//   3. Submit `grantAccess(prescriptionId, recipientBytes32, wrappedKey)` to the
//      KeyAccessRegistry, signed by the custodian EOA via a viem walletClient.
//
// NOTE ON RUNTIME VERIFICATION: this file is type-checked (`tsc --noEmit`) but is
// NOT runtime-verified in this workspace — Besu, IPFS and the deployed
// KeyAccessRegistry are unavailable here. It is scaffolding for the
// docker-compose deployment.
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { createWalletClient, createPublicClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unwrapCEK, wrapCEK, addrToRecipientBytes32 } from "../../lib/crypto";

// --- Configuration -----------------------------------------------------------

const serviceKey = process.env.KMS_SERVICE_KEY as `0x${string}` | undefined;
if (!serviceKey) throw new Error("KMS_SERVICE_KEY not set");

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const PORT = Number(process.env.KMS_PORT || 4000);

// Besu IBFT 2.0 consortium devnet: chainId 1337, free gas (gasPrice 0).
const besu: Chain = {
  id: 1337,
  name: "besu",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const account = privateKeyToAccount(serviceKey);
const transport = http(RPC_URL);
const walletClient = createWalletClient({ account, chain: besu, transport });
const publicClient = createPublicClient({ chain: besu, transport });

// Minimal ABI fragment for the single call this service makes.
const KEY_ACCESS_REGISTRY_ABI = [
  {
    name: "grantAccess",
    type: "function",
    inputs: [
      { name: "prescriptionId", type: "bytes32" },
      { name: "recipient", type: "bytes32" },
      { name: "wrappedKey", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// --- Request payload ----------------------------------------------------------

interface GrantAccessRequest {
  /** keccak256 prescription id (bytes32 hex). */
  prescriptionId: `0x${string}`;
  /** patientRef = keccak256(salt, did) (bytes32 hex). Selects the custodial key. */
  patientRef: `0x${string}`;
  /** The CEK already wrapped to the patient pubkey (ECIES output, hex). */
  patientWrappedKeyHex: `0x${string}`;
  /** Uncompressed secp256k1 pubkey of the pharmacy recipient (hex). */
  pharmacyPubKeyHex: string;
  /** Pharmacy EOA address — encoded to the bytes32 recipient key. */
  pharmacyAddr: `0x${string}`;
  /** Deployed KeyAccessRegistry address. */
  karAddress: `0x${string}`;
}

// --- Key boundary -------------------------------------------------------------

/**
 * Resolve the patient's private key material for an unwrap operation.
 *
 * PRODUCTION: this MUST be implemented as a NON-EXTRACTABLE key operation backed
 * by AWS KMS (`Decrypt`/`asymmetric`) or HashiCorp Vault Transit. The private key
 * never leaves the HSM boundary — the HSM performs the ECIES unwrap and returns
 * only the CEK. The string return type here is a DEV stand-in for that boundary.
 *
 * DEV ONLY: the `process.env.PATIENT_KEY_<patientRef>` fallback below loads a raw
 * private key from the environment. NEVER enable this path in production.
 */
async function getPatientPrivKey(patientRef: string): Promise<string> {
  const envKey = process.env[`PATIENT_KEY_${patientRef}`];
  if (!envKey) throw new Error(`No key for patient ${patientRef}`);
  return envKey;
}

// --- HTTP handler -------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function handleGrantAccess(body: string, res: ServerResponse): Promise<void> {
  const req = JSON.parse(body) as GrantAccessRequest;
  const {
    prescriptionId,
    patientRef,
    patientWrappedKeyHex,
    pharmacyPubKeyHex,
    pharmacyAddr,
    karAddress,
  } = req;

  // 1. Unwrap the CEK with the patient key (HSM-backed in production).
  const patientPrivKey = await getPatientPrivKey(patientRef);
  const cek = unwrapCEK(
    patientPrivKey,
    Buffer.from(patientWrappedKeyHex.slice(2), "hex"),
  );

  // 2. Re-wrap the CEK to the pharmacy public key (ECIES).
  const wrappedForPharmacy = wrapCEK(pharmacyPubKeyHex, cek);
  const pharmacyRef = addrToRecipientBytes32(pharmacyAddr);

  // 3. Submit grantAccess, signed by the custodian EOA.
  const hash = await walletClient.writeContract({
    address: karAddress,
    abi: KEY_ACCESS_REGISTRY_ABI,
    functionName: "grantAccess",
    args: [
      prescriptionId,
      pharmacyRef,
      `0x${wrappedForPharmacy.toString("hex")}` as `0x${string}`,
    ],
    chain: besu,
    account,
  });

  // Best-effort: wait for inclusion so callers get a settled receipt.
  await publicClient.waitForTransactionReceipt({ hash });

  sendJson(res, 200, { txHash: hash });
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST" || req.url !== "/grant-access") {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    handleGrantAccess(body, res).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: message });
    });
  });
});

server.listen(PORT, () => {
  console.log(`KMS Signer (custodian ${account.address}) running on :${PORT}`);
});
