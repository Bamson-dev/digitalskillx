#!/usr/bin/env node
/**
 * Versioned, tracked, non-destructive migration runner for DATABASE_URL.
 * See db/migrations/README.md.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const statusOnly = args.has("--status");
const baselineThrough = (process.env.DB_BASELINE_THROUGH ?? "0057").trim();
const lockKey = 7_265_001;

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("[db:migrate] DATABASE_URL is not set");
  process.exit(2);
}

function listDir(dir, source) {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ file: f, source, path: join(full, f) }));
}

const all = [...listDir("supabase/migrations", "legacy"), ...listDir("db/migrations", "new")]
  .map((m) => {
    const sql = readFileSync(m.path, "utf8");
    return { ...m, version: m.file.replace(/\.sql$/, ""), sql, checksum: createHash("sha256").update(sql).digest("hex") };
  })
  .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("select pg_advisory_lock($1)", [lockKey]);
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      checksum text not null,
      baseline boolean not null default false,
      applied_at timestamptz not null default now()
    )`);
  await client.query("alter table public.schema_migrations enable row level security");

  const applied = new Map((await client.query("select version, checksum, baseline from public.schema_migrations")).rows.map((r) => [r.version, r]));

  // Baseline: an existing schema restored from the old host already contains the frozen history.
  if (applied.size === 0) {
    const has = await client.query("select to_regclass('public.courses') as t");
    if (has.rows[0].t) {
      const base = all.filter((m) => m.source === "legacy" && m.file.slice(0, 4) <= baselineThrough.slice(0, 4));
      console.log(`[db:migrate] existing schema found, baselining ${base.length} frozen migrations through ${baselineThrough}`);
      if (!dryRun && !statusOnly) {
        for (const m of base) {
          await client.query("insert into public.schema_migrations (version, checksum, baseline) values ($1,$2,true) on conflict do nothing", [m.version, m.checksum]);
          applied.set(m.version, { version: m.version, checksum: m.checksum, baseline: true });
        }
      } else {
        for (const m of base) applied.set(m.version, { version: m.version, checksum: m.checksum, baseline: true });
      }
    }
  }

  // Applied files must not change underneath us (baselined frozen files are exempt: only their presence matters).
  for (const m of all) {
    const row = applied.get(m.version);
    if (row && !row.baseline && row.checksum !== m.checksum) {
      throw new Error(`Migration ${m.version} was changed after it was applied. Add a new migration instead.`);
    }
  }

  const pending = all.filter((m) => !applied.has(m.version));
  if (statusOnly) {
    for (const m of all) console.log(`${applied.has(m.version) ? (applied.get(m.version).baseline ? "baseline" : "applied ") : "PENDING "}  ${m.file}`);
    console.log(`[db:migrate] ${pending.length} pending`);
  } else if (pending.length === 0) {
    console.log("[db:migrate] up to date");
  } else {
    for (const m of pending) {
      if (dryRun) {
        console.log(`[db:migrate] would apply ${m.file}`);
        continue;
      }
      process.stdout.write(`[db:migrate] applying ${m.file} ... `);
      try {
        await client.query("begin");
        await client.query(m.sql);
        await client.query("insert into public.schema_migrations (version, checksum) values ($1,$2)", [m.version, m.checksum]);
        await client.query("commit");
        console.log("ok");
      } catch (err) {
        await client.query("rollback").catch(() => undefined);
        console.log("FAILED");
        throw new Error(`${m.file}: ${err.message}`);
      }
    }
    console.log(`[db:migrate] ${dryRun ? "dry run complete" : `applied ${pending.length}`}`);
  }
} catch (err) {
  console.error(`[db:migrate] ${err.message}`);
  process.exitCode = 1;
} finally {
  await client.query("select pg_advisory_unlock($1)", [lockKey]).catch(() => undefined);
  await client.end();
}
