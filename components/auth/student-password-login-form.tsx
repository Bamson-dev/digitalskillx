import Link from "next/link";
import { submitStudentPasswordLogin } from "@/app/(auth)/login-actions";
import { Input, Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/auth/submit-button";

export function StudentPasswordLoginForm({
  next,
  authError,
}: {
  next: string;
  authError?: string;
}) {
  return (
    <form action={submitStudentPasswordLogin} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="mb-1.5 text-xs font-medium text-brand hover:underline"
          >
            Forgot?
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
      {authError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{authError}</p>
      ) : null}
    </form>
  );
}
