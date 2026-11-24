import "server-only";
import crypto from "crypto";
import type { DbClient } from "@/lib/db/client";
import type { Json } from "@/types/database";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { getPaystackSecretKey } from "@/lib/env-paystack";
import { generateReference, initializeTransaction } from "@/lib/paystack";
import { nairaToKobo } from "@/lib/currency";
import { resolveFinalCertificatePrice } from "@/lib/learn-certificate-pricing";
import { completePaidCheckout, resolveOrCreateStudentForPurchase } from "@/lib/guest-checkout";
import { fulfillPurchase } from "@/lib/purchase";
import { fulfillPaystackExternalCharge } from "@/lib/paystack-external-fulfillment";
import { pathCertificateOfferable } from "@/lib/content-factory/library-shared";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/org";
import { readRecoveryConfig } from "./config";
import type { Db, Group, RecoveryDeps } from "./engine";
import type { VerifyOutcome } from "./status";

const PAYSTACK = "https://api.paystack.co";
const VERIFY_TIMEOUT_MS = 15_000;

export function recoveryDb(admin: DbClient): Db {
  return admin as unknown as Db;
}

/** Server-side Paystack verify that separates "not found" from "unreachable". */
export async function verifyForRecovery(reference: string, admin: DbClient): Promise<VerifyOutcome> {
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

async function isAlreadyPaid(admin: DbClient, group: Group) {
  const email = group.customer_email.toLowerCase();
  const columns: Record<string, string> = {
    course: "course_id",
    offer: "offer_id",
    bundle: "bundle_id",
    certificate: "learning_path_id",
    digital_product: "digital_product_id",
  };
  const column = columns[group.product_type];
  if (!column) return false;

  let query = admin
    .from("transactions")
    .select("id")
    .eq(column, group.product_id)
    .eq("status", "success");
  query = group.student_id
    ? query.eq("student_id", group.student_id)
    : query.eq("paystack_data->>checkout_email", email);
  const { data: tx } = await query.limit(1);
  if ((tx ?? []).length > 0) return true;

  const { data: profile } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  const studentId = group.student_id ?? profile?.id ?? null;
  if (!studentId) return false;

  if (group.product_type === "course" && group.course_id) {
    const { data: enrollment } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", studentId)
      .eq("course_id", group.course_id)
      .maybeSingle();
    return Boolean(enrollment);
  }

  if (group.product_type === "certificate") {
    const { data: certificate } = await admin
      .from("certificates")
      .select("id")
      .eq("student_id", studentId)
      .eq("learning_path_id", group.product_id)
      .eq("is_valid", true)
      .maybeSingle();
    return Boolean(certificate);
  }

  return false;
}

export async function buildRecoveryDeps(admin?: DbClient): Promise<{ db: Db; deps: RecoveryDeps; admin: DbClient }> {
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
    completeExternalPayment: async (reference, group) => {
      const context = (group.product_context ?? {}) as Record<string, unknown>;
      const productKey = typeof context.external_product_key === "string" ? context.external_product_key : "";
      if (!productKey) return { ok: false, error: "External Payment Page product attribution is missing." };
      const result = await fulfillPaystackExternalCharge({
        reference,
        attributedProductKey: productKey,
        admin: client,
      });
      if (!result.handled) return { ok: false, error: "External Paystack transaction was not recognised." };
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true };
    },
    isAlreadyPaid: (group) => isAlreadyPaid(client, group),
    sendEmail: async (p) => {
      const r = await sendEmail({ to: p.to, subject: p.subject, html: p.html, idempotencyKey: p.idempotencyKey, tags: p.tags });
      if ("messageId" in r) return { messageId: r.messageId };
      if ("skipped" in r) return { skipped: true, error: r.error.message };
      return { error: r.error instanceof Error ? r.error.message : String(r.error) };
    },
    loadProduct: async (group) => {
      const context = (group.product_context ?? {}) as Record<string, unknown>;
      if (group.product_type === "course") {
        const courseId = group.course_id ?? group.product_id;
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
      }
      if (group.product_type === "bundle") {
        const { data } = await client
          .from("course_bundles")
          .select("title, price_ngn, is_active")
          .eq("id", group.product_id)
          .maybeSingle();
        return data
          ? { title: data.title, priceKobo: nairaToKobo(Number(data.price_ngn ?? 0)), available: data.is_active === true }
          : null;
      }
      if (group.product_type === "offer") {
        const { data } = await client
          .from("commerce_offers")
          .select("title, price_ngn, is_active, starts_at, ends_at, target_type, target_id")
          .eq("id", group.product_id)
          .maybeSingle();
        if (!data || data.is_active !== true) return null;
        const now = Date.now();
        if (data.starts_at && Date.parse(data.starts_at) > now) return null;
        if (data.ends_at && Date.parse(data.ends_at) < now) return null;
        if (data.target_type === "course") {
          const { data: course } = await client.from("courses")
            .select("visibility, is_coming_soon, enrollment_type").eq("id", data.target_id).maybeSingle();
          if (!course || course.visibility !== "published" || course.is_coming_soon || course.enrollment_type !== "open") return null;
        } else if (data.target_type === "bundle") {
          const { data: bundle } = await client.from("course_bundles")
            .select("is_active").eq("id", data.target_id).maybeSingle();
          if (!bundle?.is_active) return null;
        } else if (data.target_type === "digital_product") {
          const { data: digital } = await client.from("digital_products")
            .select("is_active").eq("id", data.target_id).maybeSingle();
          if (!digital?.is_active) return null;
        } else {
          return null;
        }
        return { title: data.title, priceKobo: nairaToKobo(Number(data.price_ngn ?? 0)), available: Number(data.price_ngn ?? 0) > 0 };
      }
      if (group.product_type === "digital_product") {
        const { data } = await client
          .from("digital_products")
          .select("id, title, price_ngn, is_active")
          .eq("id", group.product_id)
          .maybeSingle();
        return data
          ? {
              title: data.title || group.product_title,
              priceKobo: nairaToKobo(Number(data.price_ngn ?? 0)),
              available: data.is_active === true,
            }
          : null;
      }
      if (group.product_type === "certificate") {
        const { data } = await client
          .from("learning_paths")
          .select("title, status, certificate_enabled, certificate_price_ngn, certificate_pricing_mode, certificate_recommended_price_ngn")
          .eq("id", group.product_id)
          .maybeSingle();
        if (!data) return null;
        const priceNgn = resolveFinalCertificatePrice({
          mode: data.certificate_pricing_mode,
          recommendedPriceNgn: data.certificate_recommended_price_ngn,
          fixedPriceNgn: data.certificate_price_ngn,
        });
        return {
          title: `${data.title} Certificate`,
          priceKobo: nairaToKobo(priceNgn),
          available: pathCertificateOfferable(data) && priceNgn > 0,
        };
      }
      return null;
    },
    createPendingTransaction: async ({ reference, group, amountKobo }) => {
      const context = (group.product_context ?? {}) as Record<string, unknown>;
      const savedPaystackData = context.paystack_data && typeof context.paystack_data === "object"
        ? context.paystack_data as Record<string, unknown>
        : {};
      const { error } = await client.from("transactions").insert({
        student_id: group.student_id,
        course_id: group.course_id,
        offer_id: typeof context.offer_id === "string" ? context.offer_id : null,
        bundle_id: typeof context.bundle_id === "string" ? context.bundle_id : null,
        digital_product_id: typeof context.digital_product_id === "string" ? context.digital_product_id : null,
        learning_path_id: typeof context.learning_path_id === "string" ? context.learning_path_id : null,
        amount: amountKobo,
        currency: group.currency,
        reference,
        status: "pending",
        paystack_data: {
          ...savedPaystackData,
          checkout_email: group.customer_email,
          checkout_full_name: group.customer_name ?? "",
          recovery_group_id: group.id,
        } as Json,
      });
      if (error) throw new Error(error.message);
    },
    initializePaystack: async ({ reference, group, amountKobo }) => {
      if (group.currency !== "NGN" && group.currency !== "USD") throw new Error("unsupported_currency");
      const context = (group.product_context ?? {}) as Record<string, unknown>;
      const savedMetadata = context.metadata && typeof context.metadata === "object"
        ? context.metadata as Record<string, unknown>
        : {};
      const metadata: Record<string, string> = {
        ...Object.fromEntries(Object.entries(savedMetadata).filter(([, value]) => typeof value === "string") as Array<[string, string]>),
        currency: group.currency,
        buyer_email: group.customer_email,
        buyer_full_name: group.customer_name ?? "",
        recovery_group_id: group.id,
      };
      if (group.course_id && !metadata.course_id) metadata.course_id = group.course_id;
      if (group.product_type === "certificate") metadata.learning_path_id = group.product_id;
      if (group.student_id) metadata.student_id = group.student_id;
      const fallbackPath = group.product_type === "certificate"
        ? `/learn/${String(context.learning_path_slug ?? group.product_id)}?payment=success`
        : group.course_id
          ? `/course/${group.course_id}?payment=success`
          : "/purchase/success?payment=success";
      const callbackPath = typeof context.callback_path === "string" && context.callback_path.startsWith("/")
        ? context.callback_path
        : fallbackPath;
      const init = await initializeTransaction(
        {
          email: group.customer_email,
          amountMinor: amountKobo,
          currency: group.currency,
          reference,
          callbackUrl: `${base}${callbackPath}`,
          metadata,
          customerName: group.customer_name ?? undefined,
        },
        client,
      );
      return { authorizationUrl: init.authorization_url };
    },
    fulfilBankTransfer: async (group) => {
      try {
        const context = (group.product_context ?? {}) as Record<string, unknown>;
        const savedPaystackData = context.paystack_data && typeof context.paystack_data === "object"
          ? context.paystack_data as Record<string, unknown>
          : {};
        const transferData = {
          ...savedPaystackData,
          checkout_email: group.customer_email,
          checkout_full_name: group.customer_name ?? "",
          recovery_group_id: group.id,
          payment_method: "bank_transfer",
        } as Json;
        const { data: existing } = await client
          .from("transactions")
          .select("id, status, paystack_data")
          .eq("reference", group.bank_reference)
          .maybeSingle();
        if (existing) {
          const saved = existing.paystack_data && typeof existing.paystack_data === "object"
            ? existing.paystack_data as Record<string, unknown>
            : {};
          if (saved.recovery_group_id !== group.id) {
            return { ok: false, error: "Bank reference is already linked to another transaction." };
          }
        } else {
          const { error } = await client.from("transactions").insert({
            student_id: group.student_id,
            course_id: group.course_id,
            offer_id: typeof context.offer_id === "string" ? context.offer_id : null,
            bundle_id: typeof context.bundle_id === "string" ? context.bundle_id : null,
            digital_product_id: typeof context.digital_product_id === "string" ? context.digital_product_id : null,
            learning_path_id: typeof context.learning_path_id === "string" ? context.learning_path_id : null,
            amount: group.amount_kobo,
            currency: group.currency,
            reference: group.bank_reference,
            status: "pending",
            paystack_data: transferData,
          });
          if (error && error.code !== "23505") return { ok: false, error: error.message };
        }

        let studentId = group.student_id;
        let welcomePassword: string | undefined;
        if (!studentId) {
          const resolved = await resolveOrCreateStudentForPurchase(client, {
            email: group.customer_email,
            fullName: group.customer_name,
          });
          studentId = resolved.studentId;
          welcomePassword = resolved.password;
        }
        if (!studentId) return { ok: false, error: "A student account could not be resolved for this transfer." };

        const { error: paidError } = await client
          .from("transactions")
          .update({ student_id: studentId, status: "success", paystack_data: transferData })
          .eq("reference", group.bank_reference)
          .eq("status", "pending");
        if (paidError) return { ok: false, error: paidError.message };

        if ((group.product_type === "course" || group.product_type === "legacy") && group.course_id) {
          await fulfillPurchase({
            studentId,
            courseId: group.course_id,
            reference: group.bank_reference,
            buyerEmail: group.customer_email,
            buyerName: group.customer_name ?? undefined,
            welcomePassword,
            skipCustomerEmails: false,
          });
          return { ok: true };
        }
        const result = await completePaidCheckout(group.bank_reference);
        if (!result.ok) return { ok: false, error: "error" in result ? String(result.error) : "Fulfilment failed." };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Fulfilment failed." };
      }
    },
  };
  return { db: recoveryDb(client), deps, admin: client };
}
