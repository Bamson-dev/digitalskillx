/**
 * Sales Page schema (Phase 1 + Phase 2).
 * Conversion layer only — checkout/enrollment remain elsewhere.
 * Today: course_id owner. Future products can extend ownership without a second checkout.
 */

export type SalesPageStatus = "draft" | "published" | "unpublished";

export type SalesPageSectionType =
  | "hero"
  | "intro"
  | "problem"
  | "text"
  | "image"
  | "image_text"
  | "video"
  | "benefits"
  | "features"
  | "learning_outcomes"
  | "testimonials"
  | "testimonial_grid"
  | "proof"
  | "social_proof"
  | "bonuses"
  | "pricing"
  | "faq"
  | "instructor"
  | "curriculum"
  | "course_preview"
  | "comparison"
  | "guarantee"
  | "cta"
  | "countdown"
  | "spacer"
  | "lead_capture"
  | "custom_html"
  | "unsupported";

export type SalesPageSectionBase = {
  id: string;
  /** When true, section is kept in draft but not shown publicly. */
  hidden?: boolean;
};

export type SalesPageCtaSection = SalesPageSectionBase & {
  type: "cta";
  label: string;
  /** Always DigitalSkillX-native — never an external payment URL. */
  behavior: "purchase";
};

export type TestimonialItem = {
  name?: string;
  role?: string;
  quote?: string;
  rating?: number;
  photoAssetId?: string | null;
  result?: string;
  company?: string;
  location?: string;
};

export type SalesPageSection =
  | (SalesPageSectionBase & {
      type: "hero";
      headline?: string;
      subheadline?: string;
      eyebrow?: string;
      imageAssetId?: string | null;
      ctaLabel?: string;
      secondaryCtaLabel?: string;
      badge?: string;
      trustText?: string;
      mediaType?: "image" | "video" | "none";
      videoUrl?: string;
      alignment?: "left" | "center";
      background?: string;
    })
  | (SalesPageSectionBase & { type: "intro" | "problem" | "text"; title?: string; body?: string })
  | (SalesPageSectionBase & { type: "image"; assetId?: string | null; alt?: string })
  | (SalesPageSectionBase & {
      type: "image_text";
      title?: string;
      body?: string;
      assetId?: string | null;
      imagePosition?: "left" | "right";
    })
  | (SalesPageSectionBase & {
      type: "video";
      url?: string;
      provider?: "youtube" | "vimeo" | "unknown";
    })
  | (SalesPageSectionBase & {
      type: "benefits" | "features" | "bonuses";
      title?: string;
      items: Array<{ title?: string; body?: string; imageAssetId?: string | null }>;
    })
  | (SalesPageSectionBase & {
      type: "learning_outcomes" | "pricing" | "instructor" | "curriculum" | "course_preview";
      /** Pricing labels only — amounts always come from the course row. */
      discountLabel?: string;
      paymentDescription?: string;
      originalPriceLabel?: string;
    })
  | (SalesPageSectionBase & {
      type: "testimonials" | "testimonial_grid";
      title?: string;
      items: TestimonialItem[];
    })
  | (SalesPageSectionBase & {
      type: "proof" | "social_proof";
      title?: string;
      items: Array<{ title?: string; body?: string; value?: string }>;
    })
  | (SalesPageSectionBase & {
      type: "faq";
      title?: string;
      items: Array<{ question: string; answer: string }>;
    })
  | (SalesPageSectionBase & {
      type: "comparison";
      title?: string;
      columns?: string[];
      rows?: Array<{ feature: string; values: string[] }>;
    })
  | (SalesPageSectionBase & { type: "guarantee"; title?: string; body?: string })
  | SalesPageCtaSection
  | (SalesPageSectionBase & { type: "countdown"; endsAt?: string; label?: string })
  | (SalesPageSectionBase & { type: "spacer"; size?: "sm" | "md" | "lg" })
  | (SalesPageSectionBase & {
      type: "lead_capture";
      title?: string;
      body?: string;
      buttonLabel?: string;
      consentText?: string;
    })
  | (SalesPageSectionBase & { type: "custom_html"; html: string; advanced: true })
  | (SalesPageSectionBase & {
      type: "unsupported";
      reason: string;
      sourceHint?: string;
    });

/** Presentation offer — checkout price always comes from the course row. */
export type SalesPageOffer = {
  headline?: string;
  description?: string;
  urgencyMessage?: string;
  guarantee?: string;
  ctaLabel?: string;
  status?: "draft" | "active" | "paused";
  bonuses?: Array<{ title?: string; body?: string }>;
};

export type SalesPageSchema = {
  version: 1;
  sections: SalesPageSection[];
  settings: {
    theme?: string;
    showDynamicPrice?: boolean;
    defaultAlignment?: "left" | "center";
    /** Offer copy only — never overrides course price at checkout. */
    offer?: SalesPageOffer;
  };
};

export type SalesPageSeo = {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageAssetId?: string;
  robots?: "index" | "noindex";
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

export type SalesPageVersionRow = {
  id: string;
  sales_page_id: string;
  course_id: string;
  version: number;
  schema: SalesPageSchema;
  seo: SalesPageSeo;
  created_at: string;
  created_by: string | null;
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

export type PublishValidationIssue = {
  code: string;
  message: string;
};

export function emptySalesPageSchema(): SalesPageSchema {
  return {
    version: 1,
    sections: [],
    settings: { showDynamicPrice: true },
  };
}

/** Controlled section library for the admin builder (Phase 2). */
export const SECTION_LIBRARY: Array<{
  type: SalesPageSectionType;
  label: string;
  description: string;
}> = [
  { type: "hero", label: "Hero", description: "Headline, media, and primary CTA" },
  { type: "intro", label: "Course introduction", description: "Opening narrative" },
  { type: "problem", label: "Problem / pain points", description: "Audience challenges" },
  { type: "benefits", label: "Benefits", description: "Outcome-focused list" },
  { type: "learning_outcomes", label: "Learning outcomes", description: "From course data" },
  { type: "features", label: "Features", description: "What is included" },
  { type: "curriculum", label: "Curriculum preview", description: "From course modules" },
  { type: "instructor", label: "Instructor", description: "From course instructor fields" },
  { type: "testimonials", label: "Testimonials", description: "Student quotes" },
  { type: "testimonial_grid", label: "Testimonial grid", description: "Multi-column quotes" },
  { type: "proof", label: "Results / proof", description: "Outcomes and evidence" },
  { type: "social_proof", label: "Social proof", description: "Stats and trust signals" },
  { type: "pricing", label: "Pricing", description: "Uses live course price" },
  { type: "guarantee", label: "Guarantee", description: "Risk reversal copy" },
  { type: "faq", label: "FAQ", description: "Questions and answers" },
  { type: "cta", label: "CTA", description: "DigitalSkillX checkout button" },
  { type: "countdown", label: "Countdown", description: "Deadline urgency" },
  { type: "image_text", label: "Image + text", description: "Split content block" },
  { type: "video", label: "Video", description: "YouTube or Vimeo" },
  { type: "course_preview", label: "Course preview", description: "Curriculum teaser" },
  { type: "comparison", label: "Comparison table", description: "Feature comparison" },
  { type: "bonuses", label: "Bonuses", description: "Bonus stack" },
  { type: "lead_capture", label: "Lead capture", description: "Email + consent form" },
  { type: "custom_html", label: "Custom HTML", description: "Sanitized markup only" },
  { type: "spacer", label: "Spacer / divider", description: "Vertical spacing" },
  { type: "text", label: "Text", description: "Simple text block" },
  { type: "image", label: "Image", description: "Full-width image" },
];
