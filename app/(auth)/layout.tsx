import Link from "next/link";
import { ORG } from "@/lib/org";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-50 px-4 py-10">
      <Link href="/" className="mb-8 text-xl font-bold tracking-tight text-brand">
        DigitalSkillX
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-app bg-card p-8 shadow-sm">
        {children}
      </div>
      <p className="mt-6 text-xs text-muted">
        {ORG.footer} · {ORG.rc}
      </p>
    </div>
  );
}
