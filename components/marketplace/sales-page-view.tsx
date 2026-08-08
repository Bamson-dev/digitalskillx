"use client";

import { SalesPagePurchaseCta } from "@/components/marketplace/sales-page-purchase-cta";
import { PriceDisplay } from "@/components/marketplace/price-display";
import { CurriculumAccordion } from "@/components/marketplace/curriculum-accordion";
import { RecommendationRail } from "@/components/marketplace/recommendation-rail";
import type { CourseRecommendation } from "@/lib/recommendations";
import type { SalesPageSchema, SalesPageSection } from "@/lib/sales-pages/types";
import { ORG } from "@/lib/org";

type Lesson = { id: string; title: string; position: number; lesson_type: string };
type Module = { id: string; title: string; position: number; lessons: Lesson[] };

type CourseData = {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  price_ngn: number;
  price_usd: number;
  learning_outcomes: string[];
  instructor_name: string | null;
  instructor_bio: string | null;
  modules: Module[];
};

function assetSrc(assetId?: string | null) {
  return assetId ? `/api/sales-page-assets/${assetId}` : null;
}

function SectionBlock({
  section,
  course,
  isEnrolled,
  isLoggedIn,
}: {
  section: SalesPageSection;
  course: CourseData;
  isEnrolled: boolean;
  isLoggedIn: boolean;
}) {
  switch (section.type) {
    case "hero": {
      const img = assetSrc(section.imageAssetId) ?? course.thumbnail_url;
      return (
        <section className="border-b border-neutral-200 bg-neutral-50 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
                {section.headline || course.title}
              </h1>
              {section.subheadline ? (
                <p className="mt-4 text-base text-neutral-600 sm:text-lg">{section.subheadline}</p>
              ) : null}
              <div className="mt-6 max-w-sm">
                <SalesPagePurchaseCta
                  courseId={course.id}
                  priceNgn={course.price_ngn}
                  priceUsd={course.price_usd}
                  isEnrolled={isEnrolled}
                  isLoggedIn={isLoggedIn}
                  label={section.ctaLabel || "Enroll now"}
                />
              </div>
            </div>
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img}
                alt=""
                className="h-auto w-full max-h-[420px] object-cover"
              />
            ) : null}
          </div>
        </section>
      );
    }
    case "text":
      return (
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          {section.title ? <h2 className="text-2xl font-bold text-neutral-900">{section.title}</h2> : null}
          {section.body ? <p className="mt-3 whitespace-pre-wrap text-neutral-700">{section.body}</p> : null}
        </section>
      );
    case "image": {
      const src = assetSrc(section.assetId);
      if (!src) return null;
      return (
        <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={section.alt || ""} className="mx-auto h-auto w-full object-contain" />
        </section>
      );
    }
    case "benefits":
    case "features":
    case "bonuses":
      return (
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          {section.title ? <h2 className="text-2xl font-bold">{section.title}</h2> : null}
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {section.items.map((item, idx) => (
              <li key={idx} className="border border-neutral-200 p-4">
                <p className="font-semibold text-neutral-900">{item.title}</p>
                {item.body ? <p className="mt-1 text-sm text-neutral-600">{item.body}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      );
    case "learning_outcomes":
      return (
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h2 className="text-2xl font-bold">What you will learn</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-neutral-700">
            {(course.learning_outcomes ?? []).map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </section>
      );
    case "testimonials":
      return (
        <section className="bg-neutral-50 px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold">{section.title || "Student stories"}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {section.items.map((t, idx) => (
                <blockquote key={idx} className="border border-neutral-200 bg-white p-5">
                  <p className="text-neutral-800">&ldquo;{t.quote}&rdquo;</p>
                  <footer className="mt-3 text-sm font-semibold text-neutral-900">
                    {t.name}
                    {t.role ? <span className="font-normal text-neutral-500"> — {t.role}</span> : null}
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      );
    case "pricing":
      return (
        <section className="mx-auto max-w-lg px-4 py-10 text-center sm:px-6">
          <h2 className="text-2xl font-bold">Investment</h2>
          <p className="mt-3 font-display text-4xl font-bold text-brand">
            <PriceDisplay course={course} />
          </p>
          <p className="mt-1 text-sm text-neutral-500">One-time · Lifetime access</p>
          <div className="mx-auto mt-6 max-w-sm">
            <SalesPagePurchaseCta
              courseId={course.id}
              priceNgn={course.price_ngn}
              priceUsd={course.price_usd}
              isEnrolled={isEnrolled}
              isLoggedIn={isLoggedIn}
            />
          </div>
        </section>
      );
    case "faq":
      return (
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h2 className="text-2xl font-bold">{section.title || "FAQ"}</h2>
          <div className="mt-6 space-y-3">
            {section.items.map((item, idx) => (
              <details key={idx} className="border border-neutral-200 p-4">
                <summary className="cursor-pointer font-semibold">{item.question}</summary>
                <p className="mt-2 text-sm text-neutral-600">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      );
    case "instructor":
      return (
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h2 className="text-2xl font-bold">Instructor</h2>
          <p className="mt-3 font-semibold">{course.instructor_name ?? ORG.instructor}</p>
          {course.instructor_bio ? (
            <p className="mt-2 text-neutral-700">{course.instructor_bio}</p>
          ) : null}
        </section>
      );
    case "curriculum":
      return (
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h2 className="mb-4 text-2xl font-bold">Curriculum</h2>
          <CurriculumAccordion modules={course.modules} />
        </section>
      );
    case "guarantee":
      return (
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h2 className="text-2xl font-bold">{section.title || "Guarantee"}</h2>
          <p className="mt-3 text-neutral-700">{section.body}</p>
        </section>
      );
    case "cta":
      return (
        <section className="bg-brand px-4 py-12 text-center text-white sm:px-6">
          <div className="mx-auto max-w-md">
            <SalesPagePurchaseCta
              courseId={course.id}
              priceNgn={course.price_ngn}
              priceUsd={course.price_usd}
              isEnrolled={isEnrolled}
              isLoggedIn={isLoggedIn}
              label={section.label}
              className="!bg-white !text-brand"
            />
          </div>
        </section>
      );
    case "video":
      if (!section.url || !/youtube\.com|youtu\.be|vimeo\.com/i.test(section.url)) {
        return null;
      }
      return (
        <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <div className="aspect-video overflow-hidden bg-black">
            <iframe
              title="Sales page video"
              src={section.url.replace("watch?v=", "embed/")}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </section>
      );
    case "custom_html":
      return (
        <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <div
            className="prose prose-neutral max-w-none text-sm"
            // Sanitized at import time; still never trust scripts.
            dangerouslySetInnerHTML={{ __html: section.html }}
          />
        </section>
      );
    case "unsupported":
      return null;
    default:
      return null;
  }
}

export function SalesPageView({
  course,
  schema,
  isEnrolled,
  isLoggedIn,
  related,
  preview = false,
  previewViewport = "desktop",
}: {
  course: CourseData;
  schema: SalesPageSchema;
  isEnrolled: boolean;
  isLoggedIn: boolean;
  related?: CourseRecommendation[];
  preview?: boolean;
  previewViewport?: "desktop" | "mobile";
}) {
  const widthClass = previewViewport === "mobile" ? "mx-auto max-w-[390px] border border-neutral-300" : "";

  return (
    <div className={widthClass}>
      {preview ? (
        <div className="bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-900">
          Preview only — not the public page
        </div>
      ) : null}
      {(schema.sections ?? []).map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          course={course}
          isEnrolled={isEnrolled}
          isLoggedIn={isLoggedIn}
        />
      ))}
      {related && related.length > 0 ? (
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <RecommendationRail title="You may also like" items={related} />
        </div>
      ) : null}
    </div>
  );
}
