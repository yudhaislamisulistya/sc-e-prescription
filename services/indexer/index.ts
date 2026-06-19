// services/indexer/index.ts
//
// Event indexer for the e-prescription read model (spec §10.4).
//
// Polls the chain with viem `getLogs`, decodes PrescriptionRegistry events, and
// upserts them into Postgres via the `pg` Pool using PARAMETERIZED queries
// ($1,$2,...). The block range is chunked (~100 blocks) and `indexer_cursor`
// advances only after a chunk is fully written, so a crash safely resumes.
//
// IMPORTANT: the parseAbiItem signatures below are copied verbatim from
// contracts/PrescriptionRegistry.sol. The on-chain `State newState` enum
// argument of PrescriptionDispensed is `uint8` in the compiled ABI — a single
// type/name mismatch here makes viem compute a different topic0 and silently
// index nothing.
import { createPublicClient, http, parseAbiItem } from "viem";
import { Pool } from "pg";

// Mirror of IPrescriptionRegistry.State (kept for human-readable audit payloads).
const STATE_MAP: Record<number, string> = {
  0: "NONE",
  1: "ISSUED",
  2: "PARTIALLY_DISPENSED",
  3: "FULLY_DISPENSED",
  4: "EXPIRED",
  5: "REVOKED",
};

// --- Event ABIs (EXACT signatures from contracts/PrescriptionRegistry.sol) ---
const PRESCRIPTION_ISSUED_ABI = parseAbiItem(
  "event PrescriptionIssued(bytes32 indexed prescriptionId, address indexed doctor, bytes32 indexed patientRef, string cid, bytes32 payloadHash, uint64 issuedAt, uint64 expiresAt, uint32 totalUnits)"
);
const PRESCRIPTION_DISPENSED_ABI = parseAbiItem(
  "event PrescriptionDispensed(bytes32 indexed prescriptionId, address indexed pharmacist, uint32 units, uint32 dispensedUnits, uint8 newState)"
);
const PRESCRIPTION_REVOKED_ABI = parseAbiItem(
  "event PrescriptionRevoked(bytes32 indexed prescriptionId, address indexed by)"
);
const PRESCRIPTION_EXPIRED_ABI = parseAbiItem(
  "event PrescriptionExpired(bytes32 indexed prescriptionId)"
);

const CHUNK_SIZE = 100n; // blocks per getLogs window
const POLL_INTERVAL_MS = 2000;

// Hex string (0x-prefixed) -> raw bytes Buffer for BYTEA columns.
function hexToBuf(hex: string | undefined | null): Buffer {
  if (!hex) return Buffer.alloc(0);
  return Buffer.from(hex.startsWith("0x") ? hex.slice(2) : hex, "hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const client = createPublicClient({
    transport: http(process.env.RPC_URL || "http://localhost:8545"),
  });

  const prescriptionRegistryAddr = (process.env.PRESCRIPTION_REGISTRY_ADDRESS ||
    "") as `0x${string}`;
  if (!prescriptionRegistryAddr) {
    throw new Error("PRESCRIPTION_REGISTRY_ADDRESS not set");
  }

  // Block from which to start scanning the very first time the cursor is at 0.
  const startBlockEnv = process.env.START_BLOCK;

  console.log("[indexer] starting; registry=%s", prescriptionRegistryAddr);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const cursor = await pool.query<{ last_block: string }>(
      "SELECT last_block FROM indexer_cursor WHERE id = 1"
    );
    const cursorBlock = BigInt(cursor.rows[0]?.last_block ?? 0);
    // The cursor stores the last block already indexed; resume from the next.
    let fromBlock = cursorBlock > 0n ? cursorBlock + 1n : cursorBlock;
    if (cursorBlock === 0n && startBlockEnv) {
      fromBlock = BigInt(startBlockEnv);
    }

    const latestBlock = await client.getBlockNumber();

    if (fromBlock > latestBlock) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const toBlock =
      fromBlock + (CHUNK_SIZE - 1n) < latestBlock
        ? fromBlock + (CHUNK_SIZE - 1n)
        : latestBlock;

    await indexRange(pool, client, prescriptionRegistryAddr, fromBlock, toBlock);

    // Advance the cursor only after the whole chunk is persisted.
    await pool.query("UPDATE indexer_cursor SET last_block = $1 WHERE id = 1", [
      toBlock.toString(),
    ]);
    console.log("[indexer] indexed blocks %s-%s", fromBlock, toBlock);
  }
}

async function indexRange(
  pool: Pool,
  client: ReturnType<typeof createPublicClient>,
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
): Promise<void> {
  // --- PrescriptionIssued: insert the current-state row + audit event ------
  const issuedLogs = await client.getLogs({
    address,
    event: PRESCRIPTION_ISSUED_ABI,
    fromBlock,
    toBlock,
  });

  for (const log of issuedLogs) {
    const {
      prescriptionId,
      doctor,
      patientRef,
      cid,
      payloadHash,
      issuedAt,
      expiresAt,
      totalUnits,
    } = log.args;

    await pool.query(
      `INSERT INTO prescription
         (prescription_id, doctor_addr, patient_ref, cid, payload_hash,
          issued_at, expires_at, total_units, dispensed_units,
          refills_allowed, refills_used, state, updated_block, updated_log_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,0,1,$9,$10)
       ON CONFLICT (prescription_id) DO NOTHING`,
      [
        hexToBuf(prescriptionId),
        hexToBuf(doctor),
        hexToBuf(patientRef),
        cid,
        hexToBuf(payloadHash),
        (issuedAt ?? 0n).toString(),
        (expiresAt ?? 0n).toString(),
        Number(totalUnits ?? 0n),
        log.blockNumber?.toString() ?? "0",
        log.logIndex ?? 0,
      ]
    );

    await pool.query(
      `INSERT INTO prescription_event
         (block_number, log_index, block_hash, tx_hash, prescription_id,
          event_type, actor_addr, units_delta, new_state, ts, payload)
       VALUES ($1,$2,$3,$4,$5,'Issued',$6,NULL,1,$7,$8)
       ON CONFLICT (block_number, log_index) DO NOTHING`,
      [
        log.blockNumber?.toString() ?? "0",
        log.logIndex ?? 0,
        hexToBuf(log.blockHash),
        hexToBuf(log.transactionHash),
        hexToBuf(prescriptionId),
        hexToBuf(doctor),
        (issuedAt ?? 0n).toString(),
        JSON.stringify({
          cid,
          totalUnits: (totalUnits ?? 0n).toString(),
          state: STATE_MAP[1],
        }),
      ]
    );
  }

  // --- PrescriptionDispensed: update materialized state + audit event ------
  const dispensedLogs = await client.getLogs({
    address,
    event: PRESCRIPTION_DISPENSED_ABI,
    fromBlock,
    toBlock,
  });

  for (const log of dispensedLogs) {
    const { prescriptionId, pharmacist, units, dispensedUnits, newState } =
      log.args;
    const newStateNum = Number(newState ?? 0);

    await pool.query(
      `UPDATE prescription
         SET dispensed_units = $1, state = $2,
             updated_block = $3, updated_log_index = $4
       WHERE prescription_id = $5`,
      [
        Number(dispensedUnits ?? 0n),
        newStateNum,
        log.blockNumber?.toString() ?? "0",
        log.logIndex ?? 0,
        hexToBuf(prescriptionId),
      ]
    );

    await pool.query(
      `INSERT INTO prescription_event
         (block_number, log_index, block_hash, tx_hash, prescription_id,
          event_type, actor_addr, units_delta, new_state, ts, payload)
       VALUES ($1,$2,$3,$4,$5,'Dispensed',$6,$7,$8,$9,$10)
       ON CONFLICT (block_number, log_index) DO NOTHING`,
      [
        log.blockNumber?.toString() ?? "0",
        log.logIndex ?? 0,
        hexToBuf(log.blockHash),
        hexToBuf(log.transactionHash),
        hexToBuf(prescriptionId),
        hexToBuf(pharmacist),
        Number(units ?? 0n),
        newStateNum,
        await blockTimestamp(client, log.blockNumber),
        JSON.stringify({
          units: (units ?? 0n).toString(),
          dispensedUnits: (dispensedUnits ?? 0n).toString(),
          state: STATE_MAP[newStateNum] ?? String(newStateNum),
        }),
      ]
    );
  }

  // --- PrescriptionRevoked: terminal state = 5 (REVOKED) -------------------
  const revokedLogs = await client.getLogs({
    address,
    event: PRESCRIPTION_REVOKED_ABI,
    fromBlock,
    toBlock,
  });

  for (const log of revokedLogs) {
    const { prescriptionId, by } = log.args;

    await pool.query(
      `UPDATE prescription
         SET state = 5, updated_block = $1, updated_log_index = $2
       WHERE prescription_id = $3`,
      [
        log.blockNumber?.toString() ?? "0",
        log.logIndex ?? 0,
        hexToBuf(prescriptionId),
      ]
    );

    await pool.query(
      `INSERT INTO prescription_event
         (block_number, log_index, block_hash, tx_hash, prescription_id,
          event_type, actor_addr, units_delta, new_state, ts, payload)
       VALUES ($1,$2,$3,$4,$5,'Revoked',$6,NULL,5,$7,$8)
       ON CONFLICT (block_number, log_index) DO NOTHING`,
      [
        log.blockNumber?.toString() ?? "0",
        log.logIndex ?? 0,
        hexToBuf(log.blockHash),
        hexToBuf(log.transactionHash),
        hexToBuf(prescriptionId),
        hexToBuf(by),
        await blockTimestamp(client, log.blockNumber),
        JSON.stringify({ state: STATE_MAP[5] }),
      ]
    );
  }

  // --- PrescriptionExpired: terminal state = 4 (EXPIRED) -------------------
  const expiredLogs = await client.getLogs({
    address,
    event: PRESCRIPTION_EXPIRED_ABI,
    fromBlock,
    toBlock,
  });

  for (const log of expiredLogs) {
    const { prescriptionId } = log.args;

    await pool.query(
      `UPDATE prescription
         SET state = 4, updated_block = $1, updated_log_index = $2
       WHERE prescription_id = $3`,
      [
        log.blockNumber?.toString() ?? "0",
        log.logIndex ?? 0,
        hexToBuf(prescriptionId),
      ]
    );

    await pool.query(
      `INSERT INTO prescription_event
         (block_number, log_index, block_hash, tx_hash, prescription_id,
          event_type, actor_addr, units_delta, new_state, ts, payload)
       VALUES ($1,$2,$3,$4,$5,'Expired',NULL,NULL,4,$6,$7)
       ON CONFLICT (block_number, log_index) DO NOTHING`,
      [
        log.blockNumber?.toString() ?? "0",
        log.logIndex ?? 0,
        hexToBuf(log.blockHash),
        hexToBuf(log.transactionHash),
        hexToBuf(prescriptionId),
        await blockTimestamp(client, log.blockNumber),
        JSON.stringify({ state: STATE_MAP[4] }),
      ]
    );
  }
}

// Best-effort block timestamp lookup for events that don't carry one on-chain.
async function blockTimestamp(
  client: ReturnType<typeof createPublicClient>,
  blockNumber: bigint | null | undefined
): Promise<string> {
  if (blockNumber == null) return "0";
  try {
    const block = await client.getBlock({ blockNumber });
    return block.timestamp.toString();
  } catch {
    return "0";
  }
}

main().catch((err) => {
  console.error("[indexer] fatal:", err);
  process.exit(1);
});
