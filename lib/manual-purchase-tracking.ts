import "server-only";
import { timingSafeEqual } from "node:crypto";
import { BUILD_SOFTWARE_WITH_AI_PRODUCT } from "@/lib/paystack-external-products";
import { fulfillPaystackExternalCharge } from "@/lib/paystack-external-fulfillment";
import { trackExternalPurchase } from "@/lib/purchase-tracking";
import { recordProductEvent } from "@/lib/record-product-event";
import { runtimeEnv } from "@/lib/runtime-env";
import { secureLog } from "@/lib/secure-log";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export const MANUAL_PURCHASE_EVENT = "manual_purchase_tracked";

export type ManualTrackPurchaseInput = {
  email: string;
  reference: string;
  amount: number;
  productName: string;
};

export type ManualTrackedPurchase = {
  email: string;
  reference: string;
  amount: number;
  productName: string;
  trackedAt: string;
};

export function getAdminApiKey(): string | undefined {
  return runtimeEnv("ADMIN_API_KEY");
}

export function adminApiKeyMatches(provided: string | null | undefined): boolean {
  const expected = getAdminApiKey();
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseManualTrackPurchaseBody(raw: unknown):
  | { ok: true; value: ManualTrackPurchaseInput }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "JSON body is required." };
  const body = raw as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  const productName =
    typeof body.productName === "string" && body.productName.trim()
      ? body.productName.trim()
      : BUILD_SOFTWARE_WITH_AI_PRODUCT.title;
  const amountRaw = body.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number(amountRaw)
        : NaN;

  if (!email || !email.includes("@")) return { ok: false, error: "A valid email is required." };
  if (!reference) return { ok: false, error: "Payment reference is required." };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Amount must be a positive number." };

  return { ok: true, value: { email, reference, amount, productName } };
}

export type ManualTrackPurchaseResult =
  | {
      ok: true;
      email: string;
      reference: string;
      courseId: string;
      studentId: string;
      alreadyEnrolled?: boolean;
      trackingFailed?: boolean;
      trackingWarning?: string;
    }
  | {
      ok: false;
      stage: "enrollment" | "validation";
      error: string;
    };

export async function runManualTrackPurchase(
  input: ManualTrackPurchaseInput,
): Promise<ManualTrackPurchaseResult> {
  const product = BUILD_SOFTWARE_WITH_AI_PRODUCT;
  const amountKobo = Math.round(input.amount * 100);

  let enrolled: Awaited<ReturnType<typeof fulfillPaystackExternalCharge>>;
  try {
    enrolled = await fulfillPaystackExternalCharge({
      reference: input.reference,
      skipPurchaseTracking: true,
      handoffPayment: {
        productKey: product.key,
        amount: amountKobo,
        currency: "NGN",
        status: "success",
        customerEmail: input.email,
      },
    });
  } catch (err) {
    return {
      ok: false,
      stage: "enrollment",
      error: `Enrollment failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!enrolled.handled || !enrolled.ok) {
    const reason = enrolled.handled ? enrolled.error : "Enrollment was not handled.";
    return {
      ok: false,
      stage: "enrollment",
      error: `Enrollment failed: ${reason}`,
    };
  }

  let trackingFailed = false;
  let trackingWarning: string | undefined;
  try {
    const tracking = await trackExternalPurchase({
      reference: input.reference,
      customerEmail: input.email,
      product: {
        key: product.key,
        title: input.productName || product.title,
        expectedAmountNgn: input.amount,
        currency: "NGN",
      },
    });
    if (tracking.errors.length > 0) {
      trackingFailed = true;
      trackingWarning = `Tracking warning after enrollment: ${tracking.errors.join("; ")}`;
      secureLog("warn", "manual-track", "tracking_failed_after_enrollment", {
        reference: input.reference,
        errors: tracking.errors,
      });
    }
  } catch (err) {
    trackingFailed = true;
    trackingWarning = `Tracking warning after enrollment: ${err instanceof Error ? err.message : String(err)}`;
    secureLog("warn", "manual-track", "tracking_failed_after_enrollment", {
      reference: input.reference,
      error: trackingWarning,
    });
  }

  await recordProductEvent({
    event: MANUAL_PURCHASE_EVENT,
    courseId: product.defaultCourseId,
    studentId: enrolled.studentId,
    metadata: {
      email: input.email,
      reference: input.reference,
      amount: input.amount,
      productName: input.productName,
      source: "manual",
      courseId: enrolled.courseId,
      trackingFailed,
    },
  });

  return {
    ok: true,
    email: input.email,
    reference: input.reference,
    courseId: enrolled.courseId,
    studentId: enrolled.studentId,
    alreadyEnrolled: enrolled.alreadyFulfilled,
    trackingFailed,
    trackingWarning,
  };
}

export async function listManualTrackedPurchases(limit = 10): Promise<ManualTrackedPurchase[]> {
  try {
    const admin = await createAdminClientAsync();
    const { data, error } = await admin
      .from("product_events")
      .select("created_at, metadata")
      .eq("event_name", MANUAL_PURCHASE_EVENT)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row) => {
      const meta =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, Json>)
          : {};
      return {
        email: typeof meta.email === "string" ? meta.email : "",
        reference: typeof meta.reference === "string" ? meta.reference : "",
        amount: typeof meta.amount === "number" ? meta.amount : Number(meta.amount) || 0,
        productName: typeof meta.productName === "string" ? meta.productName : "",
        trackedAt: row.created_at,
      };
    });
  } catch {
    return [];
  }
}
