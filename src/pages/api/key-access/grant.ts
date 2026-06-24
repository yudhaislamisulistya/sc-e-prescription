// src/pages/api/key-access/grant.ts
//
// Pages-Router API route (corrections C4): grant a PHARMACY access to a
// prescription's content-encryption key (CEK).
//
// The web tier NEVER touches patient key material. It only:
//   1. Validates inputs.
//   2. Resolves the prescription's patientRef from the chain (source of truth).
//   3. Reads the patient-wrapped CEK from the KeyAccessRegistry (public on-chain
//      ECIES blob - readable by anyone, decryptable only by the patient key).
//   4. Delegates the unwrap -> re-wrap -> on-chain grantAccess to the kms-signer
//      microservice, authenticating with the shared internal bearer token.
//
// The kms-signer (PATIENT_CUSTODIAN_ROLE) performs the privileged custody work
// and re-verifies the pharmacist on-chain. The KeyAccessRegistry address is
// pinned inside the kms-signer, so this route does not pass a contract target.
//
// RESIDUAL (production hardening): a patient-signed EIP-712 consent over
// (prescriptionId, pharmacyAddr, expiry, nonce) should gate this route so a
// compromised app cannot grant access unilaterally. That is out of scope for
// this scaffold; the kms-signer's bearer auth + on-chain pharmacist check are
// the controls implemented here.
//
// Root-level libs would be imported via RELATIVE paths; this route needs none.
import type { NextApiRequest, NextApiResponse } from "next";
import { createPublicClient, http, isAddress } from "viem";
import { readFileSync } from "fs";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

const PRESCRIPTION_REGISTRY_ABI = [
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

const KEY_ACCESS_REGISTRY_ABI = [
  {
    name: "getWrappedKey",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "prescriptionId", type: "bytes32" },
      { name: "recipient", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
] as const;

/** Read the shared internal bearer token from env or the mounted file secret. */
function readInternalToken(): string | undefined {
  if (process.env.KMS_INTERNAL_TOKEN) return process.env.KMS_INTERNAL_TOKEN;
  const file =
    process.env.KMS_INTERNAL_TOKEN_FILE || "/run/secrets/kms_internal_token";
  try {
    const v = readFileSync(file, "utf8").trim();
    return v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prescriptionId, pharmacyAddr } = (req.body ?? {}) as {
    prescriptionId?: string;
    pharmacyAddr?: string;
  };

  if (!prescriptionId || !pharmacyAddr) {
    return res
      .status(400)
      .json({ error: "prescriptionId and pharmacyAddr are required" });
  }
  if (!BYTES32_RE.test(prescriptionId)) {
    return res.status(400).json({ error: "Invalid prescriptionId" });
  }
  if (!isAddress(pharmacyAddr)) {
    return res.status(400).json({ error: "Invalid pharmacyAddr" });
  }

  const prescriptionRegistry = process.env
    .PRESCRIPTION_REGISTRY_ADDRESS as `0x${string}` | undefined;
  const keyAccessRegistry = process.env
    .KEY_ACCESS_REGISTRY_ADDRESS as `0x${string}` | undefined;
  const kmsUrl = process.env.KMS_SIGNER_URL || "http://localhost:4000";
  const internalToken = readInternalToken();

  if (!prescriptionRegistry || !isAddress(prescriptionRegistry)) {
    return res
      .status(500)
      .json({ error: "PRESCRIPTION_REGISTRY_ADDRESS not configured" });
  }
  if (!keyAccessRegistry || !isAddress(keyAccessRegistry)) {
    return res
      .status(500)
      .json({ error: "KEY_ACCESS_REGISTRY_ADDRESS not configured" });
  }
  if (!internalToken) {
    return res.status(500).json({ error: "KMS internal token not configured" });
  }

  try {
    const publicClient = createPublicClient({
      transport: http(process.env.RPC_URL || "http://localhost:8545"),
    });

    // 1. Resolve patientRef from the prescription (chain is the source of truth).
    const presc = await publicClient.readContract({
      address: prescriptionRegistry,
      abi: PRESCRIPTION_REGISTRY_ABI,
      functionName: "getPrescription",
      args: [prescriptionId as `0x${string}`],
    });
    if (!presc.patientRef || presc.state === 0) {
      return res.status(404).json({ error: "prescription not found" });
    }
    const patientRef = presc.patientRef;

    // 2. Read the patient-wrapped CEK (public on-chain ECIES blob).
    const patientWrappedKeyHex = (await publicClient.readContract({
      address: keyAccessRegistry,
      abi: KEY_ACCESS_REGISTRY_ABI,
      functionName: "getWrappedKey",
      args: [prescriptionId as `0x${string}`, patientRef],
    })) as `0x${string}`;
    if (!patientWrappedKeyHex || patientWrappedKeyHex === "0x") {
      return res.status(409).json({
        error: "no patient-wrapped key recorded for this prescription",
      });
    }

    // 3. Delegate unwrap -> re-wrap -> on-chain grantAccess to the kms-signer.
    const kmsRes = await fetch(`${kmsUrl}/grant-access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalToken}`,
      },
      body: JSON.stringify({
        prescriptionId,
        patientRef,
        patientWrappedKeyHex,
        pharmacyAddr,
      }),
    });
    const data = await kmsRes.json().catch(() => ({}));
    if (!kmsRes.ok) {
      // Do not leak an upstream 401 as a client 401 (would imply the END user is
      // unauthenticated); surface it as a bad-gateway condition instead.
      const status = kmsRes.status === 401 ? 502 : kmsRes.status;
      return res.status(status).json({ error: "KMS grant-access failed", detail: data });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: (error as Error).message ?? "grant failed" });
  }
}
