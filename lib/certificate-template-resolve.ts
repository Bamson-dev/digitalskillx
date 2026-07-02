import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_CERTIFICATE_TEMPLATE_KEY,
  type CertificateTemplateKey,
  normalizeCertificateTemplateKey,
} from "@/lib/certificate-templates";

/**
 * Resolve which template to use when issuing a certificate:
 * 1. course.certificate_template_override
 * 2. course category's template_key
 * 3. platform_settings.default_certificate_template_key (fallback: gold_charcoal)
 */
export async function resolveCertificateTemplateKey(
  supabase: SupabaseClient,
  courseId: string,
): Promise<CertificateTemplateKey> {
  const { data: course } = await supabase
    .from("courses")
    .select("certificate_template_override, category_id")
    .eq("id", courseId)
    .maybeSingle();

  const override = normalizeCertificateTemplateKey(course?.certificate_template_override);
  if (override) return override;

  if (course?.category_id) {
    const { data: category } = await supabase
      .from("course_categories")
      .select("template_key")
      .eq("id", course.category_id)
      .maybeSingle();

    const categoryKey = normalizeCertificateTemplateKey(category?.template_key);
    if (categoryKey) return categoryKey;
  }

  const { data: settings } = await supabase
    .from("platform_settings")
    .select("default_certificate_template_key")
    .eq("id", "default")
    .maybeSingle();

  return (
    normalizeCertificateTemplateKey(settings?.default_certificate_template_key) ??
    DEFAULT_CERTIFICATE_TEMPLATE_KEY
  );
}
