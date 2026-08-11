import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { listPublishedLearningPaths } from "@/lib/content-factory/learning-paths";

export const metadata: Metadata = {
  title: "Free Learning Library",
  description:
    "Browse free DigitalSkillX learning paths built from public educational YouTube content with clear creator attribution.",
};

export const revalidate = 300;

export default async function LearnIndexPage() {
  if (!contentFactoryEnabled()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold">Free Learning</h1>
        <p className="mt-3 text-neutral-600">The Free Learning Library is not enabled yet.</p>
        <Link href="/" className="mt-6 inline-block text-brand hover:underline">
          Back home
        </Link>
      </div>
    );
  }

  const supabase = createClient();
  let paths: Awaited<ReturnType<typeof listPublishedLearningPaths>> = [];
  try {
    paths = await listPublishedLearningPaths(supabase, 60);
  } catch {
    paths = [];
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <header className="max-w-2xl">
        <p className="text-sm font-medium text-brand">Free Learning Library</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Learn practical skills free</h1>
        <p className="mt-3 text-neutral-600">
          Structured learning paths from public YouTube educational content. Watch without creating an
          account. Creators keep full credit for their original work.
        </p>
      </header>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {paths.map((path) => (
          <Link
            key={path.id}
            href={`/learn/${path.slug}`}
            className="group overflow-hidden rounded-2xl border border-app bg-white transition hover:border-brand"
          >
            <div className="aspect-[16/10] bg-neutral-100">
              {path.artwork_public_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={path.artwork_public_url}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : null}
            </div>
            <div className="space-y-1 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{path.category || "Skills"}</p>
              <h2 className="font-semibold group-hover:text-brand">{path.title}</h2>
              <p className="line-clamp-2 text-sm text-neutral-600">{path.short_description}</p>
            </div>
          </Link>
        ))}
      </div>

      {!paths.length ? (
        <p className="mt-10 text-sm text-muted">No published learning paths yet.</p>
      ) : null}
    </div>
  );
}
