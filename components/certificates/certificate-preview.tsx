"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  type CertificateTemplateKey,
} from "@/lib/certificate-templates";
import { CertificateRenderer } from "@/components/certificates/certificate-renderer";
import { SAMPLE_CERTIFICATE_DATA } from "@/components/certificates/certificate-types";

const SAMPLE_VERIFY_URL = "https://digitalskillx.com/verify/PDG-SAMPLE01";

export function CertificatePreview({
  templateKey = DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  compact = false,
}: {
  templateKey?: CertificateTemplateKey | null;
  compact?: boolean;
}) {
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

  if (!qrDataUrl) {
    return (
      <div
        className="rounded-lg border border-dashed border-app bg-surface-muted/40"
        style={{ aspectRatio: "1.414 / 1", maxWidth: compact ? "20rem" : "100%" }}
      />
    );
  }

  return (
    <div className={compact ? "mx-auto max-w-xs" : "w-full"}>
      <CertificateRenderer
        templateKey={templateKey ?? DEFAULT_CERTIFICATE_TEMPLATE_KEY}
        {...SAMPLE_CERTIFICATE_DATA}
        qrDataUrl={qrDataUrl}
      />
    </div>
  );
}
