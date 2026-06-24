// src/pages/api/prescriptions/index.ts
//
// Read-model list endpoint. GET the prescription projection with optional
// filters (?patient=, ?doctor=, ?state=, ?limit=). All filters are validated and
// bound as parameters ($1,$2,...) - no string interpolation of user input.
import type { NextApiRequest, NextApiResponse } from "next";
import { createPool } from "../../../../lib/pg-pool";

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

const pool = createPool();

const STATE_MAP: Record<number, string> = {
  0: "NONE",
  1: "ISSUED",
  2: "PARTIALLY_DISPENSED",
  3: "FULLY_DISPENSED",
  4: "EXPIRED",
  5: "REVOKED",
};

interface Row {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { patient, doctor, state, limit } = req.query;
  const conds: string[] = [];
  const params: unknown[] = [];

  if (typeof patient === "string" && patient) {
    if (!BYTES32_RE.test(patient)) return res.status(400).json({ error: "Invalid patient ref" });
    params.push(Buffer.from(patient.slice(2), "hex"));
    conds.push(`patient_ref = $${params.length}`);
  }
  if (typeof doctor === "string" && doctor) {
    if (!ADDR_RE.test(doctor)) return res.status(400).json({ error: "Invalid doctor address" });
    params.push(Buffer.from(doctor.slice(2), "hex"));
    conds.push(`doctor_addr = $${params.length}`);
  }
  if (typeof state === "string" && state) {
    const s = Number(state);
    if (!Number.isInteger(s) || s < 0 || s > 5) return res.status(400).json({ error: "Invalid state" });
    params.push(s);
    conds.push(`state = $${params.length}`);
  }

  const lim = Math.min(200, Math.max(1, Number(limit) || 50));
  params.push(lim);
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  try {
    const { rows } = await pool.query<Row>(
      `SELECT prescription_id, doctor_addr, patient_ref, cid, payload_hash, issued_at,
              expires_at, total_units, dispensed_units, refills_allowed, refills_used, state
         FROM prescription ${where}
        ORDER BY updated_block DESC, updated_log_index DESC
        LIMIT $${params.length}`,
      params
    );
    return res.status(200).json(
      rows.map((r) => ({
        prescriptionId: "0x" + r.prescription_id.toString("hex"),
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
      }))
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: (error as Error).message ?? "list failed" });
  }
}
