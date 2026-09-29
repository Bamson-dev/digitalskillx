import { NextResponse, type NextRequest } from "next/server";
import { sendStudentPasswordReset } from "@/lib/auth/password-recovery";
import { enforceRateLimit } from "@/lib/rate-limit";
import { publicAbsoluteUrl } from "@/lib/public-site-origin";
import { secureLogError } from "@/lib/secure-log";
import { ErrorCode } from "@/lib/error-codes";

export const dynamic = "force-dynamic";

function wantsJson(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("application/json") || accept.includes("application/json");
}

async function readEmail(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
    return String(body?.email ?? "").trim();
  }
  const form = await request.formData().catch(() => null);
  return String(form?.get("email") ?? "").trim();
}

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "auth-forgot-password", 12, 15 * 60 * 1000);
  if (!limited.ok && !limited.unavailable) {
    secureLogError("auth", ErrorCode.AUTH_RATE_LIMITED, "forgot password rate limited");
    const message = "Too many reset attempts. Please wait a few minutes and try again.";
    if (wantsJson(request)) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    const url = publicAbsoluteUrl("/forgot-password", {
      headers: request.headers,
      requestUrl: request.url,
    });
    url.searchParams.set("error", message);
    return NextResponse.redirect(url, 303);
  }

  const email = await readEmail(request);
  const result = await sendStudentPasswordReset(email);

  if (wantsJson(request)) {
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, message: result.message });
  }

  const url = publicAbsoluteUrl("/forgot-password", {
    headers: request.headers,
    requestUrl: request.url,
  });
  if (!result.ok) url.searchParams.set("error", result.error);
  else url.searchParams.set("sent", "1");
  return NextResponse.redirect(url, 303);
}
