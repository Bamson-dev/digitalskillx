import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

/**
 * Atomic per-reference claim for external Paystack fulfilment.
 *
 * The transactions table has a UNIQUE constraint on reference. The first caller to INSERT
 * the row owns the claim. Every other concurrent caller reads the row and sees a live claim.
 * A claim is a lease: it carries an id and an expiry in paystack_data. An expired or released
 * claim is taken over with a compare-and-swap UPDATE, so exactly one taker wins.
 *
 * Only the claim holder may enrol, send the access email or track the Purchase.
 */

type Admin = SupabaseClient<Database>;

export const CLAIM_LEASE_MS = 90_000;
const CLAIM_ID_KEY = "fulfillment_claim_id";
const CLAIM_EXPIRES_KEY = "fulfillment_claim_expires_at";
const ROW_COLUMNS = "id, status, student_id, course_id, paystack_data, updated_at";

export type ClaimedTransactionRow = {
  id: string;
  status: string;
  student_id: string | null;
  course_id: string;
  paystack_data: Json;
  updated_at: string | null;
};

type TxInsert = {
  student_id: string | null;
  course_id: string;
  amount: number;
  currency: string;
  provider: "paystack";
  reference: string;
  status: "pending";
  paystack_data: Record<string, unknown>;
};

export type ClaimResult =
  | { kind: "claimed"; claimId: string; row: ClaimedTransactionRow }
  | { kind: "busy" }
  | { kind: "error"; message: string };

type LooseQuery = {
  eq(column: string, value: unknown): LooseQuery;
  is(column: string, value: null): LooseQuery;
  select(columns: string): PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>;
};

function dataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readClaim(paystackData: unknown): { id: string | null; expiresAt: number } {
  const data = dataOf(paystackData);
  const id = typeof data[CLAIM_ID_KEY] === "string" ? (data[CLAIM_ID_KEY] as string) : null;
  const expires =
    typeof data[CLAIM_EXPIRES_KEY] === "string" ? Date.parse(data[CLAIM_EXPIRES_KEY] as string) : NaN;
  return { id, expiresAt: Number.isFinite(expires) ? expires : 0 };
}

export function isDuplicateKeyError(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false;
  return error.code === "23505" || (error.message ?? "").toLowerCase().includes("duplicate");
}

async function readRow(admin: Admin, reference: string): Promise<ClaimedTransactionRow | null> {
  const { data } = await admin
    .from("transactions")
    .select(ROW_COLUMNS)
    .eq("reference", reference)
    .maybeSingle();
  return (data as ClaimedTransactionRow | null) ?? null;
}

export async function claimExternalPayment(
  admin: Admin,
  params: {
    reference: string;
    insertRow: TxInsert;
    now?: () => number;
    leaseMs?: number;
  },
): Promise<ClaimResult> {
  const now = params.now ?? Date.now;
  const leaseMs = params.leaseMs ?? CLAIM_LEASE_MS;
  const claimId = randomUUID();
  const claimFields = () => ({
    [CLAIM_ID_KEY]: claimId,
    [CLAIM_EXPIRES_KEY]: new Date(now() + leaseMs).toISOString(),
  });

  // 1. First writer wins the unique reference.
  const insert = await admin
    .from("transactions")
    .insert({
      ...params.insertRow,
      paystack_data: { ...params.insertRow.paystack_data, ...claimFields() } as Json,
    })
    .select(ROW_COLUMNS)
    .maybeSingle();
  if (!insert.error && insert.data) {
    return { kind: "claimed", claimId, row: insert.data as ClaimedTransactionRow };
  }
  if (insert.error && !isDuplicateKeyError(insert.error)) {
    return { kind: "error", message: insert.error.message };
  }

  // 2. Someone else owns the row. Inspect the claim.
  const row = await readRow(admin, params.reference);
  if (!row) return { kind: "error", message: "Transaction row missing after duplicate insert." };

  const current = readClaim(row.paystack_data);
  if (current.id && current.expiresAt > now()) return { kind: "busy" };

  // 3. Expired or released claim: compare-and-swap takeover. Exactly one caller matches.
  let query = (admin.from("transactions").update({
    paystack_data: { ...dataOf(row.paystack_data), ...claimFields() } as Json,
    updated_at: new Date(now()).toISOString(),
  }) as unknown as LooseQuery).eq("reference", params.reference);
  query = current.id
    ? query.eq(`paystack_data->>${CLAIM_ID_KEY}`, current.id)
    : query.is(`paystack_data->>${CLAIM_ID_KEY}`, null);
  query = row.updated_at ? query.eq("updated_at", row.updated_at) : query.is("updated_at", null);

  const swapped = await query.select(ROW_COLUMNS);
  if (swapped.error) return { kind: "error", message: swapped.error.message };
  if (!swapped.data || swapped.data.length !== 1) return { kind: "busy" };
  return { kind: "claimed", claimId, row: swapped.data[0] as ClaimedTransactionRow };
}

/** True while this claim id is still the live lease on the row. */
export async function holdsClaim(
  admin: Admin,
  reference: string,
  claimId: string,
  now: () => number = Date.now,
): Promise<boolean> {
  const row = await readRow(admin, reference);
  if (!row) return false;
  const current = readClaim(row.paystack_data);
  return current.id === claimId && current.expiresAt > now();
}

/** Extend the lease while the holder is still working. Returns false if the claim was lost. */
export async function renewClaim(
  admin: Admin,
  reference: string,
  claimId: string,
  now: () => number = Date.now,
  leaseMs: number = CLAIM_LEASE_MS,
): Promise<boolean> {
  const row = await readRow(admin, reference);
  if (!row || readClaim(row.paystack_data).id !== claimId) return false;
  const query = (admin.from("transactions").update({
    paystack_data: {
      ...dataOf(row.paystack_data),
      [CLAIM_EXPIRES_KEY]: new Date(now() + leaseMs).toISOString(),
    } as Json,
    updated_at: new Date(now()).toISOString(),
  }) as unknown as LooseQuery)
    .eq("reference", reference)
    .eq(`paystack_data->>${CLAIM_ID_KEY}`, claimId);
  const result = await query.select("id");
  return !result.error && (result.data?.length ?? 0) === 1;
}

/** Release the lease. Does nothing when the claim already belongs to someone else. */
export async function releaseClaim(admin: Admin, reference: string, claimId: string): Promise<void> {
  const row = await readRow(admin, reference);
  if (!row || readClaim(row.paystack_data).id !== claimId) return;
  const next = { ...dataOf(row.paystack_data) };
  next[CLAIM_ID_KEY] = null;
  next[CLAIM_EXPIRES_KEY] = null;
  const query = (admin.from("transactions").update({
    paystack_data: next as Json,
    updated_at: new Date().toISOString(),
  }) as unknown as LooseQuery)
    .eq("reference", reference)
    .eq(`paystack_data->>${CLAIM_ID_KEY}`, claimId);
  await query.select("id");
}
