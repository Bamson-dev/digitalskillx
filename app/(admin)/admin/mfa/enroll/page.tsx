import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdminPasswordOnly } from "@/lib/auth";
import { getAdminMfaStatus } from "@/lib/admin-mfa";
import { AdminMfaEnrollForm } from "@/components/auth/admin-mfa-enroll-form";

export const metadata: Metadata = { title: "Set up authenticator" };

export default async function AdminMfaEnrollPage() {
  await requireAdminPasswordOnly();
  const mfa = await getAdminMfaStatus();
  if (mfa.enrolled && mfa.verified) redirect("/admin/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-xl font-bold">Two-factor authentication</h1>
        <p className="mt-2 text-sm text-slate-400">
          Scan the QR code with Google Authenticator, 1Password, or Authy, then enter a code to
          confirm.
        </p>
        <div className="mt-6">
          <AdminMfaEnrollForm />
        </div>
      </div>
    </div>
  );
}
