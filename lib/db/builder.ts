import { filterSql, parseLogicTree, parseOperandValue, quoteIdent, columnExpr, type FilterNode, type ParamSink } from "./filters";
import { runInContext, type DbContext, type Queryable } from "./pool";
import { loadSchemaMeta, resolveRelation, type SchemaMeta } from "./schema-meta";

/**
 * Query builder with the call surface the app already uses (from/select/eq/.../single).
 * It generates parameterised SQL for node-postgres and returns `{ data, error, count }`,
 * with row JSON produced by PostgreSQL (`to_json`), so timestamps, numerics and nested
 * objects have the same shape the previous REST layer returned.
 */

export type DbError = {
  message: string;
  details: string;
  hint: string;
  code: string;
};

export type DbResponse<T = any> = {
  data: T;
  error: DbError | null;
  count: number | null;
  status: number;
  statusText: string;
};

type Action = "select" | "insert" | "update" | "delete" | "upsert";

type SelectItem =
  | { type: "col"; expr: string; alias?: string; cast?: string }
  | { type: "star" }
  | { type: "embed"; alias: string; target: string; hint?: string; inner: boolean; items: SelectItem[] };

export type ContextProvider = () => Promise<DbContext>;

function toDbError(err: unknown): DbError {
  const e = err as { message?: string; detail?: string; hint?: string; code?: string };
  return {
    message: e?.message ?? "Database error",
    details: e?.detail ?? "",
    hint: e?.hint ?? "",
    code: e?.code ?? "PGRST000",
  };
}

// ---------------------------------------------------------------------------
// select string parsing
// ---------------------------------------------------------------------------

function splitSelect(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseSelect(input: string): SelectItem[] {
  const items: SelectItem[] = [];
  for (const raw of splitSelect(input.replace(/\s+/g, " ").trim())) {
    if (!raw) continue;
    if (raw === "*") {
      items.push({ type: "star" });
      continue;
    }
    const embed = /^(?:([A-Za-z0-9_]+):)?([A-Za-z0-9_]+)((?:![A-Za-z0-9_]+)*)\(([\s\S]*)\)$/.exec(raw);
    if (embed) {
      const [, alias, target, hints, inner] = embed;
      const parts = hints.split("!").filter(Boolean);
      const isInner = parts.includes("inner");
      const hint = parts.find((p) => p !== "inner" && p !== "left");
      items.push({
        type: "embed",
        alias: alias ?? target,
        target,
        hint,
        inner: isInner,
        items: parseSelect(inner),
      });
      continue;
    }
    const col = /^(?:([A-Za-z0-9_]+):)?([A-Za-z0-9_>\-]+?)(?:::([A-Za-z0-9_ ]+))?$/.exec(raw);
    if (!col) throw new Error(`Cannot parse select item: ${raw}`);
    items.push({ type: "col", alias: col[1], expr: col[2], cast: col[3] });
  }
  return items;
}

// ---------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------

type OrderSpec = { column: string; ascending: boolean; nullsFirst?: boolean; referencedTable?: string };

type BuildState = {
  meta: SchemaMeta;
  sink: ParamSink;
  aliasCounter: number;
};

function orderSql(orders: OrderSpec[], alias: string): string {
  if (!orders.length) return "";
  return (
    " order by " +
    orders
      .map((o) => {
        let s = `${columnExpr(o.column, alias)} ${o.ascending ? "asc" : "desc"}`;
        if (o.nullsFirst === true) s += " nulls first";
        if (o.nullsFirst === false) s += " nulls last";
        return s;
      })
      .join(", ")
  );
}

/** Filters whose column starts with an embed alias/name belong to that embed. */
function splitEmbedFilters(filters: FilterNode[], embedNames: Set<string>) {
  const main: FilterNode[] = [];
  const byEmbed = new Map<string, FilterNode[]>();
  for (const f of filters) {
    if (f.kind === "cmp" && f.column.includes(".")) {
      const [prefix, ...rest] = f.column.split(".");
      if (embedNames.has(prefix)) {
        const list = byEmbed.get(prefix) ?? [];
        list.push({ ...f, column: rest.join(".") });
        byEmbed.set(prefix, list);
        continue;
      }
    }
    main.push(f);
  }
  return { main, byEmbed };
}

function selectListSql(
  state: BuildState,
  table: string,
  alias: string,
  items: SelectItem[],
  embedFilters: Map<string, FilterNode[]>,
  embedOrders: Map<string, OrderSpec[]>,
): { list: string; innerConds: string[] } {
  const parts: string[] = [];
  const innerConds: string[] = [];
  const effective = items.length ? items : [{ type: "star" } as SelectItem];
  for (const item of effective) {
    if (item.type === "star") {
      parts.push(`${alias}.*`);
    } else if (item.type === "col") {
      const e = columnExpr(item.expr, alias);
      const casted = item.cast ? `(${e})::${item.cast.replace(/[^A-Za-z0-9_ ]/g, "")}` : e;
      const asName = item.alias ?? (item.expr.includes("->") ? item.expr.split(/->>?/).pop()! : item.expr);
      parts.push(`${casted} as ${quoteIdent(asName)}`);
    } else {
      const rel = resolveRelation(state.meta, table, item.target, item.hint);
      const child = `e${++state.aliasCounter}`;
      const nestedFilters = embedFilters.get(item.alias) ?? embedFilters.get(item.target) ?? [];
      const nestedOrders = embedOrders.get(item.alias) ?? embedOrders.get(item.target) ?? [];
      const targetTable = rel.kind === "to-one" ? rel.fk.parent : rel.fk.child;
      const joinCond =
        rel.kind === "to-one"
          ? rel.fk.parentCols.map((c, i) => `${child}.${quoteIdent(c)} = ${alias}.${quoteIdent(rel.fk.childCols[i])}`)
          : rel.fk.childCols.map((c, i) => `${child}.${quoteIdent(c)} = ${alias}.${quoteIdent(rel.fk.parentCols[i])}`);
      const where = [
        ...joinCond,
        ...nestedFilters.map((f) => filterSql(f, state.sink, child)),
      ].join(" and ");
      const sub = selectListSql(state, targetTable, child, item.items, new Map(), new Map());
      const subWhere = [where, ...sub.innerConds].join(" and ");
      const inner = `select ${sub.list} from public.${quoteIdent(targetTable)} ${child} where ${subWhere}${orderSql(nestedOrders, child)}`;
      if (rel.kind === "to-many") {
        parts.push(`coalesce((select json_agg(to_json(_x${child})) from (${inner}) _x${child}), '[]'::json) as ${quoteIdent(item.alias)}`);
      } else {
        parts.push(`(select to_json(_x${child}) from (${inner} limit 1) _x${child}) as ${quoteIdent(item.alias)}`);
      }
      if (item.inner) {
        innerConds.push(`exists (select 1 from public.${quoteIdent(targetTable)} ${child}x where ${where.replace(new RegExp(`\\b${child}\\.`, "g"), `${child}x.`)})`);
      }
    }
  }
  return { list: parts.join(", "), innerConds };
}

// ---------------------------------------------------------------------------
// builder
// ---------------------------------------------------------------------------

export class QueryBuilder implements PromiseLike<DbResponse> {
  private action: Action = "select";
  private selectString: string | null = null;
  private returning = false;
  private filters: FilterNode[] = [];
  private orders: OrderSpec[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private countMode: "exact" | "planned" | "estimated" | null = null;
  private head = false;
  private payload: unknown = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private singleMode: "single" | "maybe" | null = null;
  private shouldThrow = false;

  private readonly table: string;
  private readonly contextProvider: ContextProvider;

  constructor(table: string, contextProvider: ContextProvider) {
    this.table = table;
    this.contextProvider = contextProvider;
  }

  // --- verbs ---------------------------------------------------------------

  select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    if (this.action === "select") {
      this.selectString = columns;
    } else {
      this.returning = true;
      this.selectString = columns;
    }
    if (options?.count) this.countMode = options.count;
    if (options?.head) this.head = true;
    return this;
  }

  insert(values: unknown, options?: { count?: "exact" | "planned" | "estimated"; defaultToNull?: boolean }) {
    this.action = "insert";
    this.payload = values;
    if (options?.count) this.countMode = options.count;
    return this;
  }

  upsert(
    values: unknown,
    options?: { onConflict?: string; ignoreDuplicates?: boolean; count?: "exact" | "planned" | "estimated"; defaultToNull?: boolean },
  ) {
    this.action = "upsert";
    this.payload = values;
    this.upsertOpts = { onConflict: options?.onConflict, ignoreDuplicates: options?.ignoreDuplicates };
    if (options?.count) this.countMode = options.count;
    return this;
  }

  update(values: unknown, options?: { count?: "exact" | "planned" | "estimated" }) {
    this.action = "update";
    this.payload = values;
    if (options?.count) this.countMode = options.count;
    return this;
  }

  delete(options?: { count?: "exact" | "planned" | "estimated" }) {
    this.action = "delete";
    if (options?.count) this.countMode = options.count;
    return this;
  }

  // --- filters -------------------------------------------------------------

  private cmp(column: string, op: string, value: unknown, negate = false) {
    this.filters.push({ kind: "cmp", column, op, value, negate });
    return this;
  }
  eq(column: string, value: unknown) { return this.cmp(column, "eq", value); }
  neq(column: string, value: unknown) { return this.cmp(column, "neq", value); }
  gt(column: string, value: unknown) { return this.cmp(column, "gt", value); }
  gte(column: string, value: unknown) { return this.cmp(column, "gte", value); }
  lt(column: string, value: unknown) { return this.cmp(column, "lt", value); }
  lte(column: string, value: unknown) { return this.cmp(column, "lte", value); }
  like(column: string, pattern: string) { return this.cmp(column, "like", pattern); }
  ilike(column: string, pattern: string) { return this.cmp(column, "ilike", pattern); }
  is(column: string, value: boolean | null) { return this.cmp(column, "is", value); }
  in(column: string, values: readonly unknown[]) { return this.cmp(column, "in", [...values]); }
  contains(column: string, value: unknown) { return this.cmp(column, "cs", value); }
  containedBy(column: string, value: unknown) { return this.cmp(column, "cd", value); }
  overlaps(column: string, value: unknown) { return this.cmp(column, "ov", value); }
  textSearch(column: string, query: string, options?: { type?: "plain" | "phrase" | "websearch" }) {
    const op = options?.type === "plain" ? "plfts" : options?.type === "phrase" ? "phfts" : options?.type === "websearch" ? "wfts" : "fts";
    return this.cmp(column, op, query);
  }
  not(column: string, operator: string, value: unknown) {
    return this.cmp(column, operator, operator === "in" ? parseOperandValue("in", value) : value, true);
  }
  filter(column: string, operator: string, value: unknown) {
    return this.cmp(column, operator, operator === "in" ? parseOperandValue("in", value) : value);
  }
  match(query: Record<string, unknown>) {
    for (const [k, v] of Object.entries(query)) this.cmp(k, "eq", v);
    return this;
  }
  or(filters: string) {
    this.filters.push(parseLogicTree(filters, "or"));
    return this;
  }

  // --- modifiers -----------------------------------------------------------

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string; foreignTable?: string }) {
    this.orders.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst,
      referencedTable: options?.referencedTable ?? options?.foreignTable,
    });
    return this;
  }
  limit(count: number) { this.limitN = count; return this; }
  range(from: number, to: number) { this.offsetN = from; this.limitN = to - from + 1; return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  throwOnError() { this.shouldThrow = true; return this; }
  returns<_T = unknown>() { return this; }
  abortSignal(_signal?: unknown) { return this; }
  setHeader(_name: string, _value: string) { return this; }

  // --- execution -----------------------------------------------------------

  then<R1 = DbResponse, R2 = never>(
    onfulfilled?: ((value: DbResponse) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<DbResponse> {
    let response: DbResponse;
    try {
      const ctx = await this.contextProvider();
      response = await runInContext(ctx, (db) => this.run(db));
    } catch (err) {
      response = { data: null, error: toDbError(err), count: null, status: 400, statusText: "Bad Request" };
    }
    if (response.error && this.shouldThrow) {
      const e = new Error(response.error.message) as Error & DbError;
      Object.assign(e, response.error);
      throw e;
    }
    return response;
  }

  private tableSql() {
    return `public.${quoteIdent(this.table)}`;
  }

  private async run(db: Queryable): Promise<DbResponse> {
    const meta = await loadSchemaMeta(db);
    const state: BuildState = { meta, sink: { params: [] }, aliasCounter: 0 };
    const a = "a";

    const items = this.selectString !== null ? parseSelect(this.selectString) : [];
    const embedNames = new Set<string>();
    const collect = (list: SelectItem[]) => {
      for (const it of list) if (it.type === "embed") { embedNames.add(it.alias); embedNames.add(it.target); }
    };
    collect(items);
    const { main, byEmbed } = splitEmbedFilters(this.filters, embedNames);
    const embedOrders = new Map<string, OrderSpec[]>();
    const mainOrders: OrderSpec[] = [];
    for (const o of this.orders) {
      if (o.referencedTable) {
        const list = embedOrders.get(o.referencedTable) ?? [];
        list.push({ ...o, referencedTable: undefined });
        embedOrders.set(o.referencedTable, list);
      } else mainOrders.push(o);
    }

    let wantsRows = this.action === "select" ? !this.head : this.returning;
    let status = this.action === "insert" || this.action === "upsert" ? 201 : 200;

    // WHERE clause (select / update / delete)
    const buildWhere = (innerConds: string[]) => {
      const conds = [...main.map((f) => filterSql(f, state.sink, a)), ...innerConds];
      return conds.length ? ` where ${conds.join(" and ")}` : "";
    };

    let rows: unknown[] = [];
    let count: number | null = null;

    if (this.action === "select") {
      const sel = selectListSql(state, this.table, a, items.length ? items : [{ type: "star" }], byEmbed, embedOrders);
      // Inner-join conditions need their own params; they were rendered into sink already.
      const where = buildWhere(sel.innerConds);
      if (this.countMode) {
        const countState: BuildState = { meta, sink: { params: [] }, aliasCounter: 0 };
        const countConds = main.map((f) => filterSql(f, countState.sink, a));
        const countWhere = countConds.length ? ` where ${countConds.join(" and ")}` : "";
        const cres = await db.query<{ n: string }>(`select count(*)::text as n from ${this.tableSql()} ${a}${countWhere}`, countState.sink.params);
        count = Number(cres.rows[0]?.n ?? 0);
      }
      if (wantsRows) {
        let sql = `select to_json(_r) as j from (select ${sel.list} from ${this.tableSql()} ${a}${where}${orderSql(mainOrders, a)}`;
        if (this.limitN !== null) sql += ` limit ${Math.max(0, Math.floor(this.limitN))}`;
        if (this.offsetN !== null) sql += ` offset ${Math.max(0, Math.floor(this.offsetN))}`;
        sql += ") _r";
        const res = await db.query<{ j: unknown }>(sql, state.sink.params);
        rows = res.rows.map((r) => r.j);
      }
    } else if (this.action === "insert" || this.action === "upsert") {
      const records = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Record<string, unknown>[];
      if (!records.length || records.every((r) => r === null || r === undefined)) {
        return { data: wantsRows ? [] : null, error: null, count: 0, status: 201, statusText: "Created" };
      }
      const columns = Array.from(new Set(records.flatMap((r) => Object.keys(r ?? {}))));
      const colList = columns.map(quoteIdent).join(", ");
      const jsonParam = `$${state.sink.params.push(JSON.stringify(records))}`;
      let sql = `insert into ${this.tableSql()} as ${a} (${colList}) select ${colList} from json_populate_recordset(null::${this.tableSql()}, ${jsonParam}::json)`;
      if (this.action === "upsert") {
        const target = this.upsertOpts.onConflict
          ? this.upsertOpts.onConflict.split(",").map((c) => c.trim())
          : meta.pks.get(this.table) ?? [];
        if (!target.length) throw new Error(`Upsert on ${this.table} needs onConflict or a primary key`);
        sql += ` on conflict (${target.map(quoteIdent).join(", ")})`;
        const updatable = columns.filter((c) => !target.includes(c));
        if (this.upsertOpts.ignoreDuplicates || !updatable.length) sql += " do nothing";
        else sql += ` do update set ${updatable.map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`).join(", ")}`;
      }
      const res = await this.mutate(db, state, sql, items, byEmbed, embedOrders, wantsRows);
      rows = res.rows;
      count = res.count;
    } else if (this.action === "update") {
      if (!this.filters.length) {
        return { data: null, error: { message: "UPDATE requires a WHERE clause", details: "", hint: "", code: "21000" }, count: null, status: 400, statusText: "Bad Request" };
      }
      const record = (this.payload ?? {}) as Record<string, unknown>;
      const columns = Object.keys(record);
      if (!columns.length) {
        return { data: wantsRows ? [] : null, error: null, count: 0, status: 200, statusText: "OK" };
      }
      const colList = columns.map(quoteIdent).join(", ");
      const jsonParam = `$${state.sink.params.push(JSON.stringify(record))}`;
      const setClause =
        columns.length === 1
          ? `${quoteIdent(columns[0])} = (select ${quoteIdent(columns[0])} from json_populate_record(null::${this.tableSql()}, ${jsonParam}::json))`
          : `(${colList}) = (select ${colList} from json_populate_record(null::${this.tableSql()}, ${jsonParam}::json))`;
      const sql = `update ${this.tableSql()} ${a} set ${setClause}${buildWhere([])}`;
      const res = await this.mutate(db, state, sql, items, byEmbed, embedOrders, wantsRows);
      rows = res.rows;
      count = res.count;
    } else {
      if (!this.filters.length) {
        return { data: null, error: { message: "DELETE requires a WHERE clause", details: "", hint: "", code: "21000" }, count: null, status: 400, statusText: "Bad Request" };
      }
      status = 200;
      const sql = `delete from ${this.tableSql()} ${a}${buildWhere([])}`;
      const res = await this.mutate(db, state, sql, items, byEmbed, embedOrders, wantsRows);
      rows = res.rows;
      count = res.count;
    }

    // shape result
    if (this.singleMode) {
      if (rows.length !== 1) {
        if (this.singleMode === "maybe" && rows.length === 0) {
          return { data: null, error: null, count, status: 200, statusText: "OK" };
        }
        return {
          data: null,
          error: {
            message: "JSON object requested, multiple (or no) rows returned",
            details: `The result contains ${rows.length} rows`,
            hint: "",
            code: "PGRST116",
          },
          count,
          status: 406,
          statusText: "Not Acceptable",
        };
      }
      return { data: rows[0], error: null, count, status, statusText: "OK" };
    }
    if (!wantsRows) return { data: null, error: null, count, status, statusText: "OK" };
    return { data: rows, error: null, count, status, statusText: "OK" };
  }

  private async mutate(
    db: Queryable,
    state: BuildState,
    baseSql: string,
    items: SelectItem[],
    byEmbed: Map<string, FilterNode[]>,
    embedOrders: Map<string, OrderSpec[]>,
    wantsRows: boolean,
  ): Promise<{ rows: unknown[]; count: number | null }> {
    if (!wantsRows) {
      const res = await db.query(baseSql, state.sink.params);
      return { rows: [], count: this.countMode ? res.rowCount : null };
    }
    const sel = selectListSql(state, this.table, "m", items.length ? items : [{ type: "star" }], byEmbed, embedOrders);
    const sql = `with _m as (${baseSql} returning *) select to_json(_r) as j from (select ${sel.list} from _m m) _r`;
    const res = await db.query<{ j: unknown }>(sql, state.sink.params);
    return { rows: res.rows.map((r) => r.j), count: this.countMode ? res.rows.length : null };
  }
}
