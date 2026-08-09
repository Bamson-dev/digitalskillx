"use client";

import { useEffect, useRef } from "react";
import { SalesPagePurchaseCta } from "@/components/marketplace/sales-page-purchase-cta";
import { SalesPageLeadCaptureForm } from "@/components/marketplace/sales-page-lead-capture";
import { PriceDisplay } from "@/components/marketplace/price-display";
import { CurriculumAccordion } from "@/components/marketplace/curriculum-accordion";
import { RecommendationRail } from "@/components/marketplace/recommendation-rail";
import type { CourseRecommendation } from "@/lib/recommendations";
import type { SalesPageSchema, SalesPageSection, TestimonialItem } from "@/lib/sales-pages/types";
import { ORG } from "@/lib/org";
import { trackProductEvent } from "@/lib/product-analytics";
import {
  attributionToMetadata,
  captureSalesAttribution,
  shouldRecordSalesPageView,
  shouldRecordScrollDepth,
  shouldRecordSectionView,
} from "@/lib/sales-attribution";

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

function TestimonialCard({ t }: { t: TestimonialItem }) {
  const photo = assetSrc(t.photoAssetId);
  return (
    <blockquote className="border border-neutral-200 bg-white p-5">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" loading="lazy" className="mb-3 h-12 w-12 rounded-full object-cover" />
      ) : null}
      {t.rating ? (
        <p className="mb-2 text-sm text-amber-700" aria-label={`${t.rating} out of 5`}>
          {"★".repeat(Math.min(5, Math.max(0, Math.round(t.rating))))}
        </p>
      ) : null}
      <p className="text-neutral-800">&ldquo;{t.quote}&rdquo;</p>
      {t.result ? <p className="mt-2 text-sm font-medium text-neutral-700">{t.result}</p> : null}
      <footer className="mt-3 text-sm font-semibold text-neutral-900">
        {t.name}
        {t.role || t.company ? (
          <span className="font-normal text-neutral-500">
            {" "}
            — {[t.role, t.company].filter(Boolean).join(", ")}
          </span>
        ) : null}
        {t.location ? <span className="block font-normal text-neutral-500">{t.location}</span> : null}
      </footer>
    </blockquote>
  );
}

function SectionBlock({
  section,
  course,
  isEnrolled,
  isLoggedIn,
  salesPageId,
}: {
  section: SalesPageSection;
  course: CourseData;
  isEnrolled: boolean;
  isLoggedIn: boolean;
  salesPageId?: string;
}) {
  switch (section.type) {
    case "hero": {
      const mediaType = section.mediaType ?? (section.imageAssetId || course.thumbnail_url ? "image" : "none");
      const img = mediaType === "image" ? assetSrc(section.imageAssetId) ?? course.thumbnail_url : null;
      const align = section.alignment === "center" ? "text-center items-center" : "";
      return (
        <section
          data-section-id={section.id}
          data-section-type={section.type}
          className="border-b border-neutral-200 px-4 py-12 sm:px-6 lg:px-8"
          style={section.background ? { background: section.background } : undefined}
        >
          <div
            className={`mx-auto grid max-w-6xl gap-8 lg:items-center ${
              mediaType === "none" ? "max-w-3xl" : "lg:grid-cols-2"
            }`}
          >
            <div className={align}>
              {section.eyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">{section.eyebrow}</p>
              ) : null}
              {section.badge ? (
                <p className="mt-2 inline-block border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-700">
                  {section.badge}
                </p>
              ) : null}
              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
                {section.headline || course.title}
              </h1>
              {section.subheadline ? (
                <p className="mt-4 text-base text-neutral-600 sm:text-lg">{section.subheadline}</p>
              ) : null}
              {section.trustText ? (
                <p className="mt-3 text-sm text-neutral-500">{section.trustText}</p>
              ) : null}
              <div className={`mt-6 flex max-w-md flex-col gap-3 sm:flex-row ${section.alignment === "center" ? "mx-auto" : ""}`}>
                <SalesPagePurchaseCta
                  courseId={course.id}
                  salesPageId={salesPageId}
                  priceNgn={course.price_ngn}
                  priceUsd={course.price_usd}
                  isEnrolled={isEnrolled}
                  isLoggedIn={isLoggedIn}
                  label={section.ctaLabel || "Enroll now"}
                  ctaId="hero"
                  sectionId={section.id}
                  sectionType="hero"
                />
              </div>
            </div>
            {mediaType === "image" && img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt="" loading="eager" className="h-auto w-full max-h-[420px] object-cover" />
            ) : null}
            {mediaType === "video" && section.videoUrl && /youtube\.com|youtu\.be|vimeo\.com/i.test(section.videoUrl) ? (
              <div className="aspect-video overflow-hidden bg-black">
                <iframe
                  title="Hero video"
                  src={section.videoUrl.replace("watch?v=", "embed/")}
                  className="h-full w-full"
                  allowFullScreen
                />
              </div>
            ) : null}
          </div>
        </section>
      );
    }
    case "intro":
    case "problem":
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
          <img src={src} alt={section.alt || ""} loading="lazy" className="mx-auto h-auto w-full object-contain" />
        </section>
      );
    }
    case "image_text": {
      const src = assetSrc(section.assetId);
      const imageFirst = section.imagePosition !== "right";
      return (
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className={`grid gap-8 lg:grid-cols-2 lg:items-center`}>
            {imageFirst && src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" loading="lazy" className="h-auto w-full object-cover" />
            ) : null}
            <div>
              {section.title ? <h2 className="text-2xl font-bold">{section.title}</h2> : null}
              {section.body ? <p className="mt-3 whitespace-pre-wrap text-neutral-700">{section.body}</p> : null}
            </div>
            {!imageFirst && src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" loading="lazy" className="h-auto w-full object-cover" />
            ) : null}
          </div>
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
            {section.items.map((item, idx) => {
              const img = assetSrc(item.imageAssetId);
              return (
                <li key={idx} className="border border-neutral-200 p-4">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" loading="lazy" className="mb-3 h-32 w-full object-cover" />
                  ) : null}
                  <p className="font-semibold text-neutral-900">{item.title}</p>
                  {item.body ? <p className="mt-1 text-sm text-neutral-600">{item.body}</p> : null}
                </li>
              );
            })}
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
    case "testimonial_grid":
      return (
        <section className="bg-neutral-50 px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-bold">{section.title || "Student stories"}</h2>
            <div
              className={`mt-6 grid gap-4 ${
                section.type === "testimonial_grid" ? "md:grid-cols-3" : "md:grid-cols-2"
              }`}
            >
              {section.items.map((t, idx) => (
                <TestimonialCard key={idx} t={t} />
              ))}
            </div>
          </div>
        </section>
      );
    case "proof":
    case "social_proof":
      return (
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          {section.title ? <h2 className="text-2xl font-bold">{section.title}</h2> : null}
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {section.items.map((item, idx) => (
              <li key={idx} className="border-t-2 border-brand pt-4">
                {item.value ? <p className="font-display text-3xl font-bold text-neutral-900">{item.value}</p> : null}
                {item.title ? <p className="mt-1 font-semibold">{item.title}</p> : null}
                {item.body ? <p className="mt-1 text-sm text-neutral-600">{item.body}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      );
    case "pricing":
      return (
        <section className="mx-auto max-w-lg px-4 py-10 text-center sm:px-6">
          <h2 className="text-2xl font-bold">Investment</h2>
          {section.discountLabel ? (
            <p className="mt-2 text-sm font-medium text-brand">{section.discountLabel}</p>
          ) : null}
          {section.originalPriceLabel ? (
            <p className="mt-2 text-sm text-neutral-400 line-through">{section.originalPriceLabel}</p>
          ) : null}
          <p className="mt-3 font-display text-4xl font-bold text-brand">
            <PriceDisplay course={course} />
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {section.paymentDescription || "One-time · Lifetime access"}
          </p>
          <div className="mx-auto mt-6 max-w-sm">
            <SalesPagePurchaseCta
              courseId={course.id}
              salesPageId={salesPageId}
              priceNgn={course.price_ngn}
              priceUsd={course.price_usd}
              isEnrolled={isEnrolled}
              isLoggedIn={isLoggedIn}
              ctaId="pricing"
              sectionId={section.id}
              sectionType="pricing"
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
    case "comparison":
      return (
        <section className="mx-auto max-w-4xl overflow-x-auto px-4 py-10 sm:px-6">
          <h2 className="text-2xl font-bold">{section.title || "Compare"}</h2>
          <table className="mt-6 w-full min-w-[480px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-300">
                {(section.columns ?? []).map((c, i) => (
                  <th key={i} className="px-3 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(section.rows ?? []).map((row, i) => (
                <tr key={i} className="border-b border-neutral-200">
                  <td className="px-3 py-2 font-medium">{row.feature}</td>
                  {(row.values ?? []).map((v, j) => (
                    <td key={j} className="px-3 py-2 text-neutral-700">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      );
    case "instructor":
      return (
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h2 className="text-2xl font-bold">Instructor</h2>
          <p className="mt-3 font-semibold">{course.instructor_name ?? ORG.instructor}</p>
          {course.instructor_bio ? <p className="mt-2 text-neutral-700">{course.instructor_bio}</p> : null}
        </section>
      );
    case "curriculum":
    case "course_preview":
      return (
        <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h2 className="mb-4 text-2xl font-bold">
            {section.type === "course_preview" ? "Course preview" : "Curriculum"}
          </h2>
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
        <section
          data-section-id={section.id}
          data-section-type="cta"
          className="bg-brand px-4 py-12 text-center text-white sm:px-6"
        >
          <div className="mx-auto max-w-md">
            <SalesPagePurchaseCta
              courseId={course.id}
              salesPageId={salesPageId}
              priceNgn={course.price_ngn}
              priceUsd={course.price_usd}
              isEnrolled={isEnrolled}
              isLoggedIn={isLoggedIn}
              label={section.label}
              className="!bg-white !text-brand"
              ctaId="final"
              sectionId={section.id}
              sectionType="cta"
            />
          </div>
        </section>
      );
    case "countdown": {
      const ends = section.endsAt ? new Date(section.endsAt) : null;
      const valid = ends && !Number.isNaN(ends.getTime());
      return (
        <section
          data-section-id={section.id}
          data-section-type="countdown"
          className="border-y border-neutral-200 bg-neutral-50 px-4 py-8 text-center sm:px-6"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-neutral-600">
            {section.label || "Limited time"}
          </p>
          {valid ? (
            <p className="mt-2 font-display text-2xl font-bold text-neutral-900">
              Ends {ends.toLocaleString()}
            </p>
          ) : (
            <p className="mt-2 text-neutral-700">Offer details available at checkout.</p>
          )}
        </section>
      );
    }
    case "spacer": {
      const h = section.size === "sm" ? "h-6" : section.size === "lg" ? "h-20" : "h-12";
      return <div className={h} aria-hidden data-section-id={section.id} />;
    }
    case "lead_capture":
      return (
        <div data-section-id={section.id} data-section-type="lead_capture">
          <SalesPageLeadCaptureForm
            courseId={course.id}
            salesPageId={salesPageId}
            title={section.title}
            body={section.body}
            buttonLabel={section.buttonLabel}
            consentText={section.consentText}
          />
        </div>
      );
    case "video":
      if (!section.url || !/youtube\.com|youtu\.be|vimeo\.com/i.test(section.url)) {
        return null;
      }
      return (
        <section
          data-section-id={section.id}
          data-section-type="video"
          className="mx-auto max-w-4xl px-4 py-10 sm:px-6"
        >
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
        <section
          data-section-id={section.id}
          data-section-type="custom_html"
          className="mx-auto max-w-4xl px-4 py-8 sm:px-6"
        >
          <div
            className="prose prose-neutral max-w-none text-sm"
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
  salesPageId,
}: {
  course: CourseData;
  schema: SalesPageSchema;
  isEnrolled: boolean;
  isLoggedIn: boolean;
  related?: CourseRecommendation[];
  preview?: boolean;
  previewViewport?: "desktop" | "tablet" | "mobile";
  salesPageId?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (preview) return;
    const attr = captureSalesAttribution({
      course_id: course.id,
      sales_page_id: salesPageId,
    });
    if (shouldRecordSalesPageView(course.id)) {
      void trackProductEvent({
        event: "sales_page_view",
        courseId: course.id,
        metadata: attributionToMetadata(attr, { sales_page_id: salesPageId ?? null }),
      });
    }

    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const pct = Math.round((window.scrollY / max) * 100);
      for (const depth of [25, 50, 75, 100] as const) {
        if (pct >= depth && shouldRecordScrollDepth(course.id, depth)) {
          void trackProductEvent({
            event: "sales_page_scroll_depth",
            courseId: course.id,
            metadata: attributionToMetadata(attr, {
              depth,
              sales_page_id: salesPageId ?? null,
            }),
          });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const root = rootRef.current;
    const observer =
      root && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const el = entry.target as HTMLElement;
                const sectionId = el.dataset.sectionId;
                const sectionType = el.dataset.sectionType;
                if (!sectionId || !shouldRecordSectionView(course.id, sectionId)) continue;
                void trackProductEvent({
                  event: "sales_page_section_view",
                  courseId: course.id,
                  metadata: attributionToMetadata(attr, {
                    section_id: sectionId,
                    section_type: sectionType ?? null,
                    sales_page_id: salesPageId ?? null,
                  }),
                });
              }
            },
            { threshold: 0.35 },
          )
        : null;
    if (observer && root) {
      root.querySelectorAll("[data-section-id]").forEach((node) => observer.observe(node));
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [course.id, preview, salesPageId]);

  useEffect(() => {
    if (preview || !related?.length) return;
    void trackProductEvent({
      event: "product_recommendation_view",
      courseId: course.id,
      metadata: {
        count: related.length,
        surface: "sales_page",
      },
    });
  }, [course.id, preview, related]);

  const widthClass =
    previewViewport === "mobile"
      ? "mx-auto max-w-[390px] border border-neutral-300"
      : previewViewport === "tablet"
        ? "mx-auto max-w-[768px] border border-neutral-300"
        : "";

  const sections = (schema.sections ?? []).filter((s) => !s.hidden && s.type !== "unsupported");
  const offer = schema.settings?.offer;
  const showOffer =
    offer &&
    offer.status === "active" &&
    (offer.headline || offer.description || (offer.bonuses && offer.bonuses.length) || offer.urgencyMessage);

  return (
    <div className={widthClass} ref={rootRef}>
      {preview ? (
        <div className="bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-900">
          Preview only — not the public page
        </div>
      ) : null}
      {showOffer ? (
        <section className="border-b border-neutral-200 bg-neutral-50 px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-3xl">
            {offer.urgencyMessage ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                {offer.urgencyMessage}
              </p>
            ) : null}
            {offer.headline ? (
              <h2 className="mt-1 font-display text-xl font-bold text-neutral-900">{offer.headline}</h2>
            ) : null}
            {offer.description ? (
              <p className="mt-2 text-sm text-neutral-600">{offer.description}</p>
            ) : null}
            {offer.bonuses?.length ? (
              <ul className="mt-4 space-y-2 text-sm text-neutral-800">
                {offer.bonuses.map((b, i) => (
                  <li key={i}>
                    <span className="font-semibold">{b.title || `Bonus ${i + 1}`}</span>
                    {b.body ? <span className="text-neutral-600"> — {b.body}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {offer.guarantee ? (
              <p className="mt-3 text-sm text-neutral-500">{offer.guarantee}</p>
            ) : null}
            <p className="mt-3 text-xs text-neutral-500">
              Price at checkout matches the live course price shown on this page.
            </p>
          </div>
        </section>
      ) : null}
      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          course={course}
          isEnrolled={isEnrolled}
          isLoggedIn={isLoggedIn}
          salesPageId={salesPageId}
        />
      ))}
      {related && related.length > 0 ? (
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <RecommendationRail
            title="You may also like"
            items={related}
            trackAs="product_recommendation"
            seedCourseId={course.id}
          />
        </div>
      ) : null}
    </div>
  );
}
