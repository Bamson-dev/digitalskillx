import { NextResponse, type NextRequest } from "next/server";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { buildRecoveryDeps } from "@/lib/payment-recovery/server";
import { optOut } from "@/lib/payment-recovery/engine";
import { customerPage, htmlResponseInit } from "@/lib/payment-recovery/page-html";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "payment-recovery-optout", 30);
  if (limited) return limited;
  const token = request.nextUrl.searchParams.get("t")?.trim() ?? "";
  return new NextResponse(
    customerPage({
      title: "Stop payment reminders",
      body: "<p>Click below and we will stop sending payment reminder emails for your DigitalSkillX orders. You can still buy any time.</p>",
      form: { action: "/api/payment-recovery/opt-out", token, button: "STOP REMINDERS" },
    }),
    htmlResponseInit(200),
  );
}

export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "payment-recovery-optout-post", 10);
  if (limited) return limited;
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("t") ?? "").trim();
  await bootstrapRuntimeSecrets();
  const { db, deps } = await buildRecoveryDeps();
  const r = await optOut(db, deps, token);
  return new NextResponse(
    customerPage({
      title: r.ok ? "Reminders stopped" : "Link not valid",
      body: r.ok
        ? "<p>Done. You will not receive more payment reminders from us.</p>"
        : "<p>We could not find this link. If you keep getting emails, reply to one of them and we will remove you.</p>",
    }),
    htmlResponseInit(r.ok ? 200 : 404),
  );
}
