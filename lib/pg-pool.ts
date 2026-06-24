// lib/pg-pool.ts
//
// Postgres connection-pool factory shared by the read-model consumers (the
// event indexer and the Pages-Router read API).
//
// CREDENTIAL HANDLING (security): the DB password is NEVER embedded in a
// committed DATABASE_URL. A URL form puts the secret into `docker inspect`
// output and exposes it to URL-injection if the password contains `@ : / ? # %`.
// Instead:
//   - host / user / database come from PG* env vars (PGHOST/PGUSER/PGDATABASE),
//   - the password is read at runtime from a Docker file secret
//     (/run/secrets/pg_password, overridable via PGPASSWORD_FILE), or PGPASSWORD
//     if explicitly exported for local dev.
// A DATABASE_URL is honored ONLY as a local-dev escape hatch when no PGHOST is
// set; in that mode the operator is responsible for URL-safety.
import { Pool, type PoolConfig } from "pg";
import { readFileSync } from "fs";

function readDbPassword(): string | undefined {
  if (process.env.PGPASSWORD) return process.env.PGPASSWORD;
  const file = process.env.PGPASSWORD_FILE || "/run/secrets/pg_password";
  try {
    const v = readFileSync(file, "utf8").trim();
    return v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build a pg Pool using the file-secret credential strategy described above.
 * `extra` is merged last so callers can override pool sizing, timeouts, etc.
 */
export function createPool(extra?: PoolConfig): Pool {
  // Local-dev escape hatch: an explicit DATABASE_URL and no PG* host configured.
  if (process.env.DATABASE_URL && !process.env.PGHOST) {
    return new Pool({ connectionString: process.env.DATABASE_URL, ...extra });
  }
  return new Pool({
    host: process.env.PGHOST || "postgres",
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || "app",
    database: process.env.PGDATABASE || "eprescription",
    password: readDbPassword(),
    ...extra,
  });
}
