/**
 * Pure segment rule evaluation (no server-only — safe for offline tests).
 */

export type SegmentRuleField =
  | "purchase_count"
  | "total_spent_ngn"
  | "has_tag"
  | "inactive_days"
  | "enrolled_course"
  | "completed_course"
  | "purchased_course"
  | "not_purchased_course"
  | "has_certificate";

export type SegmentRule = {
  field: SegmentRuleField;
  op: "gte" | "lte" | "eq" | "neq" | "exists";
  value: string | number | boolean;
};

export type SegmentDefinition = {
  logic: "and" | "or";
  rules: SegmentRule[];
};

export type SegmentEvalCtx = {
  purchaseCount: number;
  totalSpentNgn: number;
  tags: string[];
  lastActiveAt: string | null;
  enrolledCourseIds: Set<string>;
  completedCourseIds: Set<string>;
  purchasedCourseIds: Set<string>;
  hasCertificate: boolean;
};

export function normalizeSegmentDefinition(raw: unknown): SegmentDefinition {
  if (!raw || typeof raw !== "object") return { logic: "and", rules: [] };
  const o = raw as Record<string, unknown>;
  const logic = o.logic === "or" ? "or" : "and";
  const rules: SegmentRule[] = [];
  if (Array.isArray(o.rules)) {
    for (const r of o.rules.slice(0, 12)) {
      if (!r || typeof r !== "object") continue;
      const row = r as Record<string, unknown>;
      const field = String(row.field ?? "") as SegmentRuleField;
      const op = String(row.op ?? "eq") as SegmentRule["op"];
      if (!field) continue;
      rules.push({ field, op, value: row.value as string | number | boolean });
    }
  }
  return { logic, rules };
}

function matchRule(rule: SegmentRule, ctx: SegmentEvalCtx): boolean {
  const daysInactive = ctx.lastActiveAt
    ? Math.floor((Date.now() - new Date(ctx.lastActiveAt).getTime()) / 86400000)
    : 9999;

  switch (rule.field) {
    case "purchase_count": {
      const n = Number(rule.value);
      if (rule.op === "gte") return ctx.purchaseCount >= n;
      if (rule.op === "lte") return ctx.purchaseCount <= n;
      return ctx.purchaseCount === n;
    }
    case "total_spent_ngn": {
      const n = Number(rule.value);
      if (rule.op === "gte") return ctx.totalSpentNgn >= n;
      if (rule.op === "lte") return ctx.totalSpentNgn <= n;
      return ctx.totalSpentNgn === n;
    }
    case "has_tag": {
      const tag = String(rule.value).trim().toLowerCase();
      const has = ctx.tags.some((t) => t.toLowerCase() === tag);
      return rule.op === "neq" ? !has : has;
    }
    case "inactive_days": {
      const n = Number(rule.value);
      return daysInactive >= n;
    }
    case "enrolled_course": {
      const id = String(rule.value);
      const has = ctx.enrolledCourseIds.has(id);
      return rule.op === "neq" ? !has : has;
    }
    case "completed_course": {
      const id = String(rule.value);
      return ctx.completedCourseIds.has(id);
    }
    case "purchased_course": {
      const id = String(rule.value);
      return ctx.purchasedCourseIds.has(id);
    }
    case "not_purchased_course": {
      const id = String(rule.value);
      return !ctx.purchasedCourseIds.has(id);
    }
    case "has_certificate":
      return Boolean(rule.value) ? ctx.hasCertificate : !ctx.hasCertificate;
    default:
      return false;
  }
}

export function evaluateSegment(def: SegmentDefinition, ctx: SegmentEvalCtx): boolean {
  if (!def.rules.length) return false;
  if (def.logic === "or") return def.rules.some((r) => matchRule(r, ctx));
  return def.rules.every((r) => matchRule(r, ctx));
}
