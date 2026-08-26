"use client";

import { FormEvent, useState } from "react";
import { formatNaira } from "@/lib/currency";
import { learnProgressStorageKey, parseLearnProgress } from "@/lib/content-factory/library-shared";

export function LearnCertificateCheckout({
  pathId,
  slug,
  title,
  priceNgn,
  isFree = false,
}: {
  pathId: string;
  slug: string;
  title: string;
  priceNgn: number;
  isFree?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function completedLessonNumbers(): string[] {
    try {
      const progress = parseLearnProgress(window.localStorage.getItem(learnProgressStorageKey(slug)));
      return Object.keys(progress).filter((key) => progress[key]);
    } catch {
      return [];
    }
  }

  async function startCheckout(guest?: { email: string; fullName: string }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learningPathId: pathId,
          email: guest?.email,
          fullName: guest?.fullName,
          completedLessonNumbers: completedLessonNumbers(),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        authorizationUrl?: string;
        alreadyOwned?: boolean;
        certificateId?: string | null;
        free?: boolean;
      };
      if (!res.ok) throw new Error(json.error ?? "Checkout could not start.");
      if (json.alreadyOwned || json.free) {
        window.location.href = json.certificateId
          ? `/certificates/${json.certificateId}`
          : "/certificates";
        return;
      }
      if (!json.authorizationUrl) throw new Error("Checkout could not start.");
      window.location.href = json.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout could not start.");
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void startCheckout({ email: email.trim(), fullName: fullName.trim() });
  }

  return (
    <div className="mt-4 min-w-0">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto"
        >
          {isFree ? "Get My Certificate · Free" : "Get My Certificate"}
        </button>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-sm text-neutral-700">
            Certificate for <span className="font-medium">{title}</span>.
            {isFree
              ? " This certificate is free after you complete all lessons."
              : ` Certificate price ${formatNaira(priceNgn)} (or the matching USD regional amount) is set by the server — not by this form.`}
          </p>
          <p className="text-sm text-neutral-600">
            Course content was free. The certificate fee covers issuance and public verification.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
            <li>Your name on the certificate</li>
            <li>Learning path title and completion date</li>
            <li>Certificate number and public verification link</li>
          </ul>
          <label className="block text-sm font-medium text-neutral-800" htmlFor="cert-name">
            Full name
          </label>
          <input
            id="cert-name"
            name="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            className="h-11 w-full rounded-lg border border-app px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            autoComplete="name"
          />
          <label className="block text-sm font-medium text-neutral-800" htmlFor="cert-email">
            Email
          </label>
          <input
            id="cert-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 w-full rounded-lg border border-app px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            autoComplete="email"
          />
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
            >
              {loading
                ? isFree
                  ? "Issuing…"
                  : "Starting Paystack…"
                : isFree
                  ? "Claim free certificate"
                  : `Pay ${formatNaira(priceNgn)} with Paystack`}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-app px-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
