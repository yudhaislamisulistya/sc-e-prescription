// services/indexer/index.ts
//
// Event indexer for the e-prescription read model (spec §10.4).
//
// Polls the chain with viem `getLogs`, decodes PrescriptionRegistry events, and
// upserts them into Postgres via the `pg` Pool using PARAMETERIZED queries
// ($1,$2,...). The block range is chunked (~100 blocks). Within a chunk every
// matched log (across all event types) is merged into ONE stream sorted by
// (blockNumber, logIndex) and applied in true chain order, so a refill+dispense
// landing in the same window can never be reordered. `indexer_cursor` advances
// only after a chunk is fully written, so a crash safely resumes.
//
// IMPORTANT: the parseAbiItem signatures below are copied verbatim from
// contracts/PrescriptionRegistry.sol (and re-verified against the compiled
// artifact ABI). The on-chain `State newState` enum argument of
// PrescriptionDispensed is `uint8` in the compiled ABI — a single type/name
// mismatch here makes viem compute a different topic0 and silently index
// nothing.
import {
  createPublicClient,
  http,
  parseAbiItem,
  type AbiEvent,
  type Log,
} from "viem";
import { type Pool, type PoolClient } from "pg";
import { createPool } from "../../lib/pg-pool";

// Mirror of IPrescriptionRegistry.State (kept for human-readable audit payloads).
const STATE_NONE = 0;
const STATE_ISSUED = 1;
const STATE_PARTIALLY_DISPENSED = 2;
const STATE_FULLY_DISPENSED = 3;
const STATE_EXPIRED = 4;
const STATE_REVOKED = 5;

const STATE_MAP: Record<number, string> = {
  [STATE_NONE]: "NONE",
  [STATE_ISSUED]: "ISSUED",
  [STATE_PARTIALLY_DISPENSED]: "PARTIALLY_DISPENSED",
  [STATE_FULLY_DISPENSED]: "FULLY_DISPENSED",
  [STATE_EXPIRED]: "EXPIRED",
  [STATE_REVOKED]: "REVOKED",
};

// --- Event ABIs (EXACT signatures from contracts/PrescriptionRegistry.sol) ---
const PRESCRIPTION_ISSUED_ABI = parseAbiItem(
  "event PrescriptionIssued(bytes32 indexed prescriptionId, address indexed doctor, bytes32 indexed patientRef, string cid, bytes32 payloadHash, uint64 issuedAt, uint64 expiresAt, uint32 totalUnits)"
);
const PRESCRIPTION_DISPENSED_ABI = parseAbiItem(
  "event PrescriptionDispensed(bytes32 indexed prescriptionId, address indexed pharmacist, uint32 units, uint32 dispensedUnits, uint8 newState)"
);
// PrescriptionRefilled resets the on-chain row: dispensedUnits=0, state=ISSUED,
// and increments refillsUsed (refill() at PrescriptionRegistry.sol:111-125).
// Omitting it leaves the read model permanently stale for every refillable Rx.
const PRESCRIPTION_REFILLED_ABI = parseAbiItem(
  "event PrescriptionRefilled(bytes32 indexed prescriptionId, uint8 refillsUsed)"
);
const PRESCRIPTION_REVOKED_ABI = parseAbiItem(
  "event PrescriptionRevoked(bytes32 indexed prescriptionId, address indexed by)"
);
const PRESCRIPTION_EXPIRED_ABI = parseAbiItem(
  "event PrescriptionExpired(bytes32 indexed prescriptionId)"
);

const ALL_EVENTS: AbiEvent[] = [
  PRESCRIPTION_ISSUED_ABI,
  PRESCRIPTION_DISPENSED_ABI,
  PRESCRIPTION_REFILLED_ABI,
  PRESCRIPTION_REVOKED_ABI,
  PRESCRIPTION_EXPIRED_ABI,
];

const CHUNK_SIZE = 100n; // blocks per getLogs window
const POLL_INTERVAL_MS = 2000;

// Confirmation lag: only index up to (latest - CONFIRMATIONS) so a short reorg
// of unfinalized tip blocks cannot bake reorged-out events into the read model.
// On the intended target (Besu IBFT 2.0) finality is instant, so 0 is safe; the
// env hook lets a probabilistic-finality chain raise it without code changes.
const CONFIRMATIONS = BigInt(process.env.CONFIRMATIONS ?? "0");

type DecodedLog = Log<bigint, number, false, AbiEvent>;

// Hex string (0x-prefixed) -> raw bytes Buffer for BYTEA columns.
function hexToBuf(hex: string | undefined | null): Buffer {
  if (!hex) return Buffer.alloc(0);
  return Buffer.from(hex.startsWith("0x") ? hex.slice(2) : hex, "hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PublicClient = ReturnType<typeof createPublicClient>;

async function main(): Promise<void> {
  const pool = createPool();

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
    const cursor = await pool.query<{
      last_block: string;
      last_block_hash: Buffer | null;
    }>("SELECT last_block, last_block_hash FROM indexer_cursor WHERE id = 1");
    const cursorBlock = BigInt(cursor.rows[0]?.last_block ?? 0);
    const cursorHash = cursor.rows[0]?.last_block_hash ?? null;

    // Reorg guard: if the block we last checkpointed no longer hashes the same
    // on chain, the tip reorged below our cursor. Rewind a chunk and re-index.
    if (cursorBlock > 0n && cursorHash && cursorHash.length > 0) {
      try {
        const onChain = await client.getBlock({ blockNumber: cursorBlock });
        if (hexToBuf(onChain.hash).compare(cursorHash) !== 0) {
          const rewindTo =
            cursorBlock > CHUNK_SIZE ? cursorBlock - CHUNK_SIZE : 0n;
          console.warn(
            "[indexer] reorg detected at block %s; rewinding cursor to %s",
            cursorBlock,
            rewindTo
          );
          await pool.query(
            "UPDATE indexer_cursor SET last_block = $1, last_log_index = -1, last_block_hash = '\\x' WHERE id = 1",
            [rewindTo.toString()]
          );
          continue;
        }
      } catch (err) {
        // Block not found (pruned/just-reorged) — back off and retry next loop.
        console.warn("[indexer] reorg check failed, retrying:", err);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
    }

    // The cursor stores the last block already indexed; resume from the next.
    let fromBlock = cursorBlock > 0n ? cursorBlock + 1n : cursorBlock;
    if (cursorBlock === 0n && startBlockEnv) {
      fromBlock = BigInt(startBlockEnv);
    }

    const latestBlock = await client.getBlockNumber();
    // Stay CONFIRMATIONS blocks behind the unfinalized tip.
    const safeHead =
      latestBlock > CONFIRMATIONS ? latestBlock - CONFIRMATIONS : 0n;

    if (fromBlock > safeHead) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const toBlock =
      fromBlock + (CHUNK_SIZE - 1n) < safeHead
        ? fromBlock + (CHUNK_SIZE - 1n)
        : safeHead;

    await indexRange(
      pool,
      client,
      prescriptionRegistryAddr,
      fromBlock,
      toBlock
    );
    console.log("[indexer] indexed blocks %s-%s", fromBlock, toBlock);
  }
}

async function indexRange(
  pool: Pool,
  client: PublicClient,
  address: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint
): Promise<void> {
  // Fetch every relevant event in the window, then MERGE into one stream sorted
  // by (blockNumber, logIndex) so transitions apply in true chain order.
  const logsPerEvent = await Promise.all(
    ALL_EVENTS.map((event) =>
      client.getLogs({ address, event, fromBlock, toBlock })
    )
  );
  const logs = logsPerEvent.flat() as DecodedLog[];
  logs.sort((a, b) => {
    const bn = (a.blockNumber ?? 0n) - (b.blockNumber ?? 0n);
    if (bn !== 0n) return bn < 0n ? -1 : 1;
    return (a.logIndex ?? 0) - (b.logIndex ?? 0);
  });

  // Cache block timestamps so we look each block up at most once per chunk.
  const tsCache = new Map<string, string>();
  const tsOf = async (bn: bigint | null | undefined): Promise<string> => {
    if (bn == null) return "0";
    const key = bn.toString();
    const cached = tsCache.get(key);
    if (cached !== undefined) return cached;
    const ts = await blockTimestamp(client, bn);
    tsCache.set(key, ts);
    return ts;
  };

  // The whole chunk + the cursor advance run in ONE transaction so a crash
  // mid-chunk never leaves the cursor ahead of partially-applied rows.
  const db = await pool.connect();
  try {
    await db.query("BEGIN");

    for (const log of logs) {
      const eventName = (log as { eventName?: string }).eventName;
      switch (eventName) {
        case "PrescriptionIssued":
          await applyIssued(db, log);
          break;
        case "PrescriptionDispensed":
          await applyDispensed(db, log, await tsOf(log.blockNumber));
          break;
        case "PrescriptionRefilled":
          await applyRefilled(db, log, await tsOf(log.blockNumber));
          break;
        case "PrescriptionRevoked":
          await applyRevoked(db, log, await tsOf(log.blockNumber));
          break;
        case "PrescriptionExpired":
          await applyExpired(db, log, await tsOf(log.blockNumber));
          break;
        default:
          break;
      }
    }

    // Checkpoint the END of the window, capturing the block hash + last log
    // index so the next loop can detect a reorg below this point.
    const endBlock = await client.getBlock({ blockNumber: toBlock });
    const lastLogIndex =
      logs.length > 0 ? logs[logs.length - 1].logIndex ?? -1 : -1;
    await db.query(
      "UPDATE indexer_cursor SET last_block = $1, last_log_index = $2, last_block_hash = $3 WHERE id = 1",
      [toBlock.toString(), lastLogIndex, hexToBuf(endBlock.hash)]
    );

    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  } finally {
    db.release();
  }
}

// --- PrescriptionIssued: insert the current-state row + audit event ----------
async function applyIssued(db: PoolClient, log: DecodedLog): Promise<void> {
  const args = log.args as {
    prescriptionId?: `0x${string}`;
    doctor?: `0x${string}`;
    patientRef?: `0x${string}`;
    cid?: string;
    payloadHash?: `0x${string}`;
    issuedAt?: bigint;
    expiresAt?: bigint;
    totalUnits?: bigint;
  };

  // NOTE: PrescriptionIssued does NOT carry refillsAllowed (ABI-confirmed), so
  // it is unknown from events alone and seeded NULL (was wrongly hardcoded 0).
  // refills_used starts at 0 and is advanced by PrescriptionRefilled below.
  await db.query(
    `INSERT INTO prescription
       (prescription_id, doctor_addr, patient_ref, cid, payload_hash,
        issued_at, expires_at, total_units, dispensed_units,
        refills_allowed, refills_used, state, updated_block, updated_log_index)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,NULL,0,${STATE_ISSUED},$9,$10)
     ON CONFLICT (prescription_id) DO NOTHING`,
    [
      hexToBuf(args.prescriptionId),
      hexToBuf(args.doctor),
      hexToBuf(args.patientRef),
      args.cid,
      hexToBuf(args.payloadHash),
      (args.issuedAt ?? 0n).toString(),
      (args.expiresAt ?? 0n).toString(),
      Number(args.totalUnits ?? 0n),
      log.blockNumber?.toString() ?? "0",
      log.logIndex ?? 0,
    ]
  );

  await db.query(
    `INSERT INTO prescription_event
       (block_number, log_index, block_hash, tx_hash, prescription_id,
        event_type, actor_addr, units_delta, new_state, ts, payload)
     VALUES ($1,$2,$3,$4,$5,'Issued',$6,NULL,${STATE_ISSUED},$7,$8)
     ON CONFLICT (block_number, log_index) DO NOTHING`,
    [
      log.blockNumber?.toString() ?? "0",
      log.logIndex ?? 0,
      hexToBuf(log.blockHash),
      hexToBuf(log.transactionHash),
      hexToBuf(args.prescriptionId),
      hexToBuf(args.doctor),
      (args.issuedAt ?? 0n).toString(),
      JSON.stringify({
        cid: args.cid,
        totalUnits: (args.totalUnits ?? 0n).toString(),
        state: STATE_MAP[STATE_ISSUED],
      }),
    ]
  );
}

// --- PrescriptionDispensed: update materialized state + audit event ----------
async function applyDispensed(
  db: PoolClient,
  log: DecodedLog,
  ts: string
): Promise<void> {
  const args = log.args as {
    prescriptionId?: `0x${string}`;
    pharmacist?: `0x${string}`;
    units?: bigint;
    dispensedUnits?: bigint;
    newState?: number | bigint;
  };
  const newStateNum = Number(args.newState ?? 0);

  await db.query(
    `UPDATE prescription
       SET dispensed_units = $1, state = $2,
           updated_block = $3, updated_log_index = $4
     WHERE prescription_id = $5`,
    [
      Number(args.dispensedUnits ?? 0n),
      newStateNum,
      log.blockNumber?.toString() ?? "0",
      log.logIndex ?? 0,
      hexToBuf(args.prescriptionId),
    ]
  );

  await db.query(
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
      hexToBuf(args.prescriptionId),
      hexToBuf(args.pharmacist),
      Number(args.units ?? 0n),
      newStateNum,
      ts,
      JSON.stringify({
        units: (args.units ?? 0n).toString(),
        dispensedUnits: (args.dispensedUnits ?? 0n).toString(),
        state: STATE_MAP[newStateNum] ?? String(newStateNum),
      }),
    ]
  );
}

// --- PrescriptionRefilled: chain resets dispensedUnits=0, state=ISSUED, and
//     bumps refillsUsed. Mirror ALL three or the row stays stuck at
//     FULLY_DISPENSED with stale dispensed_units forever. ----------------------
async function applyRefilled(
  db: PoolClient,
  log: DecodedLog,
  ts: string
): Promise<void> {
  const args = log.args as {
    prescriptionId?: `0x${string}`;
    refillsUsed?: number | bigint;
  };
  const refillsUsed = Number(args.refillsUsed ?? 0);

  await db.query(
    `UPDATE prescription
       SET dispensed_units = 0, state = ${STATE_ISSUED},
           refills_used = $1, updated_block = $2, updated_log_index = $3
     WHERE prescription_id = $4`,
    [
      refillsUsed,
      log.blockNumber?.toString() ?? "0",
      log.logIndex ?? 0,
      hexToBuf(args.prescriptionId),
    ]
  );

  await db.query(
    `INSERT INTO prescription_event
       (block_number, log_index, block_hash, tx_hash, prescription_id,
        event_type, actor_addr, units_delta, new_state, ts, payload)
     VALUES ($1,$2,$3,$4,$5,'Refilled',NULL,NULL,${STATE_ISSUED},$6,$7)
     ON CONFLICT (block_number, log_index) DO NOTHING`,
    [
      log.blockNumber?.toString() ?? "0",
      log.logIndex ?? 0,
      hexToBuf(log.blockHash),
      hexToBuf(log.transactionHash),
      hexToBuf(args.prescriptionId),
      ts,
      JSON.stringify({
        refillsUsed: String(refillsUsed),
        state: STATE_MAP[STATE_ISSUED],
      }),
    ]
  );
}

// --- PrescriptionRevoked: terminal state = 5 (REVOKED) -----------------------
async function applyRevoked(
  db: PoolClient,
  log: DecodedLog,
  ts: string
): Promise<void> {
  const args = log.args as {
    prescriptionId?: `0x${string}`;
    by?: `0x${string}`;
  };

  await db.query(
    `UPDATE prescription
       SET state = ${STATE_REVOKED}, updated_block = $1, updated_log_index = $2
     WHERE prescription_id = $3`,
    [
      log.blockNumber?.toString() ?? "0",
      log.logIndex ?? 0,
      hexToBuf(args.prescriptionId),
    ]
  );

  await db.query(
    `INSERT INTO prescription_event
       (block_number, log_index, block_hash, tx_hash, prescription_id,
        event_type, actor_addr, units_delta, new_state, ts, payload)
     VALUES ($1,$2,$3,$4,$5,'Revoked',$6,NULL,${STATE_REVOKED},$7,$8)
     ON CONFLICT (block_number, log_index) DO NOTHING`,
    [
      log.blockNumber?.toString() ?? "0",
      log.logIndex ?? 0,
      hexToBuf(log.blockHash),
      hexToBuf(log.transactionHash),
      hexToBuf(args.prescriptionId),
      hexToBuf(args.by),
      ts,
      JSON.stringify({ state: STATE_MAP[STATE_REVOKED] }),
    ]
  );
}

// --- PrescriptionExpired: terminal state = 4 (EXPIRED) -----------------------
async function applyExpired(
  db: PoolClient,
  log: DecodedLog,
  ts: string
): Promise<void> {
  const args = log.args as { prescriptionId?: `0x${string}` };

  await db.query(
    `UPDATE prescription
       SET state = ${STATE_EXPIRED}, updated_block = $1, updated_log_index = $2
     WHERE prescription_id = $3`,
    [
      log.blockNumber?.toString() ?? "0",
      log.logIndex ?? 0,
      hexToBuf(args.prescriptionId),
    ]
  );

  await db.query(
    `INSERT INTO prescription_event
       (block_number, log_index, block_hash, tx_hash, prescription_id,
        event_type, actor_addr, units_delta, new_state, ts, payload)
     VALUES ($1,$2,$3,$4,$5,'Expired',NULL,NULL,${STATE_EXPIRED},$6,$7)
     ON CONFLICT (block_number, log_index) DO NOTHING`,
    [
      log.blockNumber?.toString() ?? "0",
      log.logIndex ?? 0,
      hexToBuf(log.blockHash),
      hexToBuf(log.transactionHash),
      hexToBuf(args.prescriptionId),
      ts,
      JSON.stringify({ state: STATE_MAP[STATE_EXPIRED] }),
    ]
  );
}

// Best-effort block timestamp lookup for events that don't carry one on-chain.
async function blockTimestamp(
  client: PublicClient,
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
