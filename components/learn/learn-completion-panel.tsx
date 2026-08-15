"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LEARN_PROGRESS_EVENT,
  learnProgressStorageKey,
  parseLearnProgress,
  pathCertificateOfferable,
  summarizeLearnCompletion,
} from "@/lib/content-factory/library-shared";
import { PATH_CERTIFICATE_ATTRIBUTION } from "@/lib/learn-certificate-shared";
import { formatNaira } from "@/lib/currency";
import { LearnCertificateCheckout } from "@/components/learn/learn-certificate-checkout";

export type RecommendedLearnCourse = {
  id: string;
  title: string;
  price_ngn?: number | null;
};

export function LearnCompletionPanel({
  slug,
  pathId,
  title,
  creatorName,
  lessonIds,
  certificateEnabled,
  certificatePriceNgn,
  recommendedCourse,
}: {
  slug: string;
  pathId: string;
  title: string;
  creatorName?: string | null;
  lessonIds: string[];
  certificateEnabled: boolean;
  certificatePriceNgn: number | null;
  recommendedCourse: RecommendedLearnCourse | null;
}) {
  const [progress, setProgress] = useState<Record<string, boolean>>({});

  useEffect(() => {
    function read() {
      try {
        setProgress(parseLearnProgress(window.localStorage.getItem(learnProgressStorageKey(slug))));
      } catch {
        setProgress({});
      }
    }
    read();
    function onCustom(event: Event) {
      const detail = (event as CustomEvent<{ slug?: string }>).detail;
      if (!detail?.slug || detail.slug === slug) read();
    }
    window.addEventListener(LEARN_PROGRESS_EVENT, onCustom);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(LEARN_PROGRESS_EVENT, onCustom);
      window.removeEventListener("storage", read);
    };
  }, [slug]);

  const summary = useMemo(() => summarizeLearnCompletion(progress, lessonIds), [progress, lessonIds]);
  const offerable = pathCertificateOfferable({
    status: "published",
    certificate_enabled: certificateEnabled,
    certificate_price_ngn: certificatePriceNgn,
  });

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-app p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Your progress</h2>
      <p className="mt-2 text-sm text-neutral-600">
        {summary.completed} of {summary.total} lessons marked complete
        {summary.total ? ` (${summary.pct}%)` : ""}. Progress stays on this device until you choose
        to get a certificate.
      </p>

      {summary.isComplete ? (
        <div className="mt-4 space-y-3 rounded-xl bg-emerald-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Congratulations</p>
          <h3 className="break-words text-xl font-bold text-neutral-900">You completed this learning path.</h3>
          <p className="break-words text-sm text-neutral-700">
            You completed: <span className="font-semibold">{title}</span>
          </p>
          <p className="text-sm text-neutral-700">
            {summary.completed} of {summary.total} lessons completed.
            {creatorName ? (
              <>
                {" "}
                Lessons by <span className="font-medium">{creatorName}</span> on YouTube.
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {summary.isComplete && offerable ? (
        <div className="mt-4 min-w-0 rounded-xl bg-neutral-50 p-4">
          <h3 className="text-base font-semibold">Get your DigitalSkillX certificate</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Optional. Certificate {formatNaira(certificatePriceNgn ?? 0)}. Lessons stay free.
          </p>
          <p className="mt-3 text-sm font-medium text-neutral-800">Certificate includes:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-neutral-700">
            <li>Your name</li>
            <li>Learning path title</li>
            <li>Completion recognition</li>
            <li>Certificate number</li>
            <li>Verification link</li>
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">{PATH_CERTIFICATE_ATTRIBUTION}</p>
          <LearnCertificateCheckout
            pathId={pathId}
            title={title}
            priceNgn={certificatePriceNgn ?? 0}
          />
        </div>
      ) : null}

      {summary.isComplete && recommendedCourse ? (
        <div className="mt-4 min-w-0">
          <p className="text-sm font-medium">Want to go deeper?</p>
          <p className="mt-1 text-sm text-neutral-600">
            Continue with a published DigitalSkillX course when you are ready.
          </p>
          <Link
            href={`/course/${recommendedCourse.id}`}
            className="mt-2 inline-flex min-h-[44px] max-w-full items-center break-words text-sm font-semibold text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {recommendedCourse.title}
            {typeof recommendedCourse.price_ngn === "number"
              ? ` · ${formatNaira(recommendedCourse.price_ngn)}`
              : ""}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
