import "server-only";
import type { NextRequest } from "next/server";

export function verifyCronSecret(request: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const expected = secret ? `Bearer ${secret}` : "";

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET is not set on the server (Vercel → Settings → Environment Variables).",
    };
  }

  if (auth !== expected) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized — Bearer token does not match CRON_SECRET on the server.",
    };
  }

  return { ok: true };
}
