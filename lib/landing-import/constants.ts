/** Stage 11 URL landing-page importer limits and constants. */

export const LANDING_IMPORT_LIMITS = {
  maxHtmlBytes: 2 * 1024 * 1024,
  maxCssBytes: 512 * 1024,
  maxAssetBytes: 8 * 1024 * 1024,
  maxTotalAssetBytes: 40 * 1024 * 1024,
  maxAssets: 60,
  maxRedirects: 3,
  fetchTimeoutMs: 25_000,
  maxStylesheets: 12,
} as const;

export const LANDING_IMPORT_USER_AGENT = "DigitalSkillX-LandingImporter/1.0";

export type LandingDestinationType =
  | "course_checkout"
  | "product_checkout"
  | "offer"
  | "internal_url";

export type LandingPageStatus =
  | "importing"
  | "imported"
  | "review"
  | "published"
  | "failed"
  | "archived";

export type CtaDetectionKind = "conversion" | "navigation" | "unknown";

export type DetectedCta = {
  id: string;
  kind: CtaDetectionKind;
  text: string;
  originalHref: string;
  rewrite: boolean;
  mappedHref: string | null;
};

export type LandingImportReport = {
  title: string;
  assetsDetected: number;
  assetsImported: number;
  assetsSkipped: number;
  assetsBlocked: number;
  assetsFailed: number;
  stylesheetsInlined: number;
  ctasDetected: number;
  ctasMarkedConversion: number;
  warnings: string[];
  blocked: string[];
  unsupported: string[];
};
