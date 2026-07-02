import {
  DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  type CertificateTemplateKey,
} from "@/lib/certificate-templates";
import { CertificateGoldCharcoal } from "@/components/certificates/certificate-gold-charcoal";
import { CertificateGreenGold } from "@/components/certificates/certificate-green-gold";
import { CertificateNavyRibbon } from "@/components/certificates/certificate-navy-ribbon";
import type { CertificateRenderData } from "@/components/certificates/certificate-types";

export function CertificateRenderer({
  templateKey = DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  ...data
}: CertificateRenderData & { templateKey?: CertificateTemplateKey | null }) {
  const key = templateKey ?? DEFAULT_CERTIFICATE_TEMPLATE_KEY;

  switch (key) {
    case "navy_ribbon":
      return <CertificateNavyRibbon {...data} />;
    case "green_gold":
      return <CertificateGreenGold {...data} />;
    case "gold_charcoal":
    default:
      return <CertificateGoldCharcoal {...data} />;
  }
}
