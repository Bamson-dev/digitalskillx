/** Built-in certificate template keys and display labels. */
export const CERTIFICATE_TEMPLATE_KEYS = [
  "gold_charcoal",
  "navy_ribbon",
  "green_gold",
] as const;

export type CertificateTemplateKey = (typeof CERTIFICATE_TEMPLATE_KEYS)[number];

export const DEFAULT_CERTIFICATE_TEMPLATE_KEY: CertificateTemplateKey = "gold_charcoal";

export const CERTIFICATE_TEMPLATE_LABELS: Record<CertificateTemplateKey, string> = {
  gold_charcoal: "Gold Charcoal",
  navy_ribbon: "Navy Ribbon",
  green_gold: "Green Gold",
};

export function isCertificateTemplateKey(value: string): value is CertificateTemplateKey {
  return (CERTIFICATE_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function normalizeCertificateTemplateKey(
  value: string | null | undefined,
): CertificateTemplateKey | null {
  if (!value) return null;
  return isCertificateTemplateKey(value) ? value : null;
}
