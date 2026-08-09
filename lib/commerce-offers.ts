import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/schema-guard";
import {
  bundleProvidesNewValue,
  studentOwnsCourse,
  studentOwnsDigitalProduct,
} from "@/lib/commerce-ownership";

export type CommerceOfferType =
  | "standard"
  | "discount"
  | "bundle"
  | "upgrade"
  | "cross_sell"
  | "post_purchase";

export type CommerceTargetType = "course" | "bundle" | "digital_product";

export type CommerceOffer = {
  id: string;
  title: string;
  description: string;
  offer_type: CommerceOfferType;
  target_type: CommerceTargetType;
  target_id: string;
  price_ngn: number;
  original_price_ngn: number | null;
  cta_text: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  sales_page_course_id: string | null;
  coupon_code: string | null;
  related_course_ids?: string[];
};

function isOfferLive(offer: CommerceOffer, now = new Date()): boolean {
  if (!offer.is_active) return false;
  if (offer.starts_at && new Date(offer.starts_at) > now) return false;
  if (offer.ends_at && new Date(offer.ends_at) < now) return false;
  return true;
}

export async function listCommerceOffers(
  admin: SupabaseClient,
  filters?: { activeOnly?: boolean; salesPageCourseId?: string },
): Promise<CommerceOffer[]> {
  let q = admin
    .from("commerce_offers")
    .select(
      "id, title, description, offer_type, target_type, target_id, price_ngn, original_price_ngn, cta_text, is_active, starts_at, ends_at, sort_order, sales_page_course_id, coupon_code",
    )
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (filters?.activeOnly) q = q.eq("is_active", true);
  if (filters?.salesPageCourseId) {
    q = q.eq("sales_page_course_id", filters.salesPageCourseId);
  }

  const { data, error } = await q;
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as CommerceOffer[];
}

export async function getCommerceOfferById(
  admin: SupabaseClient,
  offerId: string,
): Promise<CommerceOffer | null> {
  const { data, error } = await admin
    .from("commerce_offers")
    .select(
      "id, title, description, offer_type, target_type, target_id, price_ngn, original_price_ngn, cta_text, is_active, starts_at, ends_at, sort_order, sales_page_course_id, coupon_code",
    )
    .eq("id", offerId)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  const { data: related } = await admin
    .from("commerce_offer_related")
    .select("related_course_id, sort_order")
    .eq("offer_id", offerId)
    .order("sort_order", { ascending: true });

  return {
    ...(data as CommerceOffer),
    related_course_ids: (related ?? []).map((r) => r.related_course_id),
  };
}

/** Resolve a purchasable live offer; never trust client price. */
export async function resolveLiveOfferForCheckout(
  admin: SupabaseClient,
  offerId: string,
  opts?: { couponCode?: string | null; studentId?: string | null },
): Promise<
  | {
      ok: true;
      offer: CommerceOffer;
      chargeNgn: number;
      courseIds: string[];
      digitalProductId: string | null;
      bundleId: string | null;
      primaryCourseId: string | null;
    }
  | { ok: false; error: string }
> {
  const offer = await getCommerceOfferById(admin, offerId);
  if (!offer || !isOfferLive(offer)) {
    return { ok: false, error: "This offer is not available." };
  }

  if (offer.coupon_code?.trim()) {
    const provided = (opts?.couponCode ?? "").trim().toLowerCase();
    if (provided !== offer.coupon_code.trim().toLowerCase()) {
      return { ok: false, error: "Enter a valid coupon code for this offer." };
    }
  }

  if (offer.price_ngn <= 0) {
    return { ok: false, error: "Offer price is not set." };
  }

  let courseIds: string[] = [];
  let digitalProductId: string | null = null;
  let bundleId: string | null = null;
  let primaryCourseId: string | null = null;

  if (offer.target_type === "course") {
    primaryCourseId = offer.target_id;
    courseIds = [offer.target_id];
    if (opts?.studentId && (await studentOwnsCourse(admin, opts.studentId, offer.target_id))) {
      return { ok: false, error: "You already have access to this course." };
    }
  } else if (offer.target_type === "bundle") {
    bundleId = offer.target_id;
    const { data: items, error } = await admin
      .from("course_bundle_items")
      .select("course_id, sort_order")
      .eq("bundle_id", offer.target_id)
      .order("sort_order", { ascending: true });
    if (error) return { ok: false, error: error.message };
    courseIds = (items ?? []).map((i) => i.course_id);
    primaryCourseId = courseIds[0] ?? null;
    if (!courseIds.length) return { ok: false, error: "Bundle has no courses." };
    if (opts?.studentId) {
      const hasValue = await bundleProvidesNewValue(admin, opts.studentId, courseIds);
      if (!hasValue) {
        return { ok: false, error: "You already own every course in this bundle." };
      }
    }
  } else {
    digitalProductId = offer.target_id;
    const { data: product } = await admin
      .from("digital_products")
      .select("id, is_active")
      .eq("id", offer.target_id)
      .maybeSingle();
    if (!product?.is_active) {
      return { ok: false, error: "Digital product is not available." };
    }
    if (
      opts?.studentId &&
      (await studentOwnsDigitalProduct(admin, opts.studentId, offer.target_id))
    ) {
      return { ok: false, error: "You already own this digital product." };
    }
  }

  return {
    ok: true,
    offer,
    chargeNgn: offer.price_ngn,
    courseIds,
    digitalProductId,
    bundleId,
    primaryCourseId,
  };
}

export async function saveCommerceOffer(
  admin: SupabaseClient,
  input: {
    id?: string;
    title: string;
    description?: string;
    offerType: CommerceOfferType;
    targetType: CommerceTargetType;
    targetId: string;
    priceNgn: number;
    originalPriceNgn?: number | null;
    ctaText?: string;
    isActive?: boolean;
    startsAt?: string | null;
    endsAt?: string | null;
    sortOrder?: number;
    salesPageCourseId?: string | null;
    couponCode?: string | null;
    relatedCourseIds?: string[];
    createdBy?: string | null;
  },
): Promise<string> {
  const title = input.title.trim();
  if (title.length < 2) throw new Error("Offer title is required.");
  if (!input.targetId) throw new Error("Select a product for this offer.");
  const price = Math.max(0, Math.round(input.priceNgn));
  if (price <= 0) throw new Error("Offer price must be greater than zero.");

  const row = {
    title: title.slice(0, 200),
    description: (input.description ?? "").trim().slice(0, 4000),
    offer_type: input.offerType,
    target_type: input.targetType,
    target_id: input.targetId,
    price_ngn: price,
    original_price_ngn:
      input.originalPriceNgn != null ? Math.max(0, Math.round(input.originalPriceNgn)) : null,
    cta_text: (input.ctaText ?? "Buy now").trim().slice(0, 80) || "Buy now",
    is_active: input.isActive !== false,
    starts_at: input.startsAt ?? null,
    ends_at: input.endsAt ?? null,
    sort_order: input.sortOrder ?? 0,
    sales_page_course_id: input.salesPageCourseId ?? null,
    coupon_code: input.couponCode?.trim().slice(0, 64) || null,
    updated_at: new Date().toISOString(),
  };

  let offerId = input.id;
  if (offerId) {
    const { error } = await admin.from("commerce_offers").update(row).eq("id", offerId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await admin
      .from("commerce_offers")
      .insert({ ...row, created_by: input.createdBy ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    offerId = data.id;
  }

  await admin.from("commerce_offer_related").delete().eq("offer_id", offerId);
  const related = [...new Set((input.relatedCourseIds ?? []).filter(Boolean))];
  if (related.length) {
    const { error } = await admin.from("commerce_offer_related").insert(
      related.map((related_course_id, sort_order) => ({
        offer_id: offerId!,
        related_course_id,
        sort_order,
      })),
    );
    if (error) throw new Error(error.message);
  }

  return offerId!;
}

export async function setCommerceOfferActive(
  admin: SupabaseClient,
  offerId: string,
  active: boolean,
) {
  const { error } = await admin
    .from("commerce_offers")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", offerId);
  if (error) throw new Error(error.message);
}

export async function deleteCommerceOffer(admin: SupabaseClient, offerId: string) {
  const { error } = await admin.from("commerce_offers").delete().eq("id", offerId);
  if (error) throw new Error(error.message);
}
