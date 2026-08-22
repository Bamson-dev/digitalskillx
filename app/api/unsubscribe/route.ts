import { NextResponse, type NextRequest } from "next/server";
import { AIMONEYCODE_CAMPAIGN_SLUG } from "@/lib/email-campaigns/constants";
import { verifyUnsubscribeToken } from "@/lib/email-campaigns/unsubscribe";
import { suppressAndStopRecipient } from "@/lib/email-campaigns/store";
import { suppressWebinarContact } from "@/lib/webinar-followup/store";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(token: string | null) {
  const parsed = token ? verifyUnsubscribeToken(token) : null;
  if (!parsed) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();

  if (parsed.campaignSlug === AIMONEYCODE_CAMPAIGN_SLUG) {
    await suppressAndStopRecipient(admin, parsed.email, parsed.campaignSlug, "unsubscribe");
    return new NextResponse("OK", { status: 200 });
  }

  const { data } = await admin
    .from("webinar_followup_campaigns" as never)
    .select("id")
    .eq("slug", parsed.campaignSlug)
    .maybeSingle();
  if (data) {
    await suppressWebinarContact(admin, parsed.email, parsed.campaignSlug, "unsubscribe");
    return new NextResponse("OK", { status: 200 });
  }

  return NextResponse.json({ error: "invalid_token" }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  return handle(token);
}

export async function POST(request: NextRequest) {
  const token =
    request.nextUrl.searchParams.get("token") ??
    (await request.formData().then((form) => String(form.get("token") ?? "")).catch(() => ""));
  return handle(token || null);
}
