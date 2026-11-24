import { QueryBuilder, type ContextProvider, type DbError } from "./builder";
import { createAuthApi, type AuthApi, type CookieJar, type SessionMeta } from "./auth";
import { SESSION_COOKIE_NAME, verifyAccessToken } from "./jwt";
import { runInContext, getPool, type DbContext, type Queryable } from "./pool";
import { createStorageApi, type StorageApi } from "./storage";

/**
 * The client object the app code uses: `client.from(...)`, `client.rpc(...)`,
 * `client.auth`, `client.storage`. Backed by node-postgres.
 */

export type DbClient = {
  from: (table: string) => QueryBuilder;
  rpc: (fn: string, args?: Record<string, unknown>) => RpcBuilder;
  auth: AuthApi;
  storage: StorageApi;
};

type RpcResponse = { data: any; error: DbError | null; count: null; status: number; statusText: string };

const fnMeta = new Map<string, { retset: boolean; result: string }>();

export class RpcBuilder implements PromiseLike<RpcResponse> {
  private mode: "single" | "maybe" | null = null;
  private readonly fn: string;
  private readonly args: Record<string, unknown>;
  private readonly ctx: ContextProvider;
  constructor(fn: string, args: Record<string, unknown>, ctx: ContextProvider) {
    this.fn = fn;
    this.args = args;
    this.ctx = ctx;
  }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  returns<_T = unknown>() { return this; }
  throwOnError() { return this; }

  then<R1 = RpcResponse, R2 = never>(
    ok?: ((v: RpcResponse) => R1 | PromiseLike<R1>) | null,
    fail?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(ok, fail);
  }

  private async run(): Promise<RpcResponse> {
    try {
      const ctx = await this.ctx();
      return await runInContext(ctx, (db) => this.exec(db));
    } catch (err) {
      const e = err as { message?: string; detail?: string; hint?: string; code?: string };
      return {
        data: null,
        error: { message: e.message ?? "rpc failed", details: e.detail ?? "", hint: e.hint ?? "", code: e.code ?? "PGRST202" },
        count: null,
        status: 400,
        statusText: "Bad Request",
      };
    }
  }

  private async exec(db: Queryable): Promise<RpcResponse> {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(this.fn)) throw new Error("Invalid function name");
    let meta = fnMeta.get(this.fn);
    if (!meta) {
      const m = await db.query<{ retset: boolean; result: string }>(
        `select p.proretset as retset, pg_get_function_result(p.oid) as result
           from pg_proc p where p.proname = $1 and p.pronamespace = 'public'::regnamespace limit 1`,
        [this.fn],
      );
      if (!m.rows[0]) {
        const e = new Error(`Could not find the function public.${this.fn} in the schema cache`) as Error & { code: string };
        e.code = "PGRST202";
        throw e;
      }
      meta = m.rows[0];
      fnMeta.set(this.fn, meta);
    }
    const names = Object.keys(this.args);
    const params = names.map((n) => {
      const v = this.args[n];
      if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) return JSON.stringify(v);
      return v instanceof Date ? v.toISOString() : v;
    });
    const argSql = names.map((n, i) => `"${n.replace(/"/g, "")}" => $${i + 1}`).join(", ");
    const call = `public."${this.fn}"(${argSql})`;
    let data: any;
    if (meta.result === "void") {
      await db.query(`select ${call}`, params);
      data = null;
    } else if (meta.retset) {
      const r = await db.query<{ j: unknown }>(`select to_json(_r) as j from ${call} _r`, params);
      data = r.rows.map((x) => x.j);
    } else {
      const r = await db.query<{ j: unknown }>(`select to_json(${call}) as j`, params);
      data = r.rows[0]?.j ?? null;
    }
    if (this.mode) {
      const rows = Array.isArray(data) ? data : data == null ? [] : [data];
      if (rows.length !== 1) {
        if (this.mode === "maybe" && rows.length === 0) return { data: null, error: null, count: null, status: 200, statusText: "OK" };
        return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${rows.length} rows`, hint: "", code: "PGRST116" }, count: null, status: 406, statusText: "Not Acceptable" };
      }
      data = rows[0];
    }
    return { data, error: null, count: null, status: 200, statusText: "OK" };
  }
}

function build(ctx: ContextProvider, auth: AuthApi): DbClient {
  return {
    from: (table) => new QueryBuilder(table, ctx),
    rpc: (fn, args = {}) => new RpcBuilder(fn, args, ctx),
    auth,
    storage: createStorageApi(),
  };
}

/** Service context: owner connection, bypasses row level security (the old service-role client). */
export function createServiceClient(): DbClient {
  void getPool;
  return build(async () => ({ role: "service" }), createAuthApi());
}

/** Anonymous context for public pages. Row level security applies as the `anon` role. */
export function createAnonDbClient(): DbClient {
  return build(async () => ({ role: "anon" }), createAuthApi());
}

/**
 * Request-bound client. Queries run as the signed-in user (from the session cookie),
 * so row level security policies using auth.uid() keep their meaning.
 */
export function createRequestClient(jar: CookieJar, meta?: () => SessionMeta): DbClient {
  let cachedToken: string | null = null;
  let cachedCtx: Promise<DbContext> | null = null;
  const ctx: ContextProvider = () => {
    // The cookie can change (sign-in/out) during a request, so compare the token each time.
    const token = jar.getAll().find((c) => c.name === SESSION_COOKIE_NAME)?.value ?? null;
    if (!token) return Promise.resolve({ role: "anon" } as DbContext);
    if (token === cachedToken && cachedCtx) return cachedCtx;
    cachedToken = token;
    cachedCtx = (async () => {
      const claims = await verifyAccessToken(token);
      if (!claims) return { role: "anon" } as DbContext;
      // A revoked or deleted session must not keep acting as the user.
      const live = await getPool().query("select 1 from auth.sessions where id = $1 and user_id = $2 limit 1", [claims.session_id, claims.sub]);
      if (!live.rows[0]) return { role: "anon" } as DbContext;
      return { role: "authenticated", claims: claims as unknown as Record<string, unknown> } as DbContext;
    })();
    return cachedCtx;
  };
  return build(ctx, createAuthApi({ cookies: jar, meta }));
}

/** Standalone auth client (no cookies): used by login flows that return tokens. */
export function createAuthOnlyClient(meta?: () => SessionMeta): DbClient {
  return build(async () => ({ role: "anon" }), createAuthApi({ meta }));
}
