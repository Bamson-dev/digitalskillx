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
import { formatNaira } from "@/lib/currency";
import { LearnCertificateCheckout } from "@/components/learn/learn-certificate-checkout";

export function LearnCompletionPanel({
  slug,
  pathId,
  title,
  lessonIds,
  certificateEnabled,
  certificatePriceNgn,
  recommendedCourse,
}: {
  slug: string;
  pathId: string;
  title: string;
  lessonIds: string[];
  certificateEnabled: boolean;
  certificatePriceNgn: number | null;
  recommendedCourse: { id: string; title: string } | null;
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
    <section className="rounded-2xl border border-app p-4">
      <h2 className="text-lg font-semibold">Your progress</h2>
      <p className="mt-2 text-sm text-neutral-600">
        {summary.completed} of {summary.total} lessons marked complete
        {summary.total ? ` (${summary.pct}%)` : ""}. Progress stays on this device until you choose
        to get a certificate.
      </p>
      {summary.isComplete ? (
        <p className="mt-3 text-sm font-medium text-neutral-800">
          You completed the lessons in this learning path.
        </p>
      ) : null}

      {offerable ? (
        <div className="mt-4 rounded-xl bg-neutral-50 p-3">
          <p className="text-sm font-medium">
            {summary.isComplete
              ? "You completed this learning path. Get your DigitalSkillX certificate."
              : "Want a certificate for this learning path?"}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Optional. Lessons stay free. Certificate {formatNaira(certificatePriceNgn ?? 0)}.
          </p>
          <LearnCertificateCheckout
            pathId={pathId}
            title={title}
            priceNgn={certificatePriceNgn ?? 0}
          />
        </div>
      ) : null}

      {recommendedCourse ? (
        <div className="mt-4">
          <p className="text-sm font-medium">Want to go further?</p>
          <p className="mt-1 text-sm text-neutral-600">
            Continue into a deeper DigitalSkillX program when you are ready.
          </p>
          <Link
            href={`/course/${recommendedCourse.id}`}
            className="mt-2 inline-block text-sm font-semibold text-brand hover:underline"
          >
            {recommendedCourse.title}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
