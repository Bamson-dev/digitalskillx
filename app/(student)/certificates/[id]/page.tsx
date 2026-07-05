import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Linkedin, ExternalLink } from "lucide-react";
import { requireStudent } from "@/lib/auth";
import { getStudentCertificateById } from "@/lib/student-certificates";
import { CertificateView } from "@/components/certificate-view";
import { CertificateShareButton } from "@/components/certificate-share-button";
import { PrintButton } from "@/components/print-button";
import { DEFAULT_CERTIFICATE_TEMPLATE_KEY, normalizeCertificateTemplateKey } from "@/lib/certificate-templates";
import { qrDataUrl } from "@/lib/qr";
import { ORG, siteUrl } from "@/lib/org";

export const metadata: Metadata = { title: "Certificate" };

export default async function CertificateDetailPage({ params }: { params: { id: string } }) {
  const profile = await requireStudent();
  const cert = await getStudentCertificateById(profile.id, params.id);
  if (!cert) notFound();

  const verifyUrl = `${siteUrl()}/verify/${cert.certificateNumber}`;
  const qr = await qrDataUrl(verifyUrl);
  const linkedinUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(
    cert.courseTitle,
  )}&organizationName=${encodeURIComponent(ORG.certificateOrg)}&certUrl=${encodeURIComponent(verifyUrl)}&certId=${encodeURIComponent(
    cert.certificateNumber,
  )}`;

  return (
    <div className="space-y-5 print:space-y-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/certificates" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All certificates
        </Link>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <CertificateShareButton verifyUrl={verifyUrl} courseTitle={cert.courseTitle} />
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
        studentName={cert.recipientName}
        courseName={cert.courseTitle}
        completedAt={cert.completedAt}
        issuedAt={cert.issuedAt}
        certificateNumber={cert.certificateNumber}
        qrDataUrl={qr}
        templateKey={
          normalizeCertificateTemplateKey(cert.templateKey) ?? DEFAULT_CERTIFICATE_TEMPLATE_KEY
        }
      />
    </div>
  );
}
