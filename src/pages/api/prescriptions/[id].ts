// src/pages/api/prescriptions/[id].ts
//
// Pages-Router API route (corrections C4): read one prescription's CURRENT state
// from the Postgres read-model (the event-indexer projection of on-chain state).
//
// This is a read-only projection query. It returns only non-PII fields: the
// patientRef is a salted hash (never PII), and wrapped keys / ciphertext are not
// in this table at all. The id is validated as a bytes32 and bound via a
// PARAMETERIZED query ($1) — no string interpolation, so no SQL injection.
//
// Root-level lib imported via a RELATIVE path — root `lib/` has no tsconfig alias.
import type { NextApiRequest, NextApiResponse } from "next";
import { createPool } from "../../../../lib/pg-pool";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

// One shared pool for the route module.
const pool = createPool();

const STATE_MAP: Record<number, string> = {
  0: "NONE",
  1: "ISSUED",
  2: "PARTIALLY_DISPENSED",
  3: "FULLY_DISPENSED",
  4: "EXPIRED",
  5: "REVOKED",
};

interface PrescriptionRow {
  prescription_id: Buffer;
  doctor_addr: Buffer;
  patient_ref: Buffer;
  cid: string;
  payload_hash: Buffer;
  issued_at: string;
  expires_at: string;
  total_units: number;
  dispensed_units: number;
  refills_allowed: number | null;
  refills_used: number;
  state: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = req.query.id;
  if (typeof id !== "string" || !BYTES32_RE.test(id)) {
    return res.status(400).json({ error: "Invalid prescription id (bytes32)" });
  }

  try {
    const { rows } = await pool.query<PrescriptionRow>(
      `SELECT prescription_id, doctor_addr, patient_ref, cid, payload_hash,
              issued_at, expires_at, total_units, dispensed_units,
              refills_allowed, refills_used, state
         FROM prescription
        WHERE prescription_id = $1`,
      [Buffer.from(id.slice(2), "hex")]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    const r = rows[0];
    return res.status(200).json({
      prescriptionId: id,
      doctorAddr: "0x" + r.doctor_addr.toString("hex"),
      patientRef: "0x" + r.patient_ref.toString("hex"),
      cid: r.cid,
      payloadHash: "0x" + r.payload_hash.toString("hex"),
      issuedAt: Number(r.issued_at),
      expiresAt: Number(r.expires_at),
      totalUnits: r.total_units,
      dispensedUnits: r.dispensed_units,
      refillsAllowed: r.refills_allowed,
      refillsUsed: r.refills_used,
      state: r.state,
      stateLabel: STATE_MAP[r.state] ?? String(r.state),
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: (error as Error).message ?? "read failed" });
  }
}
