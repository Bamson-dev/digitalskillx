import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Linkedin, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { CertificateView } from "@/components/certificate-view";
import { PrintButton } from "@/components/print-button";
import { DEFAULT_CERTIFICATE_TEMPLATE_KEY, normalizeCertificateTemplateKey } from "@/lib/certificate-templates";
import { qrDataUrl } from "@/lib/qr";
import { ORG, siteUrl } from "@/lib/org";

export const metadata: Metadata = { title: "Certificate" };

export default async function CertificateDetailPage({ params }: { params: { id: string } }) {
  const profile = await requireStudent();
  const supabase = createClient();

  const { data: cert } = await supabase
    .from("certificates")
    .select("id, certificate_number, issued_at, completed_at, template_key, course:courses(title)")
    .eq("id", params.id)
    .eq("student_id", profile.id)
    .single();
  if (!cert) notFound();

  const course = Array.isArray(cert.course) ? cert.course[0] : cert.course;
  const verifyUrl = `${siteUrl()}/verify/${cert.certificate_number}`;
  const qr = await qrDataUrl(verifyUrl);
  const linkedinUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
    course?.title ?? "Course",
  )}&organizationName=${encodeURIComponent(ORG.certificateOrg)}&certUrl=${encodeURIComponent(verifyUrl)}&certId=${encodeURIComponent(
    cert.certificate_number,
  )}`;

  return (
    <div className="space-y-5 print:space-y-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/certificates" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All certificates
        </Link>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0a66c2] px-4 py-2 text-sm font-semibold text-white"
          >
            <Linkedin className="h-4 w-4" /> Add to LinkedIn
          </a>
          <a
            href={verifyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-app px-4 py-2 text-sm font-semibold"
          >
            <ExternalLink className="h-4 w-4" /> Public link
          </a>
        </div>
      </div>

      <CertificateView
        studentName={profile.full_name ?? profile.email}
        courseName={course?.title ?? "Course"}
        completedAt={cert.completed_at}
        issuedAt={cert.issued_at}
        certificateNumber={cert.certificate_number}
        qrDataUrl={qr}
        templateKey={
          normalizeCertificateTemplateKey(cert.template_key) ?? DEFAULT_CERTIFICATE_TEMPLATE_KEY
        }
      />
    </div>
  );
}
