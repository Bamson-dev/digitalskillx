import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { getPaystackSecretKey } from "@/lib/env-paystack";
import {
  completePaidCheckout,
  readPendingCheckoutDetails,
  resolveOrCreateStudentForPurchase,
} from "@/lib/guest-checkout";
import { generateReference, verifyTransaction } from "@/lib/paystack";
import { secureLog } from "@/lib/secure-log";
import { fetchPublishedCourseById } from "@/lib/published-courses";
import { nairaToKobo } from "@/lib/currency";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type ScenarioResult = {
  name: string;
  ok: boolean;
  detail: string;
};

function requirePaymentCertEnabled() {
  return process.env.ALLOW_PAYMENT_CERT === "1" || process.env.ALLOW_PAYMENT_CERT === "true";
}

async function signWebhook(body: string) {
  const secret = await getPaystackSecretKey();
  return crypto.createHmac("sha512", secret).update(body).digest("hex");
}

async function chargeTestCard(params: {
  email: string;
  amount: number;
  reference: string;
}) {
  const secret = await getPaystackSecretKey();
  if (!secret.startsWith("sk_test_")) {
    throw new Error("Paystack secret is not a sandbox key (sk_test_). Refusing live charges.");
  }

  const res = await fetch("https://api.paystack.co/charge", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amount,
      reference: params.reference,
      card: {
        number: "4084084084084081",
        cvv: "408",
        expiry_month: "12",
        expiry_year: "30",
      },
    }),
  });
  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { status?: string; reference?: string };
  };
  return json;
}

/**
 * Real Paystack sandbox certification.
 * Auth: Bearer CRON_SECRET
 * Requires: ALLOW_PAYMENT_CERT=true and PAYSTACK_SECRET_KEY=sk_test_...
 *
 * Body: { courseId?: string, email?: string }
 */
export async function POST(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!requirePaymentCertEnabled()) {
    return NextResponse.json(
      {
        error:
          "Set ALLOW_PAYMENT_CERT=true on the server to enable Paystack sandbox certification.",
      },
      { status: 403 },
    );
  }

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();
  const results: ScenarioResult[] = [];

  let body: { courseId?: string; email?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const secret = await getPaystackSecretKey();
  if (!secret.startsWith("sk_test_")) {
    return NextResponse.json(
      {
        error:
          "Server Paystack key is not sk_test_. Switch to Paystack sandbox keys before running payment cert.",
        keyPrefix: secret.slice(0, 7),
      },
      { status: 403 },
    );
  }

  // Pick a paid published course
  let courseId = body.courseId?.trim() ?? "";
  if (!courseId) {
    const { data: courses } = await admin
      .from("courses")
      .select("id, price_ngn, visibility, enrollment_type, is_coming_soon")
      .eq("visibility", "published")
      .eq("enrollment_type", "open")
      .gt("price_ngn", 0)
      .limit(5);
    const pick = (courses ?? []).find((c) => !c.is_coming_soon) ?? courses?.[0];
    courseId = pick?.id ?? "";
  }
  if (!courseId) {
    return NextResponse.json({ error: "No paid published course found for certification." }, { status: 400 });
  }

  const course = await fetchPublishedCourseById<{
    id: string;
    price_ngn: number;
    title: string;
  }>(courseId, "id, price_ngn, title");
  if (!course || course.price_ngn <= 0) {
    return NextResponse.json({ error: "Course is not a paid course." }, { status: 400 });
  }

  const amount = nairaToKobo(course.price_ngn);
  const stamp = Date.now();
  const buyerEmail = (body.email ?? `paystack-cert+${stamp}@digitalskillx.com`).trim().toLowerCase();

  // --- Scenario: invalid webhook signature ---
  {
    const bad = await fetch(new URL("/api/webhooks/paystack", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": "deadbeef",
      },
      body: JSON.stringify({ event: "charge.success", data: { reference: "dsx_invalid" } }),
    });
    results.push({
      name: "Invalid webhook signature rejected",
      ok: bad.status === 401,
      detail: `status=${bad.status}`,
    });
  }

  // --- Scenario: successful charge + webhook + duplicate webhook + confirm ---
  const successRef = generateReference();
  const student = await resolveOrCreateStudentForPurchase(admin, {
    email: buyerEmail,
    fullName: `Paystack Cert ${stamp}`,
  });

  await admin.from("transactions").insert({
    student_id: student.studentId,
    course_id: course.id,
    amount,
    currency: "NGN",
    reference: successRef,
    status: "pending",
    paystack_data: {
      checkout_email: buyerEmail,
      checkout_full_name: student.fullName,
    },
  });

  let chargeOk = false;
  let chargeDetail = "";
  try {
    const charged = await chargeTestCard({
      email: buyerEmail,
      amount,
      reference: successRef,
    });
    chargeOk = Boolean(charged.status) && charged.data?.status === "success";
    chargeDetail = charged.message ?? charged.data?.status ?? "no message";
    if (!chargeOk) {
      // Some Paystack accounts return ongoing/send_pin for cards — try verify anyway after short wait
      await new Promise((r) => setTimeout(r, 1500));
      const verified = await verifyTransaction(successRef);
      chargeOk = verified?.status === "success";
      chargeDetail = `charge=${charged.message}; verify=${verified?.status ?? "null"}`;
    }
  } catch (err) {
    chargeDetail = err instanceof Error ? err.message : String(err);
  }
  results.push({
    name: "Sandbox card charge succeeds",
    ok: chargeOk,
    detail: chargeDetail,
  });

  if (chargeOk) {
    const webhookBody = JSON.stringify({
      event: "charge.success",
      data: {
        reference: successRef,
        status: "success",
        amount,
        currency: "NGN",
        metadata: { course_id: course.id, buyer_email: buyerEmail },
        customer: { email: buyerEmail },
      },
    });
    const sig = await signWebhook(webhookBody);
    const wh1 = await fetch(new URL("/api/webhooks/paystack", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": sig,
      },
      body: webhookBody,
    });
    const wh1Json = await wh1.json().catch(() => ({}));
    results.push({
      name: "Webhook fulfills successful payment",
      ok: wh1.ok,
      detail: `status=${wh1.status} body=${JSON.stringify(wh1Json).slice(0, 120)}`,
    });

    const wh2 = await fetch(new URL("/api/webhooks/paystack", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": sig,
      },
      body: webhookBody,
    });
    results.push({
      name: "Duplicate webhook is idempotent",
      ok: wh2.ok,
      detail: `status=${wh2.status}`,
    });

    // Confirm path after webhook (callback after webhook)
    const confirm1 = await completePaidCheckout(successRef);
    const confirm2 = await completePaidCheckout(successRef);
    results.push({
      name: "Confirm after webhook remains idempotent",
      ok: confirm1.ok && confirm2.ok,
      detail: `c1=${confirm1.ok} c2=${confirm2.ok} already=${"alreadyFulfilled" in confirm2 ? confirm2.alreadyFulfilled : false}`,
    });

    const { data: txRows } = await admin
      .from("transactions")
      .select("id, status")
      .eq("reference", successRef);
    results.push({
      name: "Exactly one payment record",
      ok: (txRows ?? []).length === 1 && txRows?.[0]?.status === "success",
      detail: `count=${txRows?.length} status=${txRows?.[0]?.status}`,
    });

    const { data: enrollRows } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", student.studentId)
      .eq("course_id", course.id);
    results.push({
      name: "Exactly one enrollment after success",
      ok: (enrollRows ?? []).length === 1,
      detail: `count=${enrollRows?.length}`,
    });
  }

  // --- Scenario: failed charge path (mark failed via webhook event) ---
  const failRef = generateReference();
  await admin.from("transactions").insert({
    student_id: student.studentId,
    course_id: course.id,
    amount,
    currency: "NGN",
    reference: failRef,
    status: "pending",
    paystack_data: { checkout_email: buyerEmail },
  });
  const failBody = JSON.stringify({
    event: "charge.failed",
    data: { reference: failRef, status: "failed" },
  });
  const failSig = await signWebhook(failBody);
  const failWh = await fetch(new URL("/api/webhooks/paystack", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-paystack-signature": failSig,
    },
    body: failBody,
  });
  const { data: failTx } = await admin
    .from("transactions")
    .select("status")
    .eq("reference", failRef)
    .maybeSingle();
  const { count: failEnrollCount } = await admin
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("student_id", student.studentId)
    .eq("course_id", course.id);
  results.push({
    name: "Failed webhook marks transaction failed",
    ok: failWh.ok && failTx?.status === "failed",
    detail: `wh=${failWh.status} tx=${failTx?.status}`,
  });
  results.push({
    name: "Failed payment does not add enrollments",
    ok: (failEnrollCount ?? 0) <= 1, // only the success enrollment from earlier
    detail: `enrollmentCount=${failEnrollCount}`,
  });

  // --- Scenario: invalid reference confirm ---
  const badConfirm = await completePaidCheckout("dsx_not_a_real_reference");
  results.push({
    name: "Invalid reference confirm fails safely",
    ok: !badConfirm.ok,
    detail: badConfirm.ok ? "unexpected ok" : badConfirm.error,
  });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  secureLog("info", "paystack-cert", "sandbox certification finished", {
    passed,
    failed,
    courseId,
    successRef,
  });

  return NextResponse.json({
    ok: failed === 0,
    passed,
    failed,
    courseId,
    buyerEmail,
    successRef,
    results,
  });
}
