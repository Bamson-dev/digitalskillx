import Link from "next/link";
import { ORG } from "@/lib/org";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4 py-10">
      <Link
        href="/"
        className="mb-8 font-display text-xl font-bold tracking-tight text-neutral-900"
      >
        DigitalSkillX
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-surface-border bg-white p-8 shadow-card">
        {children}
      </div>
      <p className="mt-6 text-xs text-neutral-400">
        {ORG.footer} · {ORG.rc}
      </p>
    </div>
  );
}
