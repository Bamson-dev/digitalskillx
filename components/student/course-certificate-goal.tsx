import Link from "next/link";
import { Award, Lock } from "lucide-react";

export function CourseCertificateGoal({
  unlocked,
  certificateId,
}: {
  unlocked: boolean;
  certificateId?: string | null;
  templateKey?: string | null;
}) {
  if (unlocked) {
    return (
      <section className="border-y border-neutral-200 px-4 py-5 sm:px-0">
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
      </section>
    );
  }

  return (
    <section className="border-y border-neutral-200 px-4 py-5 sm:px-0">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-neutral-900">Certificate awaiting</p>
          <p className="mt-1 text-sm text-neutral-600">
            Finish every lesson to unlock your DigitalSkillX certificate.
          </p>
        </div>
      </div>
    </section>
  );
}
