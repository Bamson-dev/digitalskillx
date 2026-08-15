import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG, siteUrl } from "@/lib/org";
import { formatDate } from "@/lib/utils";
import { CertificateShareButton } from "@/components/certificate-share-button";
import { PATH_CERTIFICATE_ATTRIBUTION } from "@/lib/learn-certificate-shared";

export const dynamic = "force-dynamic";

type VerifyCert = {
  certificate_number: string;
  issued_at: string;
  completed_at: string | null;
  is_valid: boolean;
  recipient_name: string | null;
  student: { full_name: string | null } | { full_name: string | null }[] | null;
  course: { title: string } | { title: string }[] | null;
  learning_path?:
    | {
        title: string;
        slug: string;
        creator?: { display_name: string | null } | { display_name: string | null }[] | null;
      }
    | {
        title: string;
        slug: string;
        creator?: { display_name: string | null } | { display_name: string | null }[] | null;
      }[]
    | null;
};

async function loadCertificate(number: string): Promise<VerifyCert | null> {
  const supabase = createAdminClient();
  const withCreator =
    "certificate_number, issued_at, completed_at, is_valid, recipient_name, student:profiles(full_name), course:courses(title), learning_path:learning_paths(title, slug, creator:creator_profiles(display_name))";
  const withPath =
    "certificate_number, issued_at, completed_at, is_valid, recipient_name, student:profiles(full_name), course:courses(title), learning_path:learning_paths(title, slug)";
  const base =
    "certificate_number, issued_at, completed_at, is_valid, recipient_name, student:profiles(full_name), course:courses(title)";
  let query = await supabase.from("certificates").select(withCreator).eq("certificate_number", number).maybeSingle();
  if (query.error && /creator_profiles|creator/i.test(query.error.message)) {
    query = await supabase.from("certificates").select(withPath).eq("certificate_number", number).maybeSingle();
  }
  if (query.error && /learning_path|does not exist|could not find/i.test(query.error.message)) {
    query = await supabase.from("certificates").select(base).eq("certificate_number", number).maybeSingle();
  }
  return (query.data as VerifyCert | null) ?? null;
}

function titleFrom(cert: VerifyCert | null) {
  if (!cert) return null;
  const course = Array.isArray(cert.course) ? cert.course[0] : cert.course;
  const path = Array.isArray(cert.learning_path) ? cert.learning_path[0] : cert.learning_path;
  return course?.title || path?.title || null;
}

export async function generateMetadata({ params }: { params: { number: string } }): Promise<Metadata> {
  const cert = await loadCertificate(params.number);
  const valid = !!cert && cert.is_valid;
  const title = titleFrom(cert);
  if (!valid || !title) {
    return {
      title: "Verify certificate",
      robots: { index: false, follow: false },
    };
  }
  const url = `${siteUrl()}/verify/${cert!.certificate_number}`;
  const description = `Verify this DigitalSkillX certificate for ${title}.`;
  return {
    title: `Certificate · ${title}`,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title: `DigitalSkillX certificate · ${title}`, description, url },
  };
}

export default async function VerifyPage({ params }: { params: { number: string } }) {
  const cert = await loadCertificate(params.number);
  const valid = !!cert && cert.is_valid;
  const student = cert ? (Array.isArray(cert.student) ? cert.student[0] : cert.student) : null;
  const course = cert ? (Array.isArray(cert.course) ? cert.course[0] : cert.course) : null;
  const path = cert ? (Array.isArray(cert.learning_path) ? cert.learning_path[0] : cert.learning_path) : null;
  const subjectTitle = course?.title || path?.title || "—";
  const studentName = cert?.recipient_name?.trim() || student?.full_name?.trim() || "—";
  const creatorRaw = path && !Array.isArray(path) ? path.creator : null;
  const creator = Array.isArray(creatorRaw) ? creatorRaw[0] : creatorRaw;
  const checkedAt = new Date().toISOString();
  const verifyUrl = `${siteUrl()}/verify/${params.number}`;
  const isLearningPath = Boolean(path?.title);

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
              <Row label="Learner" value={studentName} />
              <Row label={isLearningPath ? "Learning path" : "Course"} value={subjectTitle} />
              {creator?.display_name ? <Row label="Creator" value={creator.display_name} /> : null}
              <Row label="Completed" value={formatDate(cert!.completed_at ?? cert!.issued_at)} />
              <Row label="Issued" value={formatDate(cert!.issued_at)} />
              <Row label="Certificate №" value={cert!.certificate_number} mono />
              <Row label="Issued by" value={ORG.certificateOrg} />
              <Row label="Status" value="Verified" />
            </dl>
            {isLearningPath ? (
              <p className="mt-4 text-left text-xs leading-relaxed text-muted">{PATH_CERTIFICATE_ATTRIBUTION}</p>
            ) : null}
            <div className="mt-6 flex flex-col items-center gap-3 print:hidden">
              <CertificateShareButton
                verifyUrl={verifyUrl}
                courseTitle={subjectTitle}
                kind={isLearningPath ? "learning_path" : "course"}
              />
              <Link href="/learn" className="text-sm text-brand hover:underline">
                Explore free learning
              </Link>
              {path?.slug ? (
                <Link href={`/learn/${path.slug}`} className="text-sm text-brand hover:underline">
                  View this learning path
                </Link>
              ) : null}
            </div>
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
    <div className="flex min-w-0 items-start justify-between gap-4 border-b border-app pb-2">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`min-w-0 break-words text-right ${mono ? "font-mono font-medium" : "font-medium"}`}>
        {value}
      </dd>
    </div>
  );
}
