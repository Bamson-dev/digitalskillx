import { NextResponse, type NextRequest } from "next/server";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { buildRecoveryDeps } from "@/lib/payment-recovery/server";
import { createRetryCheckout, type Group } from "@/lib/payment-recovery/engine";
import { formatNaira } from "@/lib/payment-recovery/config";
import { customerPage, escapeHtml, htmlResponseInit } from "@/lib/payment-recovery/page-html";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERRORS: Record<string, string> = {
  not_found: "We could not find this order. Please use the latest link in your email, or chat with us on WhatsApp.",
  closed: "This order is closed. If you still want the course, start a new purchase or chat with us on WhatsApp.",
  unavailable: "This product is not available for online payment right now. Please chat with us on WhatsApp.",
  init_failed: "We could not open Paystack right now. Your order is saved. Please try again in a few minutes.",
};

function errorPage(code: string, status = 400) {
  return new NextResponse(
    customerPage({
      title: "Payment link",
      body: `<p>${escapeHtml(ERRORS[code] ?? ERRORS.not_found)}</p><p><a href="https://wa.me/2349023986992" style="color:#16a34a;font-weight:bold">Chat with us on WhatsApp</a></p>`,
    }),
    htmlResponseInit(status),
  );
}

/** GET shows the order. Link scanners only GET, so no Paystack transaction is created here. */
export async function GET(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "payment-recovery-retry", 30);
  if (limited) return limited;
  const token = request.nextUrl.searchParams.get("t")?.trim() ?? "";
  if (token.length < 16) return errorPage("not_found", 404);
  await bootstrapRuntimeSecrets();
  const { db } = await buildRecoveryDeps();
  const { data } = await db.from("payment_recovery_groups").select("*").eq("retry_token", token).maybeSingle();
  const group = data as Group | null;
  if (!group) return errorPage("not_found", 404);
  if (!group.is_open) {
    const paid = group.payment_status === "successful" || group.payment_status === "bank_transfer_confirmed";
    return new NextResponse(
      customerPage({
        title: paid ? "Payment already received" : "Order closed",
        body: paid
          ? `<p>We have already received payment for this order. Log in to start learning.</p><p><a href="/login" style="color:#dc2626;font-weight:bold">Log in</a></p>`
          : `<p>${escapeHtml(ERRORS.closed)}</p>`,
      }),
      htmlResponseInit(200),
    );
  }
  return new NextResponse(
    customerPage({
      title: "Complete your payment",
      body: `<p><strong>${escapeHtml(group.product_title)}</strong></p><p>Amount: <strong>${escapeHtml(formatNaira(group.amount_kobo))}</strong></p><p>Click the button to open a new, secure Paystack checkout. The amount comes from our current price list.</p>`,
      form: { action: "/api/payment-recovery/retry", token, button: "CONTINUE TO PAYSTACK" },
    }),
    htmlResponseInit(200),
  );
}

export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "payment-recovery-retry-post", 10);
  if (limited) return limited;
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("t") ?? "").trim();
  await bootstrapRuntimeSecrets();
  const { db, deps } = await buildRecoveryDeps();
  const result = await createRetryCheckout(db, deps, token);
  if (result.kind === "redirect") return NextResponse.redirect(result.url, 303);
  if (result.kind === "already_paid") {
    return NextResponse.redirect(new URL(result.courseId ? `/courses/${result.courseId}` : "/login", deps.siteUrl), 303);
  }
  return errorPage(result.code, result.code === "init_failed" ? 503 : 400);
}
