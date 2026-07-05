"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import {
  CERTIFICATE_SHARE_PLATFORMS,
  certificateShareMessage,
  certificateShareUrl,
  type CertificateShareInput,
} from "@/lib/certificate-share";

type Props = CertificateShareInput;

export function CertificateShareButton({ verifyUrl, courseTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const input = { verifyUrl, courseTitle };

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleShareClick() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "My DigitalSkillX Certificate",
          text: certificateShareMessage(input),
          url: verifyUrl,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    setOpen((value) => !value);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(certificateShareMessage(input));
      setCopied(true);
      setOpen(false);
    } catch {
      window.prompt("Copy this link to share:", certificateShareMessage(input));
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => void handleShareClick()}
        className="inline-flex items-center gap-2 rounded-lg border border-app px-4 py-2 text-sm font-semibold transition-colors hover:bg-brand-50"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Share2 className="h-4 w-4" />
        Share
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-lg border border-app bg-white py-1 shadow-lg"
        >
          {CERTIFICATE_SHARE_PLATFORMS.map((platform) => (
            <a
              key={platform.id}
              role="menuitem"
              href={certificateShareUrl(platform.id, input)}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-foreground hover:bg-brand-50"
            >
              {platform.label}
            </a>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => void copyLink()}
            className="flex w-full items-center gap-2 border-t border-app px-4 py-2.5 text-left text-sm font-medium text-foreground hover:bg-brand-50"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
