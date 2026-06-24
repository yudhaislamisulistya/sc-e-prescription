// services/kms-signer/index.ts
//
// KMS signer microservice - patient-custodian CEK re-wrap (spec §10.5, mitigates V2).
//
// This service holds the PATIENT_CUSTODIAN_ROLE service EOA (KMS_SERVICE_KEY).
// It is the ONLY actor allowed to re-distribute a patient's content-encryption
// key (CEK) on their behalf. There is NO shared hot-wallet: the custodian EOA is
// scoped to a single role and never co-signs doctor/pharmacist transactions.
//
// Flow of POST /grant-access:
//   1. AUTHENTICATE the caller with a shared internal service token
//      (KMS_INTERNAL_TOKEN), constant-time compared. The service is reachable
//      from the internet-facing nextjs-app on the shared app-net, so a missing
//      app-layer check would let any SSRF/app-compromise reach the CEK unwrap.
//   2. AUTHORIZE the recipient on-chain: the pharmacist must currently hold an
//      ACTIVE PHARMACIST_ROLE (IdentityRegistry.isAuthorized).
//   3. BIND the wrap target to identity: the CEK is ALWAYS re-wrapped to the
//      pharmacist's AUTHORITATIVE on-chain encryption pubkey
//      (IdentityRegistry.getEncryptionPubKeyByAddress(pharmacyAddr)), NEVER to a
//      caller-supplied pubkey. The caller-supplied `pharmacyPubKeyHex` is only
//      accepted as an assertion and is REJECTED on any mismatch. This closes the
//      CEK-exfiltration hole where on-chain address eligibility and the off-chain
//      wrap target were unbound (an attacker could pass a real pharmacist address
//      but their OWN pubkey and recover the plaintext CEK from the public chain).
//   4. Unwrap the per-prescription CEK using the PATIENT private key. In
//      production this MUST be a non-extractable key operation inside an HSM
//      (AWS KMS / HashiCorp Vault Transit) - the raw private key NEVER leaves
//      the boundary; the service only receives the decrypted CEK. The
//      `getPatientPrivKey` abstraction below models that boundary; its
//      process.env fallback is DEV ONLY and is HARD-DISABLED when
//      NODE_ENV==="production".
//   5. Re-wrap (ECIES) the CEK to the verified pharmacy pubkey via `wrapCEK`.
//   6. Submit `grantAccess(prescriptionId, recipientBytes32, wrappedKey)` to the
//      KeyAccessRegistry, signed by the custodian EOA via a viem walletClient.
//
// NOTE ON RUNTIME VERIFICATION: this file is type-checked (`tsc --noEmit`) but is
// NOT runtime-verified in this workspace - Besu, IPFS and the deployed
// KeyAccessRegistry are unavailable here. It is scaffolding for the
// docker-compose deployment.
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync } from "fs";
import { timingSafeEqual } from "crypto";
import { createWalletClient, createPublicClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unwrapCEK, wrapCEK, addrToRecipientBytes32 } from "../../lib/crypto";

// --- Configuration -----------------------------------------------------------

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Read a secret from its env var, falling back to a Docker file secret
 * (`<NAME>_FILE` path, or the conventional /run/secrets/<lower-name>). This lets
 * docker-compose supply the value as a file secret (the only mechanism the
 * compose block uses) WITHOUT the operator also having to export it as an env
 * var - which previously crash-looped the container.
 */
function readSecret(name: string, defaultFile: string): string | undefined {
  const direct = process.env[name];
  if (direct && direct.length > 0) return direct;
  const filePath = process.env[`${name}_FILE`] || defaultFile;
  try {
    const v = readFileSync(filePath, "utf8").trim();
    return v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

const rawServiceKey = readSecret("KMS_SERVICE_KEY", "/run/secrets/kms_service_key");
if (!rawServiceKey) {
  throw new Error(
    "KMS_SERVICE_KEY not set (provide env KMS_SERVICE_KEY, KMS_SERVICE_KEY_FILE, or the /run/secrets/kms_service_key docker secret)",
  );
}
const serviceKey = (
  rawServiceKey.startsWith("0x") ? rawServiceKey : `0x${rawServiceKey}`
) as `0x${string}`;

// Shared internal auth token. The /grant-access endpoint is for SERVER-TO-SERVER
// use only; without this the endpoint would have ZERO app-layer auth and be
// reachable from the internet-facing app over app-net.
const INTERNAL_TOKEN = readSecret("KMS_INTERNAL_TOKEN", "/run/secrets/kms_internal_token");
if (!INTERNAL_TOKEN) {
  throw new Error(
    "KMS_INTERNAL_TOKEN not set (provide env KMS_INTERNAL_TOKEN, KMS_INTERNAL_TOKEN_FILE, or the /run/secrets/kms_internal_token docker secret)",
  );
}
const INTERNAL_TOKEN_BUF = Buffer.from(INTERNAL_TOKEN, "utf8");

const identityRegistryAddressEnv = process.env.IDENTITY_REGISTRY_ADDRESS;
if (!identityRegistryAddressEnv) {
  throw new Error(
    "IDENTITY_REGISTRY_ADDRESS not set (deployed IdentityRegistry address; required to verify pharmacist identity + authoritative pubkey)",
  );
}
const IDENTITY_REGISTRY_ADDRESS = identityRegistryAddressEnv as `0x${string}`;

// The KeyAccessRegistry is PINNED at startup from the environment. The custodian
// EOA must only ever sign grantAccess to this single audited contract; accepting
// a caller-supplied target would let any authenticated caller make the custodian
// sign a transaction to an arbitrary contract address. Fail closed if unset.
const keyAccessRegistryAddressEnv = process.env.KEY_ACCESS_REGISTRY_ADDRESS;
if (!keyAccessRegistryAddressEnv) {
  throw new Error(
    "KEY_ACCESS_REGISTRY_ADDRESS not set (deployed KeyAccessRegistry address; the only contract this service is allowed to call)",
  );
}
const KEY_ACCESS_REGISTRY_ADDRESS = keyAccessRegistryAddressEnv as `0x${string}`;

const RPC_URL = process.env.RPC_URL || "http://localhost:8545";
const PORT = Number(process.env.KMS_PORT || process.env.PORT || 4000);

// Hard cap on request body size. /grant-access payloads are a few hundred bytes;
// 64 KiB is generous. Without this, an unauthenticated client could stream an
// arbitrarily large body and exhaust the process heap (memory-exhaustion DoS).
const MAX_BODY_BYTES = 64 * 1024;

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

// Minimal ABI fragment for the single state-changing call this service makes.
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

// Minimal ABI fragments for the authoritative identity lookups. These are the
// on-chain source of truth that BINDS address-eligibility to the wrap target.
const IDENTITY_REGISTRY_ABI = [
  {
    name: "PHARMACIST_ROLE",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    name: "isAuthorized",
    type: "function",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "getEncryptionPubKeyByAddress",
    type: "function",
    inputs: [{ name: "actor", type: "address" }],
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "view",
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
  /**
   * Uncompressed secp256k1 pubkey of the pharmacy recipient (hex). ADVISORY
   * ONLY: the service ignores this for the actual wrap and instead uses the
   * authoritative on-chain pubkey. If provided, it MUST match the on-chain key
   * (a mismatch is rejected as a 409).
   */
  pharmacyPubKeyHex?: string;
  /** Pharmacy EOA address - the authoritative identity for both auth + pubkey. */
  pharmacyAddr: `0x${string}`;
}

// --- Key boundary -------------------------------------------------------------

/**
 * Resolve the patient's private key material for an unwrap operation.
 *
 * PRODUCTION: this MUST be implemented as a NON-EXTRACTABLE key operation backed
 * by AWS KMS (`Decrypt`/`asymmetric`) or HashiCorp Vault Transit. The private key
 * never leaves the HSM boundary - the HSM performs the ECIES unwrap and returns
 * only the CEK. The string return type here is a DEV stand-in for that boundary.
 *
 * DEV ONLY: the `process.env.PATIENT_KEY_<patientRef>` fallback below loads a raw
 * private key from the environment. This path is HARD-DISABLED under
 * NODE_ENV==="production" - there is no HSM integration in this scaffold, so a
 * production deployment that reached this code would otherwise be silently
 * holding raw patient keys in its environment. It throws instead.
 */
async function getPatientPrivKey(patientRef: string): Promise<string> {
  if (IS_PRODUCTION) {
    throw new Error(
      "patient key resolution is not configured for production: the env-key dev fallback is disabled under NODE_ENV=production and no HSM/KMS backend is wired up",
    );
  }
  const envKey = process.env[`PATIENT_KEY_${patientRef}`];
  if (!envKey) throw new Error(`No key for patient ${patientRef}`);
  return envKey;
}

// --- Helpers ------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

/** Constant-time bearer-token check. */
function isAuthenticated(req: IncomingMessage): boolean {
  const header = req.headers["authorization"];
  if (typeof header !== "string") return false;
  const presented = header.startsWith("Bearer ") ? header.slice(7) : header;
  const presentedBuf = Buffer.from(presented, "utf8");
  if (presentedBuf.length !== INTERNAL_TOKEN_BUF.length) return false;
  return timingSafeEqual(presentedBuf, INTERNAL_TOKEN_BUF);
}

/** Normalize a hex pubkey for comparison (lowercase, no 0x). */
function normalizePubKey(hex: string): string {
  return hex.toLowerCase().replace(/^0x/, "");
}

// --- HTTP handler -------------------------------------------------------------

async function handleGrantAccess(body: string, res: ServerResponse): Promise<void> {
  const req = JSON.parse(body) as GrantAccessRequest;
  const {
    prescriptionId,
    patientRef,
    patientWrappedKeyHex,
    pharmacyPubKeyHex,
    pharmacyAddr,
  } = req;

  if (!prescriptionId || !patientRef || !patientWrappedKeyHex || !pharmacyAddr) {
    sendJson(res, 400, { error: "Missing required field" });
    return;
  }

  // 1. AUTHORIZE: pharmacist must currently hold an ACTIVE PHARMACIST_ROLE.
  //    The role constant is read from the contract so it can never drift.
  const pharmacistRole = await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "PHARMACIST_ROLE",
  });
  const authorized = await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "isAuthorized",
    args: [pharmacistRole, pharmacyAddr],
  });
  if (!authorized) {
    sendJson(res, 403, { error: "recipient is not an active pharmacist" });
    return;
  }

  // 2. BIND the wrap target to identity: fetch the AUTHORITATIVE on-chain pubkey.
  //    The CEK is re-wrapped to THIS key only - never to a caller-supplied one.
  const onChainPubKeyBytes = (await publicClient.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: "getEncryptionPubKeyByAddress",
    args: [pharmacyAddr],
  })) as `0x${string}`;
  if (!onChainPubKeyBytes || onChainPubKeyBytes === "0x") {
    sendJson(res, 422, { error: "no registered encryption pubkey for pharmacist" });
    return;
  }

  // If the caller asserted a pubkey, it MUST match the authoritative one.
  if (
    pharmacyPubKeyHex &&
    normalizePubKey(pharmacyPubKeyHex) !== normalizePubKey(onChainPubKeyBytes)
  ) {
    sendJson(res, 409, {
      error: "supplied pharmacyPubKeyHex does not match the on-chain registered key",
    });
    return;
  }

  // 3. Unwrap the CEK with the patient key (HSM-backed in production).
  const patientPrivKey = await getPatientPrivKey(patientRef);
  const cek = unwrapCEK(
    patientPrivKey,
    Buffer.from(patientWrappedKeyHex.slice(2), "hex"),
  );

  // 4. Re-wrap the CEK to the VERIFIED on-chain pharmacy public key (ECIES).
  const wrappedForPharmacy = wrapCEK(onChainPubKeyBytes, cek);
  const pharmacyRef = addrToRecipientBytes32(pharmacyAddr);

  // 5. Submit grantAccess to the PINNED KeyAccessRegistry, signed by the
  //    custodian EOA. The target address is never caller-controlled.
  const hash = await walletClient.writeContract({
    address: KEY_ACCESS_REGISTRY_ADDRESS,
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

  // App-layer authentication BEFORE reading/parsing any body.
  if (!isAuthenticated(req)) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  // Reject oversized bodies up front via Content-Length when present.
  const declaredLen = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY_BYTES) {
    sendJson(res, 413, { error: "request body too large" });
    req.destroy();
    return;
  }

  // Bounded streaming buffer: abort as soon as the cap is exceeded so a chunked
  // / Content-Length-spoofing client cannot exhaust the heap.
  const chunks: Buffer[] = [];
  let received = 0;
  let aborted = false;

  req.on("data", (chunk: Buffer) => {
    if (aborted) return;
    received += chunk.length;
    if (received > MAX_BODY_BYTES) {
      aborted = true;
      sendJson(res, 413, { error: "request body too large" });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", () => {
    if (aborted) return;
    const body = Buffer.concat(chunks).toString("utf8");
    handleGrantAccess(body, res).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: message });
    });
  });

  req.on("error", () => {
    if (!aborted) {
      aborted = true;
      try {
        sendJson(res, 400, { error: "request stream error" });
      } catch {
        /* response may already be sent */
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`KMS Signer (custodian ${account.address}) running on :${PORT}`);
});
