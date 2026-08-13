"use client";

import { FormEvent, useState } from "react";
import { formatNaira } from "@/lib/currency";

export function LearnCertificateCheckout({
  pathId,
  title,
  priceNgn,
}: {
  pathId: string;
  title: string;
  priceNgn: number;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        authorizationUrl?: string;
        alreadyOwned?: boolean;
      };
      if (!res.ok) throw new Error(json.error ?? "Checkout could not start.");
      if (json.alreadyOwned) {
        window.location.href = "/certificates";
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
    <div className="mt-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Get certificate · {formatNaira(priceNgn)}
        </button>
      ) : (
        <form onSubmit={onSubmit} className="space-y-2">
          <p className="text-xs text-muted">
            Certificate for {title}. Price is set on the server. Lessons stay free.
          </p>
          <label className="block text-xs text-muted" htmlFor="cert-name">
            Full name
          </label>
          <input
            id="cert-name"
            name="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            className="h-10 w-full rounded-lg border border-app px-3 text-sm"
            autoComplete="name"
          />
          <label className="block text-xs text-muted" htmlFor="cert-email">
            Email
          </label>
          <input
            id="cert-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-10 w-full rounded-lg border border-app px-3 text-sm"
            autoComplete="email"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={loading}
              className="h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? "Starting checkout…" : "Continue to payment"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 rounded-lg border border-app px-4 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
