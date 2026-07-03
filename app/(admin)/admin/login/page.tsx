import type { Metadata } from "next";
import Link from "next/link";
import { AdminLoginForm } from "@/components/auth/admin-login-form";

export const metadata: Metadata = { title: "Admin login" };

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
      <Link href="/" className="mb-8 text-xl font-bold tracking-tight text-white">
        DigitalSkill<span className="text-brand">X</span>
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-6">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand">
            Admin Control Center
          </span>
          <h1 className="mt-1 text-xl font-bold">Sign in to manage</h1>
          <p className="mt-1 text-sm text-slate-400">
            Restricted access. Admin credentials only.
          </p>
        </div>
        <AdminLoginForm mfaRequired={process.env.ADMIN_MFA_REQUIRED !== "false"} />
      </div>
      <p className="mt-6 text-xs text-slate-500">
        Protected area · activity is audited
      </p>
    </div>
  );
}
