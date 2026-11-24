/**
 * Filter model and SQL generation for the node-postgres data layer.
 * Mirrors the PostgREST filter semantics the app already relies on
 * (eq, neq, gt, gte, lt, lte, like, ilike, is, in, cs, not, or, JSON paths).
 * Pure functions, no I/O.
 */

export type FilterNode =
  | { kind: "cmp"; column: string; op: string; value: unknown; negate?: boolean }
  | { kind: "or"; children: FilterNode[] }
  | { kind: "and"; children: FilterNode[] };

export type ParamSink = { params: unknown[] };

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quoteIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
}

/** `a`, `a->b->>c`, `t.a` -> SQL expression. */
export function columnExpr(ref: string, alias?: string): string {
  const parts = ref.split(/(->>|->)/);
  const base = parts[0].trim();
  const baseSql = base.includes(".")
    ? base
        .split(".")
        .map((p) => quoteIdent(p))
        .join(".")
    : alias
      ? `${alias}.${quoteIdent(base)}`
      : quoteIdent(base);
  let sql = baseSql;
  for (let i = 1; i < parts.length; i += 2) {
    const arrow = parts[i];
    const key = parts[i + 1].trim();
    const lit = /^-?\d+$/.test(key) ? key : `'${key.replace(/'/g, "''")}'`;
    sql += `${arrow}${lit}`;
  }
  return sql;
}

function push(sink: ParamSink, value: unknown): string {
  sink.params.push(value);
  return `$${sink.params.length}`;
}

function scalarParam(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/** PostgREST array literal for `cs` / `cd` / `ov` filters. */
function pgArrayLiteral(values: unknown[]): string {
  const items = values.map((v) => {
    const s = String(v);
    return /[",{}\s\\]/.test(s) || s === "" ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s;
  });
  return `{${items.join(",")}}`;
}

function cmpSql(node: Extract<FilterNode, { kind: "cmp" }>, sink: ParamSink, alias?: string): string {
  const col = columnExpr(node.column, alias);
  const { op, value } = node;
  let sql: string;
  switch (op) {
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const sym = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op];
      if (value === null) {
        // PostgREST treats eq.null as a plain string compare; supabase-js callers use .is().
        sql = `${col} ${sym} ${push(sink, null)}`;
      } else {
        sql = `${col} ${sym} ${push(sink, scalarParam(value))}`;
      }
      break;
    }
    case "like":
    case "ilike": {
      const pattern = String(value).replace(/\*/g, "%");
      sql = `${col} ${op === "like" ? "LIKE" : "ILIKE"} ${push(sink, pattern)}`;
      break;
    }
    case "is": {
      if (value === null || value === "null") sql = `${col} IS NULL`;
      else if (value === true || value === "true") sql = `${col} IS TRUE`;
      else if (value === false || value === "false") sql = `${col} IS FALSE`;
      else sql = `${col} IS NOT DISTINCT FROM ${push(sink, scalarParam(value))}`;
      break;
    }
    case "in": {
      const list = Array.isArray(value) ? value : [];
      if (list.length === 0) {
        sql = "FALSE";
      } else {
        sql = `${col} IN (${list.map((v) => push(sink, scalarParam(v))).join(", ")})`;
      }
      break;
    }
    case "cs":
    case "cd":
    case "ov": {
      const sym = { cs: "@>", cd: "<@", ov: "&&" }[op];
      let param: unknown;
      if (Array.isArray(value)) param = pgArrayLiteral(value);
      else if (typeof value === "string") param = value;
      else param = JSON.stringify(value);
      sql = `${col} ${sym} ${push(sink, param)}`;
      break;
    }
    case "fts":
    case "plfts":
    case "phfts":
    case "wfts": {
      const fn = { fts: "to_tsquery", plfts: "plainto_tsquery", phfts: "phraseto_tsquery", wfts: "websearch_to_tsquery" }[op];
      sql = `${col} @@ ${fn}(${push(sink, String(value))})`;
      break;
    }
    default:
      throw new Error(`Unsupported filter operator: ${op}`);
  }
  return node.negate ? `NOT (${sql})` : sql;
}

export function filterSql(node: FilterNode, sink: ParamSink, alias?: string): string {
  if (node.kind === "cmp") return cmpSql(node, sink, alias);
  const joiner = node.kind === "or" ? " OR " : " AND ";
  if (node.children.length === 0) return node.kind === "or" ? "FALSE" : "TRUE";
  return `(${node.children.map((c) => filterSql(c, sink, alias)).join(joiner)})`;
}

/** Split on top-level commas (ignores commas inside parentheses and double quotes). */
function splitTop(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' && input[i - 1] !== "\\") quoted = !quoted;
    if (!quoted) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur.length) out.push(cur);
  return out;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return t;
}

export function parseOperandValue(op: string, raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  return parseOperand(op, raw);
}

function parseOperand(op: string, raw: string): unknown {
  if (op === "in") {
    const inner = raw.trim().replace(/^\(/, "").replace(/\)$/, "");
    return splitTop(inner).map(unquote);
  }
  if (op === "is") return raw === "null" ? null : raw;
  if (op === "cs" || op === "cd" || op === "ov") return unquote(raw);
  return unquote(raw);
}

/** Parse a PostgREST `or=(...)` / `and=(...)` body such as `a.eq.1,b.is.null`. */
export function parseLogicTree(body: string, kind: "or" | "and" = "or"): FilterNode {
  const children: FilterNode[] = [];
  for (const piece of splitTop(body)) {
    const t = piece.trim();
    if (!t) continue;
    const grouped = /^(not\.)?(and|or)\(([\s\S]*)\)$/.exec(t);
    if (grouped) {
      if (grouped[1]) throw new Error("not.and / not.or filters are not supported");
      children.push(parseLogicTree(grouped[3], grouped[2] as "or" | "and"));
      continue;
    }
    const m = /^([^.]+(?:->>?[^.]+)*)\.(not\.)?([a-z]+)\.([\s\S]*)$/.exec(t);
    if (!m) throw new Error(`Cannot parse filter: ${t}`);
    const [, column, neg, op, raw] = m;
    children.push({ kind: "cmp", column, op, value: parseOperand(op, raw), negate: Boolean(neg) });
  }
  return { kind, children };
}
