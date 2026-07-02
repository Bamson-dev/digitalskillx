import type { CertificateTemplateKey } from "@/lib/certificate-templates";

export type CertificateRenderData = {
  studentName: string;
  courseName: string;
  issuedAt: string;
  completedAt: string | null;
  certificateNumber: string;
  qrDataUrl: string;
  organizationName?: string;
  rootId?: string;
};

export type CertificateTemplateProps = CertificateRenderData & {
  templateKey?: CertificateTemplateKey;
};

export const SAMPLE_CERTIFICATE_DATA: Omit<CertificateRenderData, "qrDataUrl"> = {
  studentName: "Jane Akande",
  courseName: "Digital Marketing Fundamentals",
  issuedAt: "2026-07-02T12:00:00.000Z",
  completedAt: "2026-07-01T18:30:00.000Z",
  certificateNumber: "PDG-SAMPLE01",
  organizationName: "DigitalSkillX",
};
