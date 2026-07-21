import { Pool, types, type QueryResultRow } from "pg";

// node-postgres returns BIGINT/BIGSERIAL columns as strings by default (to
// avoid silently truncating values beyond Number.MAX_SAFE_INTEGER). None of
// this app's counters get anywhere close to that range, so parse them as
// numbers to match the plain-number shape the API previously returned.
types.setTypeParser(types.builtins.INT8, (value: string) => parseInt(value, 10));

// Reuse the pool across hot reloads in dev and across invocations on a warm
// serverless instance, instead of opening a new one per request. Built lazily
// (not at module import time) so pages/routes that don't touch the DB still
// build and import cleanly when DATABASE_URL isn't set yet.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

function getPool(): Pool {
  if (globalForPg.pgPool) {
    return globalForPg.pgPool;
  }

  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL (or POSTGRES_URL) is not set. Add a Postgres connection string to the environment.",
    );
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost")
      ? undefined
      : { rejectUnauthorized: false },
  });
  globalForPg.pgPool = pool;
  return pool;
}

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return getPool().query<T>(text, params);
}

// Runs `fn` against a single checked-out client wrapped in BEGIN/COMMIT, so
// statements that must be atomic don't get spread across different pooled
// connections the way sequential pool.query() calls could.
export async function withTransaction<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

let schemaReady: Promise<void> | null = null;

// Idempotent schema setup, run lazily on first DB access so there is no
// separate migration step to wire up on Vercel.
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(`
        CREATE TABLE IF NOT EXISTS users (
          username TEXT PRIMARY KEY,
          password TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'user'))
        );

        CREATE TABLE IF NOT EXISTS image_scores (
          image TEXT PRIMARY KEY,
          total INTEGER NOT NULL DEFAULT 0,
          votes INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS pair_scores (
          pair_key TEXT PRIMARY KEY,
          img_a TEXT NOT NULL,
          img_b TEXT NOT NULL,
          total INTEGER NOT NULL DEFAULT 0,
          votes INTEGER NOT NULL DEFAULT 0,
          total_time_ms BIGINT NOT NULL DEFAULT 0,
          time_votes INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS user_scores (
          username TEXT PRIMARY KEY,
          total INTEGER NOT NULL DEFAULT 0,
          votes INTEGER NOT NULL DEFAULT 0,
          total_time_ms BIGINT NOT NULL DEFAULT 0,
          time_votes INTEGER NOT NULL DEFAULT 0,
          last_answered_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS comparison_log (
          id BIGSERIAL PRIMARY KEY,
          username TEXT,
          img_a TEXT NOT NULL,
          img_b TEXT NOT NULL,
          expected SMALLINT NOT NULL,
          rating SMALLINT NOT NULL,
          correct BOOLEAN NOT NULL,
          duration_ms INTEGER,
          "timestamp" TIMESTAMPTZ NOT NULL
        );
      `)
      .then(() => undefined)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}
