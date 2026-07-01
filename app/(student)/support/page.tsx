import type { Metadata } from "next";
import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { SupportForm } from "@/components/student/support-form";

export const metadata: Metadata = { title: "Need Help" };

export default async function SupportPage({
  searchParams,
}: {
  searchParams: { sent?: string };
}) {
  await requireStudent();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-800">
          ← Back to dashboard
        </Link>
        <h1 className="mt-4 font-display text-2xl font-bold text-neutral-900">Need help?</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Send us a message and our team will get back to you. We typically respond within 1–2
          business days.
        </p>
      </div>

      {searchParams.sent === "1" ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Your request was submitted. We&apos;ll be in touch soon.
        </div>
      ) : null}

      <div className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
        <SupportForm />
      </div>
    </div>
  );
}
