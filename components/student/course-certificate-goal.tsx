import Link from "next/link";
import { Award, Lock } from "lucide-react";
import { CertificatePreview } from "@/components/certificates/certificate-preview";
import {
  DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  normalizeCertificateTemplateKey,
  type CertificateTemplateKey,
} from "@/lib/certificate-templates";
import { Card } from "@/components/ui/card";

export function CourseCertificateGoal({
  unlocked,
  certificateId,
  templateKey,
}: {
  unlocked: boolean;
  certificateId?: string | null;
  templateKey?: string | null;
}) {
  const resolvedTemplate: CertificateTemplateKey =
    normalizeCertificateTemplateKey(templateKey) ?? DEFAULT_CERTIFICATE_TEMPLATE_KEY;

  if (unlocked) {
    return (
      <Card className="overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {certificateId ? (
            <div className="shrink-0 sm:w-40">
              <CertificatePreview templateKey={resolvedTemplate} compact className="shadow-none" />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-brand">
              <Award className="h-5 w-5" />
              <p className="text-sm font-semibold uppercase tracking-wide">
                {certificateId ? "Certificate earned" : "Course complete"}
              </p>
            </div>
            <p className="mt-2 text-sm text-neutral-600">
              {certificateId
                ? "You completed this course. View and download your certificate anytime."
                : "Congratulations! You've completed this course."}
            </p>
            {certificateId ? (
              <Link
                href={`/certificates/${certificateId}`}
                className="mt-4 inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                View certificate
              </Link>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative shrink-0 sm:w-40">
          <CertificatePreview templateKey={resolvedTemplate} compact className="shadow-none" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-neutral-900/45 text-white">
            <Lock className="h-5 w-5" aria-hidden />
            <span className="px-2 text-center text-xs font-semibold">Locked</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">Your certificate awaits</p>
          <p className="mt-2 text-sm text-neutral-600">
            Complete this course to earn your certificate.
          </p>
        </div>
      </div>
    </Card>
  );
}
