"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Award, Lock } from "lucide-react";
import { CertificatePreview } from "@/components/certificates/certificate-preview";
import { dispatchClassroomMoment } from "@/lib/classroom-engagement";
import {
  DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  normalizeCertificateTemplateKey,
  type CertificateTemplateKey,
} from "@/lib/certificate-templates";

export function CourseCertificateGoal({
  unlocked,
  certificateId,
  courseId,
  templateKey,
}: {
  unlocked: boolean;
  certificateId?: string | null;
  templateKey?: string | null;
  courseId?: string | null;
}) {
  useEffect(() => {
    if (!unlocked) return;
    if (certificateId) {
      dispatchClassroomMoment("certificate_unlock", {
        dedupeKey: `cert:${certificateId}`,
      });
      return;
    }
    dispatchClassroomMoment("course_complete", {
      dedupeKey: `course-complete:${courseId ?? "unknown"}`,
    });
  }, [unlocked, certificateId, courseId]);

  const resolvedTemplate: CertificateTemplateKey =
    normalizeCertificateTemplateKey(templateKey) ?? DEFAULT_CERTIFICATE_TEMPLATE_KEY;

  if (unlocked) {
    return (
      <section className="border-y border-neutral-200 px-4 py-5 sm:px-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="w-full max-w-[220px] shrink-0">
            <CertificatePreview templateKey={resolvedTemplate} compact className="max-w-none shadow-none" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <Award className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-neutral-900">
                  {certificateId ? "Certificate earned" : "Course complete"}
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  {certificateId
                    ? "You finished this course. View and download your certificate anytime."
                    : "Congratulations — you finished every lesson."}
                </p>
                {certificateId ? (
                  <Link
                    href={`/certificates/${certificateId}`}
                    className="mt-3 inline-flex h-10 items-center bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    View certificate
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-y border-neutral-200 px-4 py-5 sm:px-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Locked preview — quiet motivation, not a game reward */}
        <div className="relative w-full max-w-[200px] shrink-0 overflow-hidden border border-neutral-200 bg-neutral-50">
          <div className="pointer-events-none select-none blur-[2.5px] saturate-[0.85] contrast-[0.95]">
            <CertificatePreview
              templateKey={resolvedTemplate}
              compact
              className="max-w-none rounded-none border-0 shadow-none"
            />
          </div>
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/75 via-white/25 to-transparent"
            aria-hidden
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 border border-neutral-300 bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-700 shadow-sm">
              <Lock className="h-3 w-3" aria-hidden />
              Locked
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-neutral-900">Certificate awaiting</p>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-neutral-600">
            Complete every lesson to unlock your official DigitalSkillX certificate for this course.
          </p>
        </div>
      </div>
    </section>
  );
}
