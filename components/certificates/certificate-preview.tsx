"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  type CertificateTemplateKey,
} from "@/lib/certificate-templates";
import { CertificateRenderer } from "@/components/certificates/certificate-renderer";
import { SAMPLE_CERTIFICATE_DATA } from "@/components/certificates/certificate-types";
import { cn } from "@/lib/utils";

const SAMPLE_VERIFY_URL = "https://digitalskillx.com/verify/PDG-SAMPLE01";

/** Fixed design canvas width — previews scale down to fit their container. */
export const CERTIFICATE_DESIGN_WIDTH = 840;

export function CertificatePreview({
  templateKey = DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  compact = false,
  className,
}: {
  templateKey?: CertificateTemplateKey | null;
  compact?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.35);
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(SAMPLE_VERIFY_URL, { margin: 1, width: 240 })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl("");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(width / CERTIFICATE_DESIGN_WIDTH);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative isolate w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 shadow-sm",
        compact ? "mx-auto max-w-[280px]" : "max-w-2xl",
        className,
      )}
      style={{ aspectRatio: "1.414 / 1" }}
    >
      {!qrDataUrl ? (
        <div className="absolute inset-0 animate-pulse bg-neutral-200/60" aria-hidden />
      ) : (
        <div
          className="pointer-events-none absolute left-0 top-0 select-none"
          style={{
            width: CERTIFICATE_DESIGN_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          aria-hidden={compact}
        >
          <CertificateRenderer
            templateKey={templateKey ?? DEFAULT_CERTIFICATE_TEMPLATE_KEY}
            {...SAMPLE_CERTIFICATE_DATA}
            qrDataUrl={qrDataUrl}
          />
        </div>
      )}
    </div>
  );
}
