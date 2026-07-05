import type { Metadata } from "next";
import Link from "next/link";
import { Award } from "lucide-react";
import { requireStudent } from "@/lib/auth";
import { getStudentCertificates } from "@/lib/student-certificates";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const profile = await requireStudent();
  const certificates = await getStudentCertificates(profile.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Certificates</h1>
        <p className="mt-1 text-sm text-muted">
          Certificates you&apos;ve earned by completing courses.
        </p>
      </div>

      {certificates.length === 0 ? (
        <Card className="text-center text-sm text-muted">
          No certificates yet. Complete a course to earn one.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {certificates.map((c) => (
            <Link key={c.id} href={`/certificates/${c.id}`}>
              <Card className="flex items-center gap-4 transition-shadow hover:shadow-md">
                <div className="rounded-lg bg-brand-50 p-3 text-brand">
                  <Award className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{c.courseTitle ?? "Course"}</h3>
                  <p className="truncate text-sm text-neutral-700">{c.recipientName}</p>
                  <p className="text-xs text-muted">
                    #{c.certificateNumber} · Issued {formatDate(c.issuedAt)}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
