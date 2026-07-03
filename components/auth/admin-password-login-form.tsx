import { submitAdminPasswordLogin } from "@/app/(admin)/admin/login-actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { PasswordInput } from "@/components/ui/password-input";

export function AdminPasswordLoginForm({ authError }: { authError?: string }) {
  return (
    <form action={submitAdminPasswordLogin} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-10 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="current-password"
          inputClassName="border-slate-700 bg-slate-800 focus:border-brand-400 focus:ring-brand-400/30"
          toggleClassName="text-slate-400 hover:text-slate-200"
        />
      </div>

      <SubmitButton className="w-full" pendingText="Verifying…">
        Sign in
      </SubmitButton>

      {authError ? (
        <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{authError}</p>
      ) : null}
    </form>
  );
}
