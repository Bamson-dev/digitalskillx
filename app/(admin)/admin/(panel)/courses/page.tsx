import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateCourseForm } from "@/components/admin/create-course-form";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Courses" };

export default async function AdminCoursesPage() {
  const supabase = await getAdminSupabase();
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, title, visibility, created_at, modules(id)")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Courses</h1>
          <p className="mt-1 text-sm text-muted">Build and manage your catalogue.</p>
        </div>
      </div>

      <CreateCourseForm />

      {!courses || courses.length === 0 ? (
        <Card className="text-center text-sm text-muted">
          No courses yet. Create your first course above.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <Link key={c.id} href={`/admin/courses/${c.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-brand-50 text-brand">
                  <BookOpen className="h-7 w-7" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-semibold">{c.title}</h3>
                  <Badge
                    tone={
                      c.visibility === "published"
                        ? "green"
                        : c.visibility === "archived"
                          ? "neutral"
                          : "amber"
                    }
                  >
                    {c.visibility}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {(c.modules?.length ?? 0)} module(s) · Created {formatDate(c.created_at)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
