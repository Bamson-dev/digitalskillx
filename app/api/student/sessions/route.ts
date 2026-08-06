import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import {
  hashSessionAccessToken,
  listAccountSessions,
  revokeAccountSession,
  revokeAllAccountSessions,
} from "@/lib/account-sessions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "account-sessions", 60);
  if (limited) return limited;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = await createAdminClientAsync(supabase);
    const sessions = await listAccountSessions(admin, user.id);
    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        browser: s.browser,
        os: s.os,
        device: s.device,
        country: s.country,
        city: s.city,
        ipAddress: s.ip_address,
        lastActiveAt: s.last_active_at,
        isCurrent: s.is_current,
        flaggedImpossibleTravel: s.flagged_impossible_travel,
        createdAt: s.created_at,
      })),
    });
  } catch (err) {
    // Table may not be applied yet — degrade gracefully.
    return NextResponse.json({
      sessions: [],
      warning: err instanceof Error ? err.message : "Sessions unavailable",
    });
  }
}

export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "account-sessions-mutate", 20);
  if (limited) return limited;

  const supabase = createClient();
  const {
    data: { user, session },
  } = await supabase.auth.getUser().then(async (r) => {
    const sess = await supabase.auth.getSession();
    return { data: { user: r.data.user, session: sess.data.session } };
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { action?: "revoke" | "revoke_all"; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const admin = await createAdminClientAsync(supabase);
    if (body.action === "revoke" && body.sessionId) {
      await revokeAccountSession(admin, { userId: user.id, sessionId: body.sessionId });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "revoke_all") {
      const keep = session?.access_token
        ? hashSessionAccessToken(session.access_token)
        : null;
      await revokeAllAccountSessions(admin, { userId: user.id, keepTokenHash: keep });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
