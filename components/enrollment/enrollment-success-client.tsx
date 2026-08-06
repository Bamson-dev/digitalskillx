"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type CourseCard = {
  id: string;
  title: string;
  thumbnail_url: string | null;
};

export function EnrollmentSuccessClient() {
  const searchParams = useSearchParams();
  const linkId = searchParams.get("link");
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }

        if (linkId) {
          // Best-effort event — admin client not available; skip silently on client
        }

        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("course_id, courses(id, title, thumbnail_url)")
          .eq("student_id", user.id)
          .order("enrolled_at", { ascending: false })
          .limit(12);

        const cards: CourseCard[] = [];
        for (const row of enrollments ?? []) {
          const c = row.courses as unknown as CourseCard | CourseCard[] | null;
          const course = Array.isArray(c) ? c[0] : c;
          if (course?.id) cards.push(course);
        }
        if (!cancelled) setCourses(cards);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkId]);

  const continueHref = useMemo(() => {
    if (courses.length === 1) return `/courses/${courses[0].id}`;
    return "/dashboard";
  }, [courses]);

  return (
    <div className="relative mx-auto max-w-3xl overflow-hidden px-4 py-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 20% 20%, rgba(16,185,129,0.25), transparent 40%), radial-gradient(circle at 80% 10%, rgba(59,130,246,0.2), transparent 35%)",
        }}
      />
      <div className="relative">
        <p className="text-sm font-medium text-brand">You&apos;re in</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Welcome to DigitalSkillX
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-muted">
          Your courses are ready. Pick up where you left off anytime from your dashboard.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm text-muted">
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-app">
            {courses.length || "—"} course{courses.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-full bg-white px-3 py-1 ring-1 ring-app">0% started</span>
        </div>

        <div className="mt-10 space-y-3 text-left">
          {loading ? (
            <p className="text-center text-sm text-muted">Loading your courses…</p>
          ) : (
            courses.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                href={`/courses/${c.id}`}
                className="block rounded-xl border border-app bg-white px-4 py-3 font-medium hover:border-brand"
              >
                {c.title}
              </Link>
            ))
          )}
        </div>

        <div className="mt-10">
          <Link href={continueHref}>
            <Button size="lg">Continue learning</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
