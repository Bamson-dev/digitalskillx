"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CertificateShareButton } from "@/components/certificate-share-button";
import { formatNaira } from "@/lib/currency";
import type { RecommendedLearnCourse } from "@/components/learn/learn-completion-panel";

type State =
  | { status: "idle" | "confirming" }
  | {
      status: "success";
      certificateId?: string | null;
      certificateNumber?: string | null;
    }
  | { status: "error"; message: string };

export function LearnCertificateReturn({
  pathTitle,
  recommendedCourse,
}: {
  pathTitle: string;
  recommendedCourse?: RecommendedLearnCourse | null;
}) {
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    const paymentFlag = searchParams.get("payment");
    const reference =
      searchParams.get("trxref")?.trim() || searchParams.get("reference")?.trim() || "";
    if (paymentFlag !== "success" || !reference) return;

    let cancelled = false;
    async function confirm() {
      setState({ status: "confirming" });
      try {
        const res = await fetch("/api/payments/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference }),
        });
        const json = (await res.json()) as {
          error?: string;
          enrolled?: boolean;
          certificateId?: string | null;
          certificateNumber?: string | null;
        };
        if (cancelled) return;
        if (!res.ok || !json.enrolled) {
          setState({ status: "error", message: json.error ?? "Payment could not be confirmed." });
          return;
        }
        setState({
          status: "success",
          certificateId: json.certificateId,
          certificateNumber: json.certificateNumber,
        });
      } catch {
        if (!cancelled) setState({ status: "error", message: "Payment could not be confirmed." });
      }
    }
    void confirm();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  if (state.status === "idle") return null;

  const verifyUrl =
    state.status === "success" && state.certificateNumber
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/verify/${state.certificateNumber}`
      : "";

  return (
    <div className="mt-6 min-w-0 overflow-hidden rounded-2xl border border-app p-4 text-sm">
      {state.status === "confirming" ? <p>Confirming your certificate payment…</p> : null}
      {state.status === "error" ? (
        <p className="text-red-600" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" ? (
        <div className="space-y-3">
          <p className="text-base font-semibold text-neutral-900">Certificate issued successfully.</p>
          {state.certificateNumber ? (
            <p>
              Certificate number{" "}
              <span className="font-mono">{state.certificateNumber}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {state.certificateId ? (
              <Link
                href={`/certificates/${state.certificateId}`}
                className="inline-flex min-h-[44px] items-center font-semibold text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                View certificate
              </Link>
            ) : (
              <Link
                href="/certificates"
                className="inline-flex min-h-[44px] items-center font-semibold text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Open my certificates
              </Link>
            )}
            {state.certificateId ? (
              <Link
                href={`/certificates/${state.certificateId}`}
                className="inline-flex min-h-[44px] items-center text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Download / access certificate
              </Link>
            ) : null}
            {state.certificateNumber ? (
              <Link
                href={`/verify/${state.certificateNumber}`}
                className="inline-flex min-h-[44px] items-center text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Verify certificate
              </Link>
            ) : null}
          </div>
          {verifyUrl ? (
            <CertificateShareButton
              verifyUrl={verifyUrl}
              courseTitle={pathTitle}
              kind="learning_path"
            />
          ) : null}
          {recommendedCourse ? (
            <div className="rounded-xl bg-neutral-50 p-3">
              <p className="font-medium">Want to go deeper?</p>
              <p className="mt-1 text-neutral-600">Continue with:</p>
              <Link
                href={`/course/${recommendedCourse.id}`}
                className="mt-2 inline-flex min-h-[44px] items-center font-semibold text-brand hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {recommendedCourse.title}
                {typeof recommendedCourse.price_ngn === "number"
                  ? ` · ${formatNaira(recommendedCourse.price_ngn)}`
                  : ""}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
