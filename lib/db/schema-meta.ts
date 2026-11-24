import type { Queryable } from "./pool";

/**
 * Foreign key and primary key metadata, read once from pg_catalog.
 * Used to resolve embedded selects (`course:courses(title)`) and default upsert targets.
 * Schema changes only happen through migrations, so one load per process is enough;
 * `resetSchemaMeta()` exists for tests.
 */

export type ForeignKey = {
  name: string;
  child: string;
  childCols: string[];
  parent: string;
  parentCols: string[];
  /** True when the child columns are unique, so the relation is one-to-one. */
  childUnique: boolean;
};

export type SchemaMeta = {
  fks: ForeignKey[];
  pks: Map<string, string[]>;
};

let cached: Promise<SchemaMeta> | null = null;

export function resetSchemaMeta() {
  cached = null;
}

export function loadSchemaMeta(db: Queryable): Promise<SchemaMeta> {
  if (!cached) {
    cached = (async () => {
      const fkRes = await db.query<{
        name: string;
        child: string;
        parent: string;
        child_cols: string[];
        parent_cols: string[];
        child_unique: boolean;
      }>(`
        select c.conname as name,
               cr.relname as child,
               pr.relname as parent,
               array(select a.attname::text from unnest(c.conkey) with ordinality k(n, o)
                     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.o) as child_cols,
               array(select a.attname::text from unnest(c.confkey) with ordinality k(n, o)
                     join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by k.o) as parent_cols,
               exists (select 1 from pg_index i
                       where i.indrelid = c.conrelid and i.indisunique
                         and i.indnatts = array_length(c.conkey, 1)
                         and (select array_agg(x order by x) from unnest(i.indkey::int2[]) x)
                           = (select array_agg(x order by x) from unnest(c.conkey) x)) as child_unique
        from pg_constraint c
        join pg_class cr on cr.oid = c.conrelid
        join pg_class pr on pr.oid = c.confrelid
        where c.contype = 'f'
          and cr.relnamespace = 'public'::regnamespace
          and pr.relnamespace = 'public'::regnamespace
      `);
      const pkRes = await db.query<{ tbl: string; cols: string[] }>(`
        select cr.relname as tbl,
               array(select a.attname::text from unnest(c.conkey) with ordinality k(n, o)
                     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by k.o) as cols
        from pg_constraint c
        join pg_class cr on cr.oid = c.conrelid
        where c.contype = 'p' and cr.relnamespace = 'public'::regnamespace
      `);
      return {
        fks: fkRes.rows.map((r) => ({
          name: r.name,
          child: r.child,
          childCols: r.child_cols,
          parent: r.parent,
          parentCols: r.parent_cols,
          childUnique: r.child_unique,
        })),
        pks: new Map(pkRes.rows.map((r) => [r.tbl, r.cols])),
      };
    })().catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}

export type Relation =
  | { kind: "to-one"; fk: ForeignKey }
  | { kind: "to-many"; fk: ForeignKey }
  | { kind: "to-one-reverse"; fk: ForeignKey };

/** Resolve how `target` relates to `source`. `hint` is a FK constraint name or FK column. */
export function resolveRelation(meta: SchemaMeta, source: string, target: string, hint?: string): Relation {
  const matchesHint = (fk: ForeignKey) =>
    !hint || hint === fk.name || fk.childCols.includes(hint) || fk.parentCols.includes(hint);

  const forward = meta.fks.filter((fk) => fk.child === source && fk.parent === target && matchesHint(fk));
  const reverse = meta.fks.filter((fk) => fk.parent === source && fk.child === target && matchesHint(fk));
  const all = forward.length + reverse.length;
  if (all === 0) throw new Error(`No relationship found between ${source} and ${target}`);
  if (all > 1) {
    throw new Error(`Ambiguous relationship between ${source} and ${target}; add a hint (${[...forward, ...reverse].map((f) => f.name).join(", ")})`);
  }
  if (forward.length === 1) return { kind: "to-one", fk: forward[0] };
  const fk = reverse[0];
  return fk.childUnique ? { kind: "to-one-reverse", fk } : { kind: "to-many", fk };
}
