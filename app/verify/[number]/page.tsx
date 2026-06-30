import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG } from "@/lib/org";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Verify certificate" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: { number: string } }) {
  // Public page — uses the service-role client to read a single certificate.
  const supabase = createAdminClient();
  const { data: cert } = await supabase
    .from("certificates")
    .select("certificate_number, issued_at, completed_at, is_valid, student:profiles(full_name), course:courses(title)")
    .eq("certificate_number", params.number)
    .maybeSingle();

  const valid = !!cert && cert.is_valid;
  const student = cert ? (Array.isArray(cert.student) ? cert.student[0] : cert.student) : null;
  const course = cert ? (Array.isArray(cert.course) ? cert.course[0] : cert.course) : null;
  const checkedAt = new Date().toISOString();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-50 px-4 py-10">
      <Link href="/" className="mb-8 text-xl font-bold tracking-tight text-brand">
        DigitalSkillX
      </Link>

      <div className="w-full max-w-md rounded-2xl border border-app bg-white p-8 text-center shadow-sm">
        {valid ? (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
            <h1 className="mt-4 text-2xl font-bold text-green-700">Valid certificate</h1>
            <dl className="mt-6 space-y-3 text-left text-sm">
              <Row label="Student" value={student?.full_name ?? "—"} />
              <Row label="Course" value={course?.title ?? "—"} />
              <Row label="Completed" value={formatDate(cert!.completed_at ?? cert!.issued_at)} />
              <Row label="Issued" value={formatDate(cert!.issued_at)} />
              <Row label="Certificate №" value={cert!.certificate_number} mono />
              <Row label="Issued by" value={ORG.certificateOrg} />
            </dl>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-14 w-14 text-red-600" />
            <h1 className="mt-4 text-2xl font-bold text-red-700">Invalid certificate</h1>
            <p className="mt-3 text-sm text-muted">
              We couldn&apos;t verify a certificate with number{" "}
              <span className="font-mono">{params.number}</span>.
            </p>
          </>
        )}
        <p className="mt-6 text-xs text-muted">
          Verified {formatDate(checkedAt, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </div>

      <p className="mt-6 text-xs text-muted">
        {ORG.footer} · {ORG.rc}
      </p>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-app pb-2">
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono font-medium" : "font-medium"}>{value}</dd>
    </div>
  );
}
