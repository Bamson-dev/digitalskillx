"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
    <div className="mx-auto max-w-2xl px-4 py-14 sm:py-16">
      <p className="text-sm font-semibold text-brand">You&apos;re enrolled</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950">
        Welcome to DigitalSkillX
      </h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-neutral-600">
        Your courses are ready. Resume anytime from your dashboard.
      </p>

      <div className="mt-10">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading your courses…</p>
        ) : courses.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Sign in to see your enrolled courses, or open your dashboard.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
            {courses.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/courses/${c.id}`}
                  className="flex min-h-[52px] items-center py-3.5 text-left font-medium text-neutral-900 hover:text-brand"
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10">
        <Link
          href={continueHref}
          className="inline-flex h-12 min-h-[48px] items-center justify-center bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Continue learning
        </Link>
      </div>
    </div>
  );
}
