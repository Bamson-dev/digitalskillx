"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Mail } from "lucide-react";

type ConfirmState =
  | { status: "idle" | "confirming" }
  | {
      status: "success";
      courseId: string;
      alreadyFulfilled?: boolean;
      buyerEmail?: string;
      isNewAccount?: boolean;
    }
  | { status: "error"; message: string };

export function PaymentReturnHandler({
  courseId,
  courseTitle,
  userEmail,
}: {
  courseId: string;
  courseTitle: string;
  userEmail?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<ConfirmState>({ status: "idle" });

  useEffect(() => {
    const paymentFlag = searchParams.get("payment");
    const reference =
      searchParams.get("trxref")?.trim() ||
      searchParams.get("reference")?.trim() ||
      "";

    if (paymentFlag !== "success" || !reference) return;

    let cancelled = false;

    async function confirm() {
      setState({ status: "confirming" });
      try {
        const res = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference, courseId }),
        });

        const json = (await res.json()) as {
          error?: string;
          enrolled?: boolean;
          courseId?: string;
          alreadyFulfilled?: boolean;
          buyerEmail?: string;
          isNewAccount?: boolean;
        };

        if (cancelled) return;

        if (!res.ok || !json.enrolled || !json.courseId) {
          setState({
            status: "error",
            message: json.error ?? "We could not confirm your payment yet.",
          });
          return;
        }

        setState({
          status: "success",
          courseId: json.courseId,
          alreadyFulfilled: json.alreadyFulfilled,
          buyerEmail: json.buyerEmail,
          isNewAccount: json.isNewAccount,
        });

        router.replace(`/course/${courseId}?enrolled=1`, { scroll: false });
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Network error while confirming payment. Please refresh.",
          });
        }
      }
    }

    void confirm();
    return () => {
      cancelled = true;
    };
  }, [courseId, router, searchParams]);

  const paymentSuccess = searchParams.get("payment") === "success";
  const enrolled = searchParams.get("enrolled") === "1";

  if (!paymentSuccess && !enrolled) return null;

  if (state.status === "confirming" || (paymentSuccess && state.status === "idle")) {
    return (
      <div className="border-b border-brand/20 bg-brand/5 px-4 py-4 text-center text-sm text-brand-700">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Confirming your payment…
        </span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="border-b border-red-200 bg-red-50 px-4 py-4 text-center text-sm text-red-700">
        {state.message}
      </div>
    );
  }

  const displayEmail = state.status === "success" ? state.buyerEmail ?? userEmail : userEmail;
  const isNewAccount = state.status === "success" ? state.isNewAccount : false;

  if (enrolled || state.status === "success") {
    return (
      <div className="border-b border-green-200 bg-green-50 px-4 py-5">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
          <div>
            <p className="text-base font-semibold text-green-900">Payment successful!</p>
            <p className="mt-1 text-sm text-green-800">
              <strong>{courseTitle}</strong> is now unlocked on your account.
            </p>
          </div>
          {displayEmail ? (
            <p className="inline-flex items-center gap-2 text-sm text-green-800">
              <Mail className="h-4 w-4" />
              {isNewAccount ? (
                <>
                  We sent your login password to <strong>{displayEmail}</strong>. Check your inbox
                  (and spam folder).
                </>
              ) : (
                <>
                  Course access details are being sent to <strong>{displayEmail}</strong>
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-green-800">
              Check your inbox for your receipt and course access email.
            </p>
          )}
          <Link
            href={isNewAccount ? "/login" : `/courses/${courseId}`}
            className="mt-1 inline-flex h-11 items-center justify-center rounded-lg bg-brand px-6 text-sm font-bold text-white hover:bg-brand-700"
          >
            {isNewAccount ? "Log in to start learning" : "Start learning"}
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
