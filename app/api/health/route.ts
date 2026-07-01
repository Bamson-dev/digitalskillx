import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    database: "unknown",
    paystack: "unknown",
  };

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("courses").select("id").limit(1);
    checks.database = error ? "error" : "connected";
  } catch {
    checks.database = "error";
    checks.status = "degraded";
  }

  try {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      checks.paystack = "unconfigured";
    } else {
      const res = await fetch("https://api.paystack.co/transaction/totals", {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
        next: { revalidate: 0 },
      });
      checks.paystack = res.ok ? "reachable" : "error";
      if (!res.ok) checks.status = "degraded";
    }
  } catch {
    checks.paystack = "error";
    checks.status = "degraded";
  }

  const httpStatus = checks.status === "ok" ? 200 : 503;
  return NextResponse.json(checks, { status: httpStatus });
}
