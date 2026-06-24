// src/pages/api/prescriptions/submit.ts
//
// Pages-Router API route (corrections C4): prescription SUBMIT step.
//
// The client POSTs the canonical payload (from /prepare), the encrypted package
// and CEK produced by /prepare, and the doctor's EIP-712 signature. This
// endpoint REFUSES to do any work until it has cryptographically verified that:
//
//   1. The signature recovers to canonicalPayload.doctor.address (the doctor
//      who authored the content actually signed THIS content).
//   2. The signature commits to the REAL payloadHash recomputed from the
//      supplied encrypted package (not a client-asserted hash, not a zero
//      sentinel) — closing the integrity hole where a signature could be paired
//      with arbitrary ciphertext.
//   3. The on-chain-bound identifiers the caller asks us to act on
//      (prescriptionId, patientRef) match the signed canonical payload.
//
// Only after ALL of those checks pass does it:
//   4. Pin the EXACT encrypted bytes to IPFS (uploadPackage — no re-encryption,
//      so the pinned hash equals the signed hash).
//   5. Read the patient's encryption pubkey from IdentityRegistry on-chain.
//   6. ECIES-wrap the CEK for the patient.
//   7. Return { cid, payloadHash, wrappedForPatient } — never any PII.
//
// This is the authorization gate for the route: an unauthenticated caller
// cannot get arbitrary content encrypted/pinned/wrapped because they cannot
// produce a doctor signature over content of their choosing. The on-chain
// issuePrescription + grantAccess calls are still made by the client with the
// returned cid / payloadHash / wrappedForPatient.
//
// Root-level libs are imported via RELATIVE paths — the `@/*` alias maps to
// `src/`, and the root `lib/` directory has NO alias.
import type { NextApiRequest, NextApiResponse } from "next";
import {
  createPublicClient,
  http,
  isAddress,
  keccak256,
  recoverTypedDataAddress,
  getAddress,
} from "viem";
import {
  wrapCEK,
  packageToBytes,
  decrypt,
  EIP712_DOMAIN,
  PRESCRIPTION_TYPES,
  type EncryptedPackage,
} from "../../../../lib/crypto";
import { uploadPackage } from "../../../../lib/ipfs-encrypted";

const IDENTITY_REGISTRY_ABI = [
  {
    name: "getEncryptionPubKeyByRef",
    type: "function",
    inputs: [{ name: "patientRef", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "view",
  },
] as const;

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const CEK_HEX_RE = /^(0x)?[0-9a-fA-F]{64}$/; // 32-byte CEK

interface SubmitRequestBody {
  prescriptionId?: `0x${string}`;
  patientRef?: `0x${string}`;
  canonicalPayload?: Record<string, unknown>;
  encryptedPackage?: EncryptedPackage;
  cek?: string;
  eip712Signature?: `0x${string}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    prescriptionId,
    patientRef,
    canonicalPayload,
    encryptedPackage,
    cek,
    eip712Signature,
  } = (req.body ?? {}) as SubmitRequestBody;

  if (
    !prescriptionId ||
    !patientRef ||
    !canonicalPayload ||
    !encryptedPackage ||
    !cek ||
    !eip712Signature
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!BYTES32_RE.test(prescriptionId)) {
    return res.status(400).json({ error: "Invalid prescriptionId" });
  }
  if (!BYTES32_RE.test(patientRef)) {
    return res.status(400).json({ error: "Invalid patientRef" });
  }
  if (!CEK_HEX_RE.test(cek)) {
    return res.status(400).json({ error: "Invalid cek" });
  }
  const cekBuf = Buffer.from(cek.replace(/^0x/, ""), "hex");

  const identityRegistryAddr = process.env
    .IDENTITY_REGISTRY_ADDRESS as `0x${string}` | undefined;
  if (!identityRegistryAddr || !isAddress(identityRegistryAddr)) {
    return res
      .status(500)
      .json({ error: "IDENTITY_REGISTRY_ADDRESS not configured" });
  }

  const verifyingContract = process.env
    .PRESCRIPTION_REGISTRY_ADDRESS as `0x${string}` | undefined;
  if (!verifyingContract || !isAddress(verifyingContract)) {
    return res
      .status(500)
      .json({ error: "PRESCRIPTION_REGISTRY_ADDRESS not configured" });
  }

  try {
    // -----------------------------------------------------------------------
    // STEP A — Recompute the payloadHash from the supplied ciphertext. We never
    // trust a client-asserted hash; the hash is derived from the exact bytes we
    // will pin, so it is the value the signature must commit to.
    // -----------------------------------------------------------------------
    const pkgBytes = packageToBytes(encryptedPackage);
    const payloadHash = keccak256(pkgBytes);

    // -----------------------------------------------------------------------
    // STEP B — Extract the signed fields from the canonical payload itself
    // (NOT from loose top-level body fields a caller could vary independently).
    // -----------------------------------------------------------------------
    const doctorAddress = (canonicalPayload as { doctor?: { address?: unknown } })
      ?.doctor?.address;
    const payloadPatientRef = (
      canonicalPayload as { patient?: { patientRef?: unknown } }
    )?.patient?.patientRef;
    const payloadPrescriptionId = (canonicalPayload as { prescriptionId?: unknown })
      .prescriptionId;
    const payloadIssuedAt = (canonicalPayload as { issuedAt?: unknown }).issuedAt;
    const payloadExpiresAt = (canonicalPayload as { expiresAt?: unknown }).expiresAt;
    const payloadTotalUnits = (canonicalPayload as { totalUnits?: unknown })
      .totalUnits;
    const payloadRefills = (canonicalPayload as { refillsAllowed?: unknown })
      .refillsAllowed;

    if (
      typeof doctorAddress !== "string" ||
      !isAddress(doctorAddress) ||
      typeof payloadPatientRef !== "string" ||
      !BYTES32_RE.test(payloadPatientRef) ||
      typeof payloadPrescriptionId !== "string" ||
      !BYTES32_RE.test(payloadPrescriptionId) ||
      typeof payloadIssuedAt !== "number" ||
      typeof payloadExpiresAt !== "number" ||
      typeof payloadTotalUnits !== "number" ||
      (typeof payloadRefills !== "number" && payloadRefills !== undefined)
    ) {
      return res
        .status(400)
        .json({ error: "Malformed canonicalPayload" });
    }

    // -----------------------------------------------------------------------
    // STEP C — Bind the request to the signed payload. The on-chain-bound
    // identifiers the caller passes MUST equal those inside the signed payload,
    // otherwise a valid signature for payload X could be used to act on Y.
    // -----------------------------------------------------------------------
    if (prescriptionId.toLowerCase() !== payloadPrescriptionId.toLowerCase()) {
      return res.status(400).json({
        error: "prescriptionId does not match canonicalPayload",
      });
    }
    if (patientRef.toLowerCase() !== payloadPatientRef.toLowerCase()) {
      return res
        .status(400)
        .json({ error: "patientRef does not match canonicalPayload" });
    }

    // -----------------------------------------------------------------------
    // STEP D — THE INTEGRITY GATE. Reconstruct the exact EIP-712 message
    // (including the REAL payloadHash from STEP A) and recover the signer. The
    // signature is only accepted if it recovers to the doctor named in the
    // signed payload. This proves: (1) the doctor signed, and (2) the doctor
    // signed THIS ciphertext (via payloadHash) — not a zero hash and not some
    // other content. Any mismatch between signature, content, doctor, or id is
    // rejected here before a single side effect occurs.
    // -----------------------------------------------------------------------
    const message = {
      prescriptionId: payloadPrescriptionId as `0x${string}`,
      doctor: doctorAddress as `0x${string}`,
      patientRef: payloadPatientRef as `0x${string}`,
      payloadHash,
      issuedAt: BigInt(payloadIssuedAt),
      expiresAt: BigInt(payloadExpiresAt),
      totalUnits: payloadTotalUnits,
      refillsAllowed: typeof payloadRefills === "number" ? payloadRefills : 0,
    };

    let recovered: `0x${string}`;
    try {
      recovered = await recoverTypedDataAddress({
        domain: { ...EIP712_DOMAIN, verifyingContract },
        types: PRESCRIPTION_TYPES,
        primaryType: "Prescription",
        message,
        signature: eip712Signature,
      });
    } catch {
      return res
        .status(401)
        .json({ error: "Invalid EIP-712 signature" });
    }

    if (getAddress(recovered) !== getAddress(doctorAddress)) {
      // Signature does not attest to this content from this doctor.
      return res.status(401).json({
        error: "Signature does not recover to canonicalPayload.doctor.address",
      });
    }

    // -----------------------------------------------------------------------
    // STEP E — Verified. Defense in depth: confirm the supplied CEK actually
    // decrypts the supplied package AND that the package's plaintext is the
    // canonical payload that was signed. This proves cek↔ciphertext↔payload
    // consistency before we wrap the CEK for the patient (a wrong CEK would
    // pin un-decryptable content). AES-GCM throws on any tamper/wrong key.
    // -----------------------------------------------------------------------
    let decryptedBytes: Buffer;
    try {
      decryptedBytes = decrypt(cekBuf, encryptedPackage);
    } catch {
      return res
        .status(400)
        .json({ error: "CEK does not decrypt the supplied package" });
    }
    if (
      keccak256(decryptedBytes) !==
      keccak256(Buffer.from(JSON.stringify(canonicalPayload), "utf8"))
    ) {
      return res.status(400).json({
        error: "Encrypted package does not contain the canonical payload",
      });
    }

    // 4. Pin the EXACT encrypted bytes to IPFS (no re-encryption → hash matches).
    const { cid, payloadHash: pinnedHash } = await uploadPackage(encryptedPackage);
    if (pinnedHash !== payloadHash) {
      // Should never happen (same bytes), but never anchor a mismatched hash.
      return res
        .status(500)
        .json({ error: "Internal payloadHash mismatch after pin" });
    }

    // 5. Read the patient's encryption pubkey from IdentityRegistry on-chain.
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

    // 6. ECIES-wrap the CEK for the patient.
    const wrappedForPatient = wrapCEK(patientEncPubKey as string, cekBuf);

    // 7. Return only non-PII envelope material.
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
