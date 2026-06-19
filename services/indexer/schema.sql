-- services/indexer/schema.sql
-- Postgres read-model schema for the e-prescription event indexer (spec §10.4).
-- This is the OFF-CHAIN projection of on-chain state + an append-only audit
-- trail of contract events. The chain is the source of truth; this read model
-- exists for fast queries by the API / UI. Re-runnable (IF NOT EXISTS).

-- ---------------------------------------------------------------------------
-- prescription: current materialized state, one row per prescriptionId.
-- Hashes/addresses stored as BYTEA (raw 20/32 bytes, no 0x prefix).
-- state mirrors IPrescriptionRegistry.State enum:
--   0=None 1=ISSUED 2=PARTIALLY_DISPENSED 3=FULLY_DISPENSED 4=EXPIRED 5=REVOKED
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescription (
  prescription_id   BYTEA PRIMARY KEY,
  doctor_addr       BYTEA NOT NULL,
  patient_ref       BYTEA NOT NULL,
  cid               TEXT  NOT NULL,
  payload_hash      BYTEA NOT NULL,
  issued_at         BIGINT NOT NULL,
  expires_at        BIGINT NOT NULL,
  total_units       INTEGER NOT NULL,
  dispensed_units   INTEGER NOT NULL DEFAULT 0,
  -- refills_allowed is NULLable: PrescriptionIssued does not carry it (it lives
  -- only in on-chain storage), so from events alone it is unknown. NULL = "not
  -- known from the event stream"; an IdentityRegistry/getter backfill may set
  -- it later. refills_used IS event-derived (PrescriptionRefilled.refillsUsed).
  refills_allowed   SMALLINT,
  refills_used      SMALLINT NOT NULL DEFAULT 0,
  state             SMALLINT NOT NULL DEFAULT 1,
  updated_block     BIGINT NOT NULL,
  updated_log_index INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rx_patient ON prescription (patient_ref);
CREATE INDEX IF NOT EXISTS idx_rx_doctor  ON prescription (doctor_addr);
CREATE INDEX IF NOT EXISTS idx_rx_state   ON prescription (state);
CREATE INDEX IF NOT EXISTS idx_rx_expiry  ON prescription (expires_at);

-- ---------------------------------------------------------------------------
-- prescription_event: append-only audit log. One row per (block_number,
-- log_index) so re-processing the same chain range is idempotent.
--   event_type ∈ {Issued, Dispensed, Refilled, Revoked, Expired}
--   actor_addr  = doctor (Issued) / pharmacist (Dispensed) / by (Revoked);
--                 Refilled/Expired carry no actor (NULL).
--   units_delta = units dispensed (Dispensed only)
--   new_state   = resulting State enum value (Dispensed=2/3, Refilled=1/ISSUED,
--                 Revoked=5, Expired=4)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescription_event (
  block_number    BIGINT NOT NULL,
  log_index       INTEGER NOT NULL,
  block_hash      BYTEA NOT NULL,
  tx_hash         BYTEA NOT NULL,
  prescription_id BYTEA NOT NULL,
  event_type      TEXT NOT NULL,
  actor_addr      BYTEA,
  units_delta     INTEGER,
  new_state       SMALLINT,
  ts              BIGINT NOT NULL,
  payload         JSONB,
  PRIMARY KEY (block_number, log_index)
);
CREATE INDEX IF NOT EXISTS idx_evt_rx ON prescription_event (prescription_id);

-- ---------------------------------------------------------------------------
-- actor: identity-registry projection (doctors/pharmacists/custodians).
-- Populated by the IdentityRegistry indexer (out of scope of this service's
-- prescription poller, but the read-model table lives here per spec §10.4).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS actor (
  address           BYTEA PRIMARY KEY,
  role              TEXT NOT NULL,
  license_hash      BYTEA,
  institution_id    TEXT,
  encryption_pubkey BYTEA,
  status            TEXT NOT NULL DEFAULT 'Active'
);

-- ---------------------------------------------------------------------------
-- patient: patientRef -> encryption pubkey + custodian projection.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient (
  patient_ref       BYTEA PRIMARY KEY,
  encryption_pubkey BYTEA NOT NULL,
  custodian_addr    BYTEA NOT NULL
);

-- ---------------------------------------------------------------------------
-- key_access: wrapped (ECIES-encrypted) AES keys per recipient, projection of
-- KeyAccessRegistry. Composite PK so a recipient is granted once per Rx.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS key_access (
  prescription_id BYTEA NOT NULL,
  recipient       BYTEA NOT NULL,
  wrapped_key     BYTEA NOT NULL,
  granted_by      BYTEA NOT NULL,
  revoked         BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (prescription_id, recipient)
);

-- ---------------------------------------------------------------------------
-- indexer_cursor: single-row (id=1) checkpoint of the last fully-processed
-- block. The indexer reads last_block_hash and, before advancing, re-fetches
-- that block from the chain; if the hash no longer matches it rewinds one chunk
-- and re-indexes (reorg recovery). last_log_index records the last applied log
-- in the checkpointed block. Combined with the CONFIRMATIONS lag, this keeps
-- the read model consistent across reorgs (benign on Besu IBFT 2.0's instant
-- finality, but correct on probabilistic-finality chains too).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS indexer_cursor (
  id              SMALLINT PRIMARY KEY DEFAULT 1,
  last_block      BIGINT NOT NULL DEFAULT 0,
  last_log_index  INTEGER NOT NULL DEFAULT -1,
  last_block_hash BYTEA NOT NULL DEFAULT '\x'
);

-- Seed the single cursor row so the poller can UPDATE it from block 0.
INSERT INTO indexer_cursor (id) VALUES (1) ON CONFLICT DO NOTHING;
