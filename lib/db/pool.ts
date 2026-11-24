import pg from "pg";
import type { Pool, PoolClient } from "pg";

const { Pool: PgPool } = pg;

/**
 * Single node-postgres pool for the whole app. DATABASE_URL points at the
 * standalone PostgreSQL 16 container on the Coolify internal network.
 */

export type QueryResult<T> = { rows: T[]; rowCount: number | null };

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export type DbContext =
  | { role: "service" }
  | { role: "authenticated"; claims: Record<string, unknown> }
  | { role: "anon" };

const globalForPool = globalThis as unknown as { __dsxPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.__dsxPool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured");
    }
    const pool = new PgPool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 60_000),
      application_name: "digitalskillx",
      // Owner connections act as the old service role: auth.role() must say so for the
      // profile guard triggers. User/anon queries override these inside their transaction.
      options: '-c TimeZone=UTC -c request.jwt.claim.role=service_role -c request.jwt.claims={"role":"service_role"}',
    });
    pool.on("error", (err) => {
      console.error("[db] idle client error:", err.message);
    });
    globalForPool.__dsxPool = pool;
  }
  return globalForPool.__dsxPool;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export async function closePool(): Promise<void> {
  if (globalForPool.__dsxPool) {
    const p = globalForPool.__dsxPool;
    globalForPool.__dsxPool = undefined;
    await p.end();
  }
}

async function applyContext(client: PoolClient, ctx: DbContext) {
  if (ctx.role === "service") return;
  const claims = ctx.role === "authenticated" ? ctx.claims : { role: "anon" };
  const sub = typeof claims.sub === "string" ? claims.sub : "";
  await client.query(
    `select set_config('role', $1, true),
            set_config('request.jwt.claims', $2, true),
            set_config('request.jwt.claim.sub', $3, true),
            set_config('request.jwt.claim.role', $1, true)`,
    [ctx.role, JSON.stringify(claims), sub],
  );
}

/**
 * Runs `fn` with the right database role. Service context runs as the connection owner
 * (bypasses row level security, like the old service-role key). User and anon contexts
 * switch to the `authenticated` or `anon` role inside a transaction so the existing
 * row level security policies keep applying with `auth.uid()`.
 */
export async function runInContext<T>(ctx: DbContext, fn: (db: Queryable) => Promise<T>): Promise<T> {
  const pool = getPool();
  if (ctx.role === "service") return fn(pool as unknown as Queryable);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await applyContext(client, ctx);
    const out = await fn(client as unknown as Queryable);
    await client.query("commit");
    return out;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      // connection already broken
    }
    throw err;
  } finally {
    client.release();
  }
}
