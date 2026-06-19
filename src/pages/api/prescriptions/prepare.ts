// src/pages/api/prescriptions/prepare.ts
//
// Pages-Router API route (corrections C4): prescription PREPARE step.
//
// The doctor's client POSTs the prescription fields. This endpoint is
// deterministic and side-effect free: it derives the canonical prescriptionId
// and returns both the canonical (off-chain) payload and the EIP-712 typed
// data the client must sign locally. No PII is persisted or returned beyond
// what the caller already supplied (patientRef is a salted hash, never PII).
//
// Root-level libs are imported via RELATIVE paths — the `@/*` alias maps to
// `src/`, and the root `lib/` directory has NO alias.
import type { NextApiRequest, NextApiResponse } from "next";
import { keccak256, encodePacked, toHex } from "viem";
import { randomBytes } from "crypto";
import {
  EIP712_DOMAIN,
  PRESCRIPTION_TYPES,
} from "../../../../lib/crypto";

const ZERO_HASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

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

  try {
    // 8-byte nonce → bytes8 (collision-resistant per (doctor, patientRef, issuedAt)).
    const nonce = toHex(randomBytes(8));
    const issuedAt = BigInt(Math.floor(Date.now() / 1000));

    // prescriptionId = keccak256(encodePacked(address, bytes32, uint64, bytes8))
    const prescriptionId = keccak256(
      encodePacked(
        ["address", "bytes32", "uint64", "bytes8"],
        [doctorAddress, patientRef, issuedAt, nonce]
      )
    );

    const canonicalPayload = {
      schemaVersion: "1.0.0",
      prescriptionId,
      issuedAt: Number(issuedAt),
      expiresAt,
      doctor: { address: doctorAddress },
      patient: { patientRef },
      medications,
      refillsAllowed: refillsAllowed ?? 0,
    };

    // EIP-712 typed data the client signs locally. payloadHash is unknown at
    // prepare time (it is computed from the encrypted package in submit), so a
    // zero sentinel is returned; the client recomputes the message before
    // signing once the hash is known, OR signs over this structure as agreed.
    const eip712 = {
      domain: EIP712_DOMAIN,
      types: PRESCRIPTION_TYPES,
      primaryType: "Prescription" as const,
      message: {
        prescriptionId,
        doctor: doctorAddress,
        patientRef,
        payloadHash: ZERO_HASH,
        issuedAt: Number(issuedAt),
        expiresAt,
        totalUnits,
        refillsAllowed: refillsAllowed ?? 0,
      },
    };

    return res.status(200).json({
      prescriptionId,
      issuedAt: Number(issuedAt),
      canonicalPayload,
      eip712,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: (error as Error).message ?? "prepare failed" });
  }
}
