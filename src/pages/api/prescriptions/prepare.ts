// src/pages/api/prescriptions/prepare.ts
//
// Pages-Router API route (corrections C4): prescription PREPARE step.
//
// The doctor's client POSTs the prescription fields. This endpoint is
// deterministic given its inputs and has NO external side effects (it does not
// pin anything to IPFS or touch the chain). It:
//   1. Derives the canonical `prescriptionId` (bound to doctor + patientRef +
//      intent timestamp + nonce).
//   2. Builds the canonical (off-chain) payload.
//   3. AES-256-GCM-encrypts that payload under a fresh per-prescription CEK and
//      computes the REAL `payloadHash` = keccak256(packageBytes). This is the
//      exact hash that will be anchored on-chain and that the doctor's EIP-712
//      signature commits to.
//   4. Returns the EIP-712 typed data — including the REAL `payloadHash` and the
//      `verifyingContract` (the PrescriptionRegistry address) — for the client
//      to sign locally, together with the encrypted package + CEK so the
//      stateless `submit` step can re-pin the EXACT bytes and re-verify.
//
// INTEGRITY: there is no zero-hash placeholder. The signature the doctor
// produces over this typed data attests to the actual encrypted content, and
// `submit` re-verifies that binding (recoverTypedDataAddress) before pinning.
//
// No PII is persisted or returned beyond what the caller already supplied
// (patientRef is a salted hash, never PII). The CEK and ciphertext are returned
// only to the doctor's own client (the author of the plaintext), never stored.
//
// Root-level libs are imported via RELATIVE paths — the `@/*` alias maps to
// `src/`, and the root `lib/` directory has NO alias.
import type { NextApiRequest, NextApiResponse } from "next";
import { keccak256, encodePacked, toHex, isAddress } from "viem";
import { randomBytes } from "crypto";
import {
  EIP712_DOMAIN,
  PRESCRIPTION_TYPES,
  generateCEK,
  encrypt,
  packageToBytes,
} from "../../../../lib/crypto";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

interface PrepareRequestBody {
  doctorAddress?: `0x${string}`;
  patientRef?: `0x${string}`;
  medications?: unknown;
  expiresAt?: number;
  totalUnits?: number;
  refillsAllowed?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    doctorAddress,
    patientRef,
    medications,
    expiresAt,
    totalUnits,
    refillsAllowed,
  } = (req.body ?? {}) as PrepareRequestBody;

  if (
    !doctorAddress ||
    !patientRef ||
    !medications ||
    expiresAt === undefined ||
    totalUnits === undefined
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Validate the on-chain-bound identifiers up front so the derived
  // prescriptionId / EIP-712 message cannot be poisoned by malformed input.
  if (!isAddress(doctorAddress)) {
    return res.status(400).json({ error: "Invalid doctorAddress" });
  }
  if (!BYTES32_RE.test(patientRef)) {
    return res.status(400).json({ error: "Invalid patientRef (expected bytes32)" });
  }
  if (!Number.isInteger(expiresAt) || expiresAt <= 0) {
    return res.status(400).json({ error: "Invalid expiresAt" });
  }
  if (!Number.isInteger(totalUnits) || totalUnits <= 0) {
    return res.status(400).json({ error: "Invalid totalUnits" });
  }
  const refills = refillsAllowed ?? 0;
  if (!Number.isInteger(refills) || refills < 0) {
    return res.status(400).json({ error: "Invalid refillsAllowed" });
  }

  // The EIP-712 domain MUST be bound to the PrescriptionRegistry that will hold
  // this prescription. This is the same `verifyingContract` the doctor's wallet
  // signs against and the same one `submit` re-verifies against. Without it the
  // signature would not be domain-separated and could be replayed elsewhere.
  const verifyingContract = process.env
    .PRESCRIPTION_REGISTRY_ADDRESS as `0x${string}` | undefined;
  if (!verifyingContract || !isAddress(verifyingContract)) {
    return res
      .status(500)
      .json({ error: "PRESCRIPTION_REGISTRY_ADDRESS not configured" });
  }

  try {
    // 8-byte nonce → bytes8 (collision-resistant per (doctor, patientRef, issuedAt)).
    const nonce = toHex(randomBytes(8));

    // `issuedAt` here is the doctor's INTENT timestamp (when the prescription
    // was authored). It is what the canonical payload records and what the
    // EIP-712 signature commits to. It is intentionally DISTINCT from the
    // on-chain `issuedAt`, which the contract sets to `block.timestamp` at mine
    // time (PrescriptionRegistry.issuePrescription). The two are not expected to
    // be equal: the off-chain value is the signed authoring time; the on-chain
    // value is the immutable inclusion time. Consumers that need the authoring
    // time read it from the (signed) canonical payload, not from chain state.
    const issuedAt = BigInt(Math.floor(Date.now() / 1000));

    // prescriptionId = keccak256(encodePacked(address, bytes32, uint64, bytes8)).
    // This id is the value the client passes to issuePrescription (the contract
    // enforces uniqueness via its `state != None` check) AND the value the
    // EIP-712 signature commits to — so the doctor's signature binds a specific
    // id to specific content. `submit` re-verifies that this exact id is the one
    // covered by the signature before allowing the prescription to proceed.
    const prescriptionId = keccak256(
      encodePacked(
        ["address", "bytes32", "uint64", "bytes8"],
        [doctorAddress, patientRef, issuedAt, nonce]
      )
    );

    const canonicalPayload = {
      schemaVersion: "1.0.0",
      prescriptionId,
      // Authoring (intent) time — see note above; NOT the on-chain issuedAt.
      issuedAt: Number(issuedAt),
      expiresAt,
      doctor: { address: doctorAddress },
      patient: { patientRef },
      medications,
      totalUnits,
      refillsAllowed: refills,
    };

    // Encrypt the canonical payload under a fresh CEK and compute the REAL
    // payloadHash now. The hash is over the exact bytes that will be pinned to
    // IPFS in `submit`, so the signature below commits to the actual content.
    const cek = generateCEK();
    const encryptedPackage = encrypt(
      cek,
      Buffer.from(JSON.stringify(canonicalPayload), "utf8")
    );
    const payloadHash = keccak256(packageToBytes(encryptedPackage));

    // EIP-712 typed data the client signs locally. payloadHash is the REAL hash
    // (no zero sentinel), and the domain carries the verifyingContract so the
    // signature is domain-separated to this registry. The message field order
    // and types exactly match PRESCRIPTION_TYPES / the on-chain values.
    const message = {
      prescriptionId,
      doctor: doctorAddress,
      patientRef,
      payloadHash,
      issuedAt: Number(issuedAt),
      expiresAt,
      totalUnits,
      refillsAllowed: refills,
    };

    const eip712 = {
      domain: { ...EIP712_DOMAIN, verifyingContract },
      types: PRESCRIPTION_TYPES,
      primaryType: "Prescription" as const,
      message,
    };

    return res.status(200).json({
      prescriptionId,
      issuedAt: Number(issuedAt),
      payloadHash,
      canonicalPayload,
      // Returned so the stateless `submit` step can re-pin the EXACT ciphertext
      // (reproducing `payloadHash`) and wrap this CEK for recipients. These go
      // only to the doctor's own client, which already holds the plaintext.
      encryptedPackage,
      cek: `0x${cek.toString("hex")}`,
      eip712,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: (error as Error).message ?? "prepare failed" });
  }
}
