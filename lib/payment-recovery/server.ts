import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { getPaystackSecretKey } from "@/lib/env-paystack";
import { generateReference, initializeTransaction } from "@/lib/paystack";
import { completePaidCheckout, resolveOrCreateStudentForPurchase } from "@/lib/guest-checkout";
import { fulfillPurchase } from "@/lib/purchase";
import { sendEmail } from "@/lib/email";
import { nairaToKobo } from "@/lib/currency";
import { siteUrl } from "@/lib/org";
import { readRecoveryConfig } from "./config";
import type { Db, Group, RecoveryDeps } from "./engine";
import type { VerifyOutcome } from "./status";

const PAYSTACK = "https://api.paystack.co";
const VERIFY_TIMEOUT_MS = 15_000;

export function recoveryDb(admin: SupabaseClient<Database>): Db {
  return admin as unknown as Db;
}

/** Server-side Paystack verify that separates "not found" from "unreachable". */
export async function verifyForRecovery(reference: string, admin: SupabaseClient<Database>): Promise<VerifyOutcome> {
  let secret: string | null | undefined;
  try {
    secret = await getPaystackSecretKey(admin);
  } catch {
    return { kind: "error", message: "secret_unavailable" };
  }
  if (!secret) return { kind: "error", message: "secret_unavailable" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${PAYSTACK}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: controller.signal,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: { status?: string; amount?: number; currency?: string; gateway_response?: string; channel?: string };
    } | null;
    if (res.status >= 500 || !json) return { kind: "error", message: `http_${res.status}` };
    if (!json.status) {
      if (res.status === 400 || res.status === 404 || /not found/i.test(json.message ?? "")) {
        return { kind: "not_found" };
      }
      return { kind: "error", message: (json.message ?? "verify_failed").slice(0, 120) };
    }
    return {
      kind: "ok",
      status: String(json.data?.status ?? ""),
      amount: json.data?.amount,
      currency: json.data?.currency,
      gatewayResponse: json.data?.gateway_response ?? null,
      channel: json.data?.channel ?? null,
    };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.name : "network" };
  } finally {
    clearTimeout(timer);
  }
}

async function isAlreadyPaid(admin: SupabaseClient<Database>, group: Group) {
  if (!group.course_id) return false;
  const email = group.customer_email.toLowerCase();
  const { data: tx } = await admin
    .from("transactions")
    .select("id")
    .eq("course_id", group.course_id)
    .eq("status", "success")
    .eq("paystack_data->>checkout_email", email)
    .limit(1);
  if ((tx ?? []).length > 0) return true;
  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  const studentId = profile?.id ?? group.student_id;
  if (!studentId) return false;
  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", studentId)
    .eq("course_id", group.course_id)
    .maybeSingle();
  return Boolean(enrollment);
}

export async function buildRecoveryDeps(admin?: SupabaseClient<Database>): Promise<{ db: Db; deps: RecoveryDeps; admin: SupabaseClient<Database> }> {
  const client = admin ?? (await createAdminClientAsync());
  const base = siteUrl();
  const deps: RecoveryDeps = {
    now: () => Date.now(),
    config: readRecoveryConfig(),
    siteUrl: base,
    randomToken: (bytes) => crypto.randomBytes(bytes).toString("hex"),
    newReference: () => generateReference(),
    verify: (reference) => verifyForRecovery(reference, client),
    completePaidCheckout: async (reference) => {
      const r = await completePaidCheckout(reference);
      return r.ok ? { ok: true } : { ok: false, error: "error" in r ? String(r.error) : "fulfilment_failed" };
    },
    isAlreadyPaid: (group) => isAlreadyPaid(client, group),
    sendEmail: async (p) => {
      const r = await sendEmail({ to: p.to, subject: p.subject, html: p.html, idempotencyKey: p.idempotencyKey, tags: p.tags });
      if ("messageId" in r) return { messageId: r.messageId };
      if ("skipped" in r) return { skipped: true, error: r.error.message };
      return { error: r.error instanceof Error ? r.error.message : String(r.error) };
    },
    loadProduct: async (courseId) => {
      const { data } = await client
        .from("courses")
        .select("title, price_ngn, visibility, is_coming_soon, enrollment_type")
        .eq("id", courseId)
        .maybeSingle();
      if (!data) return null;
      return {
        title: data.title,
        priceKobo: nairaToKobo(Number(data.price_ngn ?? 0)),
        available: data.visibility === "published" && !data.is_coming_soon && data.enrollment_type === "open",
      };
    },
    createPendingTransaction: async ({ reference, group, amountKobo }) => {
      const { error } = await client.from("transactions").insert({
        student_id: group.student_id,
        course_id: group.course_id,
        amount: amountKobo,
        currency: "NGN",
        reference,
        status: "pending",
        paystack_data: {
          checkout_email: group.customer_email,
          checkout_full_name: group.customer_name ?? "",
          recovery_group_id: group.id,
        } as Json,
      });
      if (error) throw new Error(error.message);
    },
    initializePaystack: async ({ reference, group, amountKobo }) => {
      const metadata: Record<string, string> = {
        course_id: String(group.course_id),
        currency: "NGN",
        buyer_email: group.customer_email,
        buyer_full_name: group.customer_name ?? "",
        recovery_group_id: group.id,
      };
      if (group.student_id) metadata.student_id = group.student_id;
      const init = await initializeTransaction(
        {
          email: group.customer_email,
          amountMinor: amountKobo,
          currency: "NGN",
          reference,
          callbackUrl: `${base}/course/${group.course_id}?payment=success`,
          metadata,
          customerName: group.customer_name ?? undefined,
        },
        client,
      );
      return { authorizationUrl: init.authorization_url };
    },
    fulfilBankTransfer: async (group) => {
      if (!group.course_id) return { ok: false, error: "Order has no course." };
      try {
        const { data: existing } = await client
          .from("transactions")
          .select("id, status")
          .eq("reference", group.bank_reference)
          .maybeSingle();
        if (!existing) {
          const { error } = await client.from("transactions").insert({
            student_id: group.student_id,
            course_id: group.course_id,
            amount: group.amount_kobo,
            currency: "NGN",
            reference: group.bank_reference,
            status: "pending",
            paystack_data: {
              checkout_email: group.customer_email,
              checkout_full_name: group.customer_name ?? "",
              recovery_group_id: group.id,
              payment_method: "bank_transfer",
            } as Json,
          });
          if (error && !/duplicate/i.test(error.message)) return { ok: false, error: error.message };
        }
        const resolved = await resolveOrCreateStudentForPurchase(client, {
          email: group.customer_email,
          fullName: group.customer_name,
        });
        await client
          .from("transactions")
          .update({ student_id: resolved.studentId })
          .eq("reference", group.bank_reference)
          .is("student_id", null);
        await fulfillPurchase({
          studentId: resolved.studentId,
          courseId: group.course_id,
          reference: group.bank_reference,
          welcomePassword: resolved.password,
          buyerEmail: group.customer_email,
          buyerName: group.customer_name ?? undefined,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Enrolment failed." };
      }
    },
  };
  return { db: recoveryDb(client), deps, admin: client };
}
