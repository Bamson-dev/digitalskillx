"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/auth/submit-button";
import { DEVICE_KEY_COOKIE } from "@/lib/device-login-limit-client";

function readOrCreateDeviceKey() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${DEVICE_KEY_COOKIE}=([^;]*)`));
  const existing = match?.[1] ? decodeURIComponent(match[1]) : "";
  if (existing && /^[a-zA-Z0-9_-]{8,128}$/.test(existing)) return existing;
  const created =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  document.cookie = `${DEVICE_KEY_COOKIE}=${encodeURIComponent(created)};path=/;max-age=${
    60 * 60 * 24 * 400
  };samesite=lax`;
  return created;
}

export function StudentPasswordLoginForm({
  next,
  authError,
}: {
  next: string;
  authError?: string;
}) {
  const [deviceKey, setDeviceKey] = useState("");

  useEffect(() => {
    setDeviceKey(readOrCreateDeviceKey());
  }, []);

  return (
    <form action="/api/auth/login" method="POST" className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="device_key" value={deviceKey} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="text"
          inputMode="email"
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="mb-1.5 text-sm font-semibold text-brand underline"
          >
            Forgot password
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="current-password"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="remember" defaultChecked className="rounded" />
        Remember me for 30 days
      </label>
      <SubmitButton className="w-full" pendingText="Signing in…">
        Log in
      </SubmitButton>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="font-semibold text-brand underline">
          Forgot password? Get a reset link
        </Link>
      </p>
      {authError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {authError === "fetch failed"
            ? "Sign-in briefly failed. Retry, or use Forgot password to get a fresh login."
            : authError}
        </p>
      ) : null}
    </form>
  );
}
