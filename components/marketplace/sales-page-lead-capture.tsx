"use client";

import { useState } from "react";
import {
  attributionToMetadata,
  captureSalesAttribution,
} from "@/lib/sales-attribution";
import { trackProductEvent } from "@/lib/product-analytics";

export function SalesPageLeadCaptureForm({
  courseId,
  salesPageId,
  title,
  body,
  buttonLabel,
  consentText,
}: {
  courseId: string;
  salesPageId?: string;
  title?: string;
  body?: string;
  buttonLabel?: string;
  consentText?: string;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);
    const attr = captureSalesAttribution({
      course_id: courseId,
      sales_page_id: salesPageId,
    });
    try {
      const res = await fetch(`/api/sales-pages/${courseId}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fullName,
          consent,
          salesPageId,
          attribution: attributionToMetadata(attr),
        }),
      });
      const json = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error ?? "Could not save your details.");
        return;
      }
      void trackProductEvent({
        event: "sales_page_lead_capture",
        courseId,
        metadata: attributionToMetadata(attr, { sales_page_id: salesPageId ?? null }),
      });
      setStatus("ok");
      setMessage("Thanks — we’ll be in touch.");
      setEmail("");
      setFullName("");
      setConsent(false);
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <section className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <h2 className="text-2xl font-bold text-neutral-900">{title || "Stay in the loop"}</h2>
      {body ? <p className="mt-2 text-neutral-600">{body}</p> : null}
      <form className="mt-6 space-y-3" onSubmit={(e) => void onSubmit(e)}>
        <label className="block text-sm">
          <span className="font-medium text-neutral-800">Name</span>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            autoComplete="name"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-neutral-800">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
            autoComplete="email"
          />
        </label>
        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
            required
          />
          <span>{consentText || "I agree to receive course information from DigitalSkillX."}</span>
        </label>
        <button
          type="submit"
          disabled={status === "loading"}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand font-semibold text-white hover:bg-brand-700 disabled:opacity-70"
        >
          {status === "loading" ? "Saving…" : buttonLabel || "Send me details"}
        </button>
        {message ? (
          <p className={`text-sm ${status === "error" ? "text-red-600" : "text-neutral-600"}`}>
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
