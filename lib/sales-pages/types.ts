export type SalesPageStatus = "draft" | "published" | "unpublished";

export type SalesPageSectionType =
  | "hero"
  | "text"
  | "image"
  | "video"
  | "benefits"
  | "features"
  | "learning_outcomes"
  | "testimonials"
  | "bonuses"
  | "pricing"
  | "faq"
  | "instructor"
  | "curriculum"
  | "guarantee"
  | "cta"
  | "countdown"
  | "custom_html"
  | "unsupported";

export type SalesPageCtaSection = {
  id: string;
  type: "cta";
  label: string;
  /** Always DigitalSkillX-native — never an external payment URL. */
  behavior: "purchase";
};

export type SalesPageSection =
  | {
      id: string;
      type: "hero";
      headline?: string;
      subheadline?: string;
      imageAssetId?: string | null;
      ctaLabel?: string;
    }
  | { id: string; type: "text"; title?: string; body?: string }
  | { id: string; type: "image"; assetId?: string | null; alt?: string }
  | { id: string; type: "video"; url?: string; provider?: "youtube" | "vimeo" | "unknown" }
  | {
      id: string;
      type: "benefits" | "features" | "bonuses";
      title?: string;
      items: Array<{ title?: string; body?: string; imageAssetId?: string | null }>;
    }
  | { id: string; type: "learning_outcomes" | "pricing" | "instructor" | "curriculum" }
  | {
      id: string;
      type: "testimonials";
      title?: string;
      items: Array<{
        name?: string;
        role?: string;
        quote?: string;
        rating?: number;
        photoAssetId?: string | null;
      }>;
    }
  | {
      id: string;
      type: "faq";
      title?: string;
      items: Array<{ question: string; answer: string }>;
    }
  | { id: string; type: "guarantee"; title?: string; body?: string }
  | SalesPageCtaSection
  | { id: string; type: "countdown"; endsAt?: string; label?: string }
  | { id: string; type: "custom_html"; html: string; advanced: true }
  | {
      id: string;
      type: "unsupported";
      reason: string;
      sourceHint?: string;
    };

export type SalesPageSchema = {
  version: 1;
  sections: SalesPageSection[];
  settings: {
    theme?: string;
    showDynamicPrice?: boolean;
  };
};

export type SalesPageSeo = {
  title?: string;
  description?: string;
  ogImageAssetId?: string;
};

export type SalesPageRow = {
  id: string;
  course_id: string;
  title: string;
  status: SalesPageStatus;
  draft_schema: SalesPageSchema;
  published_schema: SalesPageSchema | null;
  draft_version: number;
  published_version: number;
  seo: SalesPageSeo;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type SalesPageAssetRow = {
  id: string;
  sales_page_id: string;
  course_id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  storage_provider: string;
  storage_path: string;
  public_url: string | null;
  checksum: string | null;
  source_url: string | null;
  status: "active" | "missing" | "failed" | "deleted";
  created_at: string;
  updated_at: string;
};

export type ImportReport = {
  courseId: string;
  courseTitle?: string;
  sourceType: "json" | "zip";
  sourceFormat: string;
  sectionsDetected: number;
  sectionsImported: number;
  assetsDetected: number;
  assetsImported: number;
  assetsFailed: number;
  missingAssets: Array<{ url?: string; reason: string }>;
  unsupportedElements: Array<{ type?: string; reason: string }>;
  ctaDetected: number;
  ctaConverted: number;
  videosDetected: number;
  testimonialsDetected: number;
  status: "ready_for_review" | "failed" | "needs_attention";
  errors: string[];
  warnings: string[];
};

export function emptySalesPageSchema(): SalesPageSchema {
  return {
    version: 1,
    sections: [],
    settings: { showDynamicPrice: true },
  };
}
