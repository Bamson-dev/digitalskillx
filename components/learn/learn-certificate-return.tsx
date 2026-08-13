"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type State =
  | { status: "idle" | "confirming" }
  | { status: "success"; certificateId?: string | null; certificateNumber?: string | null }
  | { status: "error"; message: string };

export function LearnCertificateReturn() {
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

  return (
    <div className="mt-6 rounded-2xl border border-app p-4 text-sm">
      {state.status === "confirming" ? <p>Confirming your certificate payment…</p> : null}
      {state.status === "error" ? <p className="text-red-600">{state.message}</p> : null}
      {state.status === "success" ? (
        <div className="space-y-2">
          <p className="font-medium">Certificate payment confirmed.</p>
          {state.certificateNumber ? (
            <p>
              Certificate number{" "}
              <span className="font-mono">{state.certificateNumber}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {state.certificateId ? (
              <Link href={`/certificates/${state.certificateId}`} className="text-brand hover:underline">
                View certificate
              </Link>
            ) : (
              <Link href="/certificates" className="text-brand hover:underline">
                Open my certificates
              </Link>
            )}
            {state.certificateNumber ? (
              <Link href={`/verify/${state.certificateNumber}`} className="text-brand hover:underline">
                Public verification
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
