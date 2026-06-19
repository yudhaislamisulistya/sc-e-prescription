// src/pages/api/prescriptions/submit.ts
//
// Pages-Router API route (corrections C4): prescription SUBMIT step.
//
// The client POSTs the canonical payload (from /prepare) plus the doctor's
// EIP-712 signature. This endpoint:
//   1. Inlines the signature into the canonical payload.
//   2. AES-256-GCM encrypts the signed payload under a fresh per-prescription
//      CEK and pins ONLY the encrypted bytes to IPFS (encryptAndUpload).
//   3. Reads the patient's encryption pubkey from IdentityRegistry on-chain via
//      a viem publicClient (IDENTITY_REGISTRY_ADDRESS + RPC_URL).
//   4. ECIES-wraps the CEK for the patient.
//   5. Returns { cid, payloadHash, wrappedForPatient } — never any PII.
//
// The on-chain issuePrescription + grantAccess calls are made by the client
// with the returned cid / payloadHash / wrappedForPatient.
//
// Root-level libs are imported via RELATIVE paths — the `@/*` alias maps to
// `src/`, and the root `lib/` directory has NO alias.
import type { NextApiRequest, NextApiResponse } from "next";
import { createPublicClient, http } from "viem";
import { generateCEK, wrapCEK } from "../../../../lib/crypto";
import { encryptAndUpload } from "../../../../lib/ipfs-encrypted";

const IDENTITY_REGISTRY_ABI = [
  {
    name: "getEncryptionPubKeyByRef",
    type: "function",
    inputs: [{ name: "patientRef", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "view",
  },
] as const;

interface SubmitRequestBody {
  prescriptionId?: `0x${string}`;
  patientRef?: `0x${string}`;
  canonicalPayload?: Record<string, unknown>;
  eip712Signature?: `0x${string}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prescriptionId, patientRef, canonicalPayload, eip712Signature } =
    (req.body ?? {}) as SubmitRequestBody;

  if (!prescriptionId || !patientRef || !canonicalPayload || !eip712Signature) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const identityRegistryAddr = process.env
    .IDENTITY_REGISTRY_ADDRESS as `0x${string}` | undefined;
  if (!identityRegistryAddr) {
    return res
      .status(500)
      .json({ error: "IDENTITY_REGISTRY_ADDRESS not configured" });
  }

  try {
    // 1. Inline the doctor's signature into the canonical payload.
    const payloadWithSig = {
      ...canonicalPayload,
      signature: { scheme: "EIP-712", value: eip712Signature },
    };
    const plaintextBuffer = Buffer.from(JSON.stringify(payloadWithSig), "utf8");

    // 2. Encrypt under a fresh CEK and pin ONLY the encrypted bytes to IPFS.
    const cek = generateCEK();
    const { cid, payloadHash } = await encryptAndUpload(plaintextBuffer, cek);

    // 3. Read the patient's encryption pubkey from IdentityRegistry on-chain.
    const publicClient = createPublicClient({
      transport: http(process.env.RPC_URL || "http://localhost:8545"),
    });
    const patientEncPubKey = await publicClient.readContract({
      address: identityRegistryAddr,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: "getEncryptionPubKeyByRef",
      args: [patientRef],
    });

    if (!patientEncPubKey || patientEncPubKey === "0x") {
      return res
        .status(404)
        .json({ error: "Patient encryption pubkey not found" });
    }

    // 4. ECIES-wrap the CEK for the patient.
    const wrappedForPatient = wrapCEK(patientEncPubKey as string, cek);

    // 5. Return only non-PII envelope material.
    return res.status(200).json({
      cid,
      payloadHash,
      wrappedForPatient: `0x${wrappedForPatient.toString("hex")}`,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: (error as Error).message ?? "submit failed" });
  }
}
