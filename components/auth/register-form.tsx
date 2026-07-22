"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/auth/submit-button";

function RegisterFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState(searchParams.get("auth_error") ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: String(formData.get("full_name") ?? ""),
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Could not create account.");
        return;
      }
      setMessage(json.message ?? "Account created. You can log in now.");
      router.push("/login?registered=1");
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-muted">Start learning with DigitalSkillX.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" required autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
          <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
        </div>
        <SubmitButton className="w-full" pendingText="Creating account…" isPending={pending}>
          Create account
        </SubmitButton>
      </form>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
      ) : null}

      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
      <RegisterFormInner />
    </Suspense>
  );
}
