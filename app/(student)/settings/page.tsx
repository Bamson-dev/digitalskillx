import type { Metadata } from "next";
import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { DeleteAccountButton } from "@/components/student/delete-account-button";

export const metadata: Metadata = { title: "Account & Privacy" };

export default async function StudentSettingsPage() {
  const profile = await requireStudent();

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-neutral-900">Account &amp; privacy</h1>
        <p className="mt-2 text-sm text-neutral-600">Manage your data and account preferences.</p>
      </div>

      <section className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
        <h2 className="font-semibold text-neutral-900">Export your data</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Download a JSON copy of your profile, enrollments, progress, certificates, and purchases.
        </p>
        <a
          href="/api/student/export"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-lg border border-surface-border px-5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          Download my data
        </a>
      </section>

      <section className="rounded-xl border border-red-200 bg-red-50/50 p-6">
        <h2 className="font-semibold text-red-900">Delete account</h2>
        <p className="mt-2 text-sm text-red-800">
          Permanently delete your account and personal data. Anonymized purchase records are kept for
          accounting and tax compliance.
        </p>
        <p className="mt-2 text-xs text-red-700">Signed in as {profile.email}</p>
        <DeleteAccountButton />
      </section>

      <p className="text-sm text-neutral-500">
        Read our{" "}
        <Link href="/privacy" className="text-brand hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
