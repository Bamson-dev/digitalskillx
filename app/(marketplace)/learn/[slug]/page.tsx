import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import {
  getPublishedLearningPathBySlug,
  loadLearningPathCurriculum,
} from "@/lib/content-factory/learning-paths";
import { LazyYoutubeEmbed } from "@/components/learn/lazy-youtube-embed";
import { siteUrl } from "@/lib/org";

export const revalidate = 300;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!contentFactoryEnabled()) return { title: "Learning path" };
  const supabase = createClient();
  try {
    const path = await getPublishedLearningPathBySlug(supabase, params.slug);
    if (!path) return { title: "Learning path" };
    return {
      title: path.seo_title || path.title,
      description: path.seo_description || path.short_description,
      alternates: { canonical: `${siteUrl()}/learn/${path.slug}` },
      openGraph: {
        title: path.title,
        description: path.short_description,
        images: path.artwork_public_url ? [{ url: path.artwork_public_url }] : undefined,
      },
    };
  } catch {
    return { title: "Learning path" };
  }
}

export default async function LearnPathPage({ params }: Props) {
  if (!contentFactoryEnabled()) notFound();

  const supabase = createClient();
  let path;
  try {
    path = await getPublishedLearningPathBySlug(supabase, params.slug);
  } catch {
    notFound();
  }
  if (!path) notFound();

  const curriculum = await loadLearningPathCurriculum(supabase, path.id);
  let creator: {
    display_name: string;
    short_bio: string;
    youtube_channel_url: string | null;
    relevance: string;
  } | null = null;
  if (path.creator_profile_id) {
    const { data } = await supabase
      .from("creator_profiles")
      .select("display_name, short_bio, youtube_channel_url, relevance")
      .eq("id", path.creator_profile_id)
      .maybeSingle();
    creator = data;
  }

  const firstLesson = curriculum.lessons[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/learn" className="text-sm text-muted hover:text-brand">
        ← Free Learning Library
      </Link>

      <header className="mt-4 max-w-3xl">
        <p className="text-sm font-medium text-brand">{path.category || "Free learning path"}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{path.title}</h1>
        <p className="mt-3 text-neutral-600">{path.short_description}</p>
        {creator ? (
          <p className="mt-4 text-sm text-neutral-700">
            Learn from <span className="font-semibold">{creator.display_name}</span>. Original content
            published on YouTube.
            {creator.youtube_channel_url ? (
              <>
                {" "}
                <a
                  href={creator.youtube_channel_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand hover:underline"
                >
                  View channel
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </header>

      {firstLesson ? (
        <div className="mt-8">
          <LazyYoutubeEmbed videoId={firstLesson.youtube_video_id} title={firstLesson.title} />
          <p className="mt-2 text-sm text-muted">Now playing: {firstLesson.title}</p>
        </div>
      ) : null}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_280px]">
        <div className="space-y-8">
          <section>
            <h2 className="text-lg font-semibold">About this path</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">
              {path.description}
            </p>
          </section>

          {path.learning_objectives?.length ? (
            <section>
              <h2 className="text-lg font-semibold">What you will learn</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
                {path.learning_objectives.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="text-lg font-semibold">Curriculum</h2>
            <div className="mt-3 space-y-5">
              {curriculum.sections.map((section) => (
                <div key={section.id}>
                  <h3 className="font-medium">{section.title}</h3>
                  <ol className="mt-2 space-y-3">
                    {curriculum.lessons
                      .filter((l) => l.section_id === section.id)
                      .map((lesson) => (
                        <li key={lesson.id} className="rounded-xl border border-app p-3">
                          <p className="font-medium">{lesson.title}</p>
                          {lesson.summary ? (
                            <p className="mt-1 text-sm text-neutral-600">{lesson.summary}</p>
                          ) : null}
                          <div className="mt-3">
                            <LazyYoutubeEmbed videoId={lesson.youtube_video_id} title={lesson.title} />
                          </div>
                          <a
                            href={lesson.youtube_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block text-xs text-brand hover:underline"
                          >
                            Open on YouTube
                          </a>
                        </li>
                      ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          {creator ? (
            <div className="rounded-2xl border border-app p-4">
              <h2 className="font-semibold">Creator</h2>
              <p className="mt-2 text-sm font-medium">{creator.display_name}</p>
              <p className="mt-1 text-sm text-neutral-600">{creator.short_bio}</p>
              {creator.relevance ? (
                <p className="mt-2 text-xs text-muted">{creator.relevance}</p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl border border-app p-4 text-sm text-neutral-600">
            <p className="font-semibold text-neutral-900">Attribution</p>
            <p className="mt-2">
              Lessons embed the original YouTube videos. DigitalSkillX does not download or rehost
              video files and does not claim a partnership with the creator. Original content published on YouTube.
            </p>
          </div>

          {curriculum.sources.length ? (
            <div className="rounded-2xl border border-app p-4">
              <p className="font-semibold">Sources</p>
              <ul className="mt-2 space-y-1 text-sm">
                {curriculum.sources.map((s) => (
                  <li key={s.id}>
                    <a href={s.source_url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      {s.source_title || s.source_type}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
