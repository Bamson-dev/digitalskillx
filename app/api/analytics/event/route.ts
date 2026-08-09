import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { isMissingColumnError, isMissingRelationError } from "@/lib/schema-guard";
import { PRODUCT_EVENT_NAMES } from "@/lib/product-analytics";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { secureLogError } from "@/lib/secure-log";
import { ErrorCode } from "@/lib/error-codes";
import type { Json } from "@/types/database";

const ALLOWED = new Set<string>(PRODUCT_EVENT_NAMES);

const BLOCKED_META_KEYS = /^(password|token|secret|card|cvv|cvc|authorization|cookie|ssn)$/i;

function sanitizeMetadata(raw: Record<string, unknown>): Json {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key || key.length > 64 || BLOCKED_META_KEYS.test(key)) continue;
    if (value === null) {
      out[key] = null;
      continue;
    }
    if (typeof value === "boolean" || typeof value === "number") {
      if (typeof value === "number" && !Number.isFinite(value)) continue;
      out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      out[key] = value.slice(0, 500);
    }
  }
  return out as Json;
}

export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "analytics-event", 120, 60 * 1000);
  if (limited) return limited;

  let body: {
    event?: string;
    courseId?: string | null;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = String(body.event ?? "");
  if (!ALLOWED.has(event)) {
    return NextResponse.json({ ok: false, error: "unknown_event" }, { status: 400 });
  }

  const courseId = body.courseId ? String(body.courseId) : null;
  const metadata = sanitizeMetadata(
    body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  );

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await bootstrapRuntimeSecrets();
    const admin = await createAdminClientAsync(supabase);
    const { error } = await admin.from("product_events").insert({
      event_name: event,
      course_id: courseId,
      student_id: user?.id ?? null,
      metadata,
    });

    if (error) {
      if (isMissingRelationError(error.message) || isMissingColumnError(error.message)) {
        return NextResponse.json({ ok: true, stored: false });
      }
      secureLogError("analytics", ErrorCode.DATABASE_QUERY_FAILED, "product_events insert failed", {
        event,
        error: error.message,
      });
      return NextResponse.json({ ok: true, stored: false });
    }

    return NextResponse.json({ ok: true, stored: true });
  } catch (err) {
    secureLogError("analytics", ErrorCode.API_FAILURE, "unexpected analytics failure", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: true, stored: false });
  }
}
