import {
  DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  type CertificateTemplateKey,
} from "@/lib/certificate-templates";
import { CertificateRenderer } from "@/components/certificates/certificate-renderer";

/** Printable certificate layout shared by the student view and browser PDF print. */
export function CertificateView({
  studentName,
  courseName,
  completedAt,
  issuedAt,
  certificateNumber,
  qrDataUrl,
  templateKey = DEFAULT_CERTIFICATE_TEMPLATE_KEY,
}: {
  studentName: string;
  courseName: string;
  completedAt: string | null;
  issuedAt: string;
  certificateNumber: string;
  qrDataUrl: string;
  templateKey?: CertificateTemplateKey | null;
}) {
  return (
    <CertificateRenderer
      templateKey={templateKey}
      rootId="certificate"
      studentName={studentName}
      courseName={courseName}
      completedAt={completedAt}
      issuedAt={issuedAt}
      certificateNumber={certificateNumber}
      qrDataUrl={qrDataUrl}
      organizationName="DigitalSkillX"
    />
  );
}
