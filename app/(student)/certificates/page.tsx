import type { Metadata } from "next";
import Link from "next/link";
import { Award } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const profile = await requireStudent();
  const supabase = createClient();

  const { data: certs } = await supabase
    .from("certificates")
    .select("id, certificate_number, issued_at, is_valid, course:courses(title)")
    .eq("student_id", profile.id)
    .order("issued_at", { ascending: false });

  const certificates = certs ?? [];

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
          {certificates.map((c) => {
            const course = Array.isArray(c.course) ? c.course[0] : c.course;
            return (
              <Link key={c.id} href={`/certificates/${c.id}`}>
                <Card className="flex items-center gap-4 transition-shadow hover:shadow-md">
                  <div className="rounded-lg bg-brand-50 p-3 text-brand">
                    <Award className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      {course?.title ?? "Course"}
                    </h3>
                    <p className="text-xs text-muted">
                      #{c.certificate_number} · Issued {formatDate(c.issued_at)}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
