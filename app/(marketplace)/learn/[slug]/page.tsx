import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import {
  getCachedPublishedLearningPath,
  getCachedCategoryHub,
} from "@/lib/content-factory/library-cache";
import {
  buildLearnJsonLd,
  formatLearningMinutes,
  jsonLdIsSafe,
  serializeJsonLd,
  libraryCategoryLabel,
  normalizeLibraryCategory,
} from "@/lib/content-factory/library-shared";
import {
  buildCategoryHubCopy,
  buildCategoryJsonLd,
  categoryHubHref,
  isLibraryCategoryHubSlug,
} from "@/lib/content-factory/seo-shared";
import { Suspense } from "react";
import { LazyYoutubeEmbed } from "@/components/learn/lazy-youtube-embed";
import { LessonProgressToggle } from "@/components/learn/lesson-progress";
import { LearnCompletionPanel } from "@/components/learn/learn-completion-panel";
import { LearnCertificateReturn } from "@/components/learn/learn-certificate-return";
import { LearnCategoryHub } from "@/components/learn/learn-category-hub";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { siteUrl } from "@/lib/org";
import { resolveFinalCertificatePrice } from "@/lib/learn-certificate-pricing";

export const revalidate = 300;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!contentFactoryEnabled()) return { title: "Learning path" };
  try {
    if (isLibraryCategoryHubSlug(params.slug)) {
      const hub = await getCachedCategoryHub(params.slug);
      if (hub) {
        const copy = buildCategoryHubCopy(hub.category);
        const url = `${siteUrl()}${categoryHubHref(hub.category)}`;
        return {
          title: copy.seo_title,
          description: copy.seo_description,
          alternates: { canonical: url },
          openGraph: {
            title: copy.seo_title,
            description: copy.seo_description,
            url,
            type: "website",
          },
          twitter: {
            card: "summary_large_image",
            title: copy.seo_title,
            description: copy.seo_description,
          },
        };
      }
    }
    const loaded = await getCachedPublishedLearningPath(params.slug);
    const path = loaded?.path;
    if (!path) return { title: "Learning path" };
    const title = path.seo_title || path.title;
    const description = path.seo_description || path.short_description;
    const url = `${siteUrl()}/learn/${path.slug}`;
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title,
        description,
        url,
        type: "website",
        images: path.artwork_public_url ? [{ url: path.artwork_public_url }] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: path.artwork_public_url ? [path.artwork_public_url] : undefined,
      },
    };
  } catch {
    return { title: "Learning path" };
  }
}

export default async function LearnPathPage({ params }: Props) {
  if (!contentFactoryEnabled()) notFound();

  if (isLibraryCategoryHubSlug(params.slug)) {
    let hub;
    try {
      hub = await getCachedCategoryHub(params.slug);
    } catch {
      hub = null;
    }
    if (hub) {
      const jsonLd = buildCategoryJsonLd({
        siteUrl: siteUrl(),
        category: hub.category,
        paths: hub.paths,
      });
      return (
        <div className="marketplace min-w-0 overflow-x-hidden">
          <MarketplaceNav user={null} hideCurrencyToggle />
          {jsonLdIsSafe(jsonLd) ? (
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
          ) : null}
          <LearnCategoryHub
            category={hub.category}
            paths={hub.paths}
            relatedCategories={hub.relatedCategories}
            authorityArticles={hub.authorityArticles}
          />
          <MarketplaceFooter />
        </div>
      );
    }
  }

  let loaded;
  try {
    loaded = await getCachedPublishedLearningPath(params.slug);
  } catch {
    notFound();
  }
  if (!loaded?.path) notFound();
  const { path, curriculum, creator, related, recommendedCourse, recommendedReading } = loaded;
  const officialWebsite = curriculum.sources.find((s) => s.source_type === "website") ?? null;
  const playlistSource =
    curriculum.sources.find((s) => s.source_type === "youtube_playlist") ??
    curriculum.sources.find((s) => s.source_type === "youtube_channel") ??
    null;
  const firstLesson = curriculum.lessons[0] ?? null;
  const lessonCount = curriculum.lessons.length;
  const durations = curriculum.lessons.map((l) => l.duration_seconds).filter((n): n is number => n != null && n >= 60);
  const durationLabel =
    durations.length >= Math.max(1, Math.ceil(lessonCount / 2))
      ? formatLearningMinutes(durations.reduce((sum, n) => sum + n, 0))
      : null;

  const numbered = curriculum.sections.map((section) => ({
    section,
    lessons: curriculum.lessons.filter((l) => l.section_id === section.id),
  }));
  let lessonNumber = 0;
  const numberedLessons = numbered.map((group) => ({
    ...group,
    lessons: group.lessons.map((lesson) => {
      lessonNumber += 1;
      return { lesson, number: lessonNumber };
    }),
  }));

  const jsonLd = buildLearnJsonLd({
    siteUrl: siteUrl(),
    slug: path.slug,
    title: path.title,
    description: path.short_description || path.description,
    artworkUrl: path.artwork_public_url,
    creatorName: creator?.display_name ?? null,
    category: path.category,
    lessons: curriculum.lessons
      .filter((l) => l.youtube_video_id && l.youtube_url)
      .map((l) => ({
        title: l.title,
        youtubeUrl: l.youtube_url,
        youtubeVideoId: l.youtube_video_id,
      })),
  });

  const categoryId = normalizeLibraryCategory(path.category);
  const whoFor =
    path.difficulty === "beginner"
      ? "Beginners who want a structured free introduction before deeper practice."
      : path.difficulty === "advanced"
        ? "Learners ready for a deeper, more challenging free learning path."
        : "Self-paced learners who want a clear free path with creator-credited YouTube lessons.";

  return (
    <div className="marketplace min-w-0 overflow-x-hidden">
      <MarketplaceNav user={null} hideCurrencyToggle />
      {jsonLdIsSafe(jsonLd) ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      ) : null}
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <Link
          href="/learn"
          className="text-sm text-muted hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          ← Free Learning Library
        </Link>
        {categoryId !== "all" && categoryId !== "other" ? (
          <span className="text-sm text-muted">
            {" · "}
            <Link
              href={categoryHubHref(categoryId)}
              className="hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {libraryCategoryLabel(categoryId)}
            </Link>
          </span>
        ) : null}

        <header className="mt-4 max-w-3xl">
          <p className="text-sm font-medium text-brand">{path.category || "Free learning path"}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{path.title}</h1>
          <Suspense fallback={null}>
            <LearnCertificateReturn
              pathTitle={path.title}
              recommendedCourse={recommendedCourse ?? null}
            />
          </Suspense>
          <p className="mt-3 text-neutral-600">{path.short_description}</p>
          <p className="mt-4 text-sm text-neutral-700">
            Learn from: <span className="font-semibold">{creator?.display_name || "the original creator"}</span>
            . Original content published on YouTube. DigitalSkillX organizes these public resources into a
            structured learning path. DigitalSkillX does not claim ownership or partnership.
            {creator?.youtube_channel_url ? (
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
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-600">
            <div>
              <dt className="inline text-muted">Lessons </dt>
              <dd className="inline font-medium text-neutral-800">{lessonCount}</dd>
            </div>
            {durationLabel ? (
              <div>
                <dt className="inline text-muted">Time </dt>
                <dd className="inline font-medium text-neutral-800">{durationLabel}</dd>
              </div>
            ) : null}
            {path.difficulty ? (
              <div>
                <dt className="inline text-muted">Level </dt>
                <dd className="inline font-medium capitalize text-neutral-800">{path.difficulty}</dd>
              </div>
            ) : null}
          </dl>
        </header>

        {firstLesson?.youtube_video_id ? (
          <div className="mt-8">
            <LazyYoutubeEmbed videoId={firstLesson.youtube_video_id} title={firstLesson.title} />
            <p className="mt-2 text-sm text-muted">Now playing: {firstLesson.title}</p>
          </div>
        ) : (
          <p className="mt-8 rounded-xl border border-app p-4 text-sm text-muted">
            Lesson video is unavailable. Open the original source on YouTube when a link is provided below.
          </p>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-8">
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
              <h2 className="text-lg font-semibold">Who this is for</h2>
              <p className="mt-2 text-sm text-neutral-700">{whoFor}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Curriculum</h2>
              <nav className="mt-3 rounded-xl border border-app p-3 text-sm" aria-label="Lesson list">
                <ol className="space-y-3">
                  {numberedLessons.map((group, sectionIndex) => (
                    <li key={group.section.id}>
                      <p className="font-medium">
                        Section {sectionIndex + 1}: {group.section.title}
                      </p>
                      <ol className="mt-1 space-y-1 pl-3">
                        {group.lessons.map(({ lesson, number }) => (
                          <li key={lesson.id}>
                            <a
                              href={`#lesson-${number}`}
                              className="text-neutral-700 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                            >
                              Lesson {number}: {lesson.title}
                            </a>
                          </li>
                        ))}
                      </ol>
                    </li>
                  ))}
                </ol>
              </nav>
              <div className="mt-5 space-y-5">
                {numberedLessons.map((group, sectionIndex) => (
                  <div key={group.section.id}>
                    <h3 className="font-medium">
                      Section {sectionIndex + 1}: {group.section.title}
                    </h3>
                    <ol className="mt-2 space-y-3">
                      {group.lessons.map(({ lesson, number }) => (
                        <li
                          key={lesson.id}
                          id={`lesson-${number}`}
                          className="scroll-mt-24 rounded-xl border border-app p-3"
                        >
                          <p className="font-medium">
                            Lesson {number}: {lesson.title}
                          </p>
                          {lesson.summary ? (
                            <p className="mt-1 text-sm text-neutral-600">{lesson.summary}</p>
                          ) : null}
                          <div className="mt-3">
                            {lesson.youtube_video_id ? (
                              <LazyYoutubeEmbed videoId={lesson.youtube_video_id} title={lesson.title} />
                            ) : (
                              <p className="rounded-lg bg-neutral-50 p-3 text-sm text-muted">
                                This YouTube video is unavailable.
                              </p>
                            )}
                          </div>
                          {lesson.youtube_url ? (
                            <a
                              href={lesson.youtube_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-block text-xs text-brand hover:underline"
                            >
                              Open on YouTube
                            </a>
                          ) : (
                            <p className="mt-2 text-xs text-muted">Original YouTube link unavailable.</p>
                          )}
                          <LessonProgressToggle
                            slug={path.slug}
                            pathId={path.id}
                            lessonId={String(number)}
                          />
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>

            <LearnCompletionPanel
              slug={path.slug}
              pathId={path.id}
              title={path.title}
              creatorName={creator?.display_name ?? null}
              lessonIds={numberedLessons.flatMap((group) => group.lessons.map(({ number }) => String(number)))}
              certificateEnabled={path.certificate_enabled === true}
              certificatePriceNgn={resolveFinalCertificatePrice({
                mode: (path as { certificate_pricing_mode?: string | null }).certificate_pricing_mode,
                recommendedPriceNgn: (path as { certificate_recommended_price_ngn?: number | null })
                  .certificate_recommended_price_ngn,
                fixedPriceNgn: path.certificate_price_ngn ?? null,
              })}
              certificatePricingMode={
                (path as { certificate_pricing_mode?: string | null }).certificate_pricing_mode ?? null
              }
              recommendedCourse={recommendedCourse ?? null}
            />
          </div>

          <aside className="space-y-4">
            {creator ? (
              <div className="rounded-2xl border border-app p-4">
                <h2 className="font-semibold">About the creator</h2>
                <p className="mt-2 text-sm font-medium">{creator.display_name}</p>
                {creator.short_bio ? (
                  <p className="mt-1 text-sm text-neutral-600">{creator.short_bio}</p>
                ) : (
                  <p className="mt-1 text-sm text-muted">Creator profile details are limited.</p>
                )}
                {creator.teaches ? (
                  <p className="mt-2 text-sm text-neutral-700">Teaches: {creator.teaches}</p>
                ) : null}
                {creator.expertise?.length ? (
                  <p className="mt-2 text-sm text-neutral-700">Expertise: {creator.expertise.join(", ")}</p>
                ) : null}
                {creator.relevance ? (
                  <p className="mt-2 text-sm text-neutral-700">Audience: {creator.relevance}</p>
                ) : null}
                {creator.youtube_channel_url ? (
                  <a
                    href={creator.youtube_channel_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm text-brand hover:underline"
                  >
                    YouTube channel
                  </a>
                ) : null}
                {officialWebsite ? (
                  <a
                    href={officialWebsite.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block text-sm text-brand hover:underline"
                  >
                    Official website
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-app p-4 text-sm text-muted">
                Creator profile details are not available for this path.
              </div>
            )}

            <div className="rounded-2xl border border-app p-4 text-sm text-neutral-600">
              <p className="font-semibold text-neutral-900">Attribution</p>
              <p className="mt-2">
                Lessons embed the original YouTube videos. DigitalSkillX does not download or rehost
                video files and does not claim a partnership with the creator. Original content published on YouTube.
              </p>
            </div>

            {playlistSource ? (
              <div className="rounded-2xl border border-app p-4 text-sm">
                <p className="font-semibold">Source</p>
                <a
                  href={playlistSource.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-brand hover:underline"
                >
                  {playlistSource.source_title || "Original YouTube source"}
                </a>
              </div>
            ) : null}

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

        {recommendedReading?.length ? (
          <section className="mt-12">
            <h2 className="text-lg font-semibold">Recommended reading</h2>
            <ul className="mt-4 space-y-2">
              {recommendedReading.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/guides/${item.slug}`}
                    className="text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {item.title}
                  </Link>
                  <span className="text-xs text-muted"> · {item.content_type.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {related.length ? (
          <section className="mt-12">
            <h2 className="text-lg font-semibold">Related learning</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {related.map((item) => (
                <Link
                  key={item.id}
                  href={`/learn/${item.slug}`}
                  className="rounded-xl border border-app p-4 hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <p className="text-xs uppercase tracking-wide text-muted">{item.category || "Skills"}</p>
                  <p className="mt-1 font-medium">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{item.short_description}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <MarketplaceFooter />
    </div>
  );
}
