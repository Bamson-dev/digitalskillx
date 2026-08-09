import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { logAudit } from "@/lib/audit";
import {
  deleteCommerceOffer,
  listCommerceOffers,
  saveCommerceOffer,
  setCommerceOfferActive,
  type CommerceOfferType,
  type CommerceTargetType,
} from "@/lib/commerce-offers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-commerce-offers", 120);
  if (limited) return limited;

  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  const sp = request.nextUrl.searchParams;
  try {
    const offers = await listCommerceOffers(auth.admin, {
      activeOnly: sp.get("activeOnly") === "1",
      salesPageCourseId: sp.get("salesPageCourseId") ?? undefined,
    });
    return NextResponse.json({ offers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list offers." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-commerce-offers-save", 30);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: {
    id?: string;
    title?: string;
    description?: string;
    offerType?: CommerceOfferType;
    targetType?: CommerceTargetType;
    targetId?: string;
    priceNgn?: number;
    originalPriceNgn?: number | null;
    ctaText?: string;
    isActive?: boolean;
    startsAt?: string | null;
    endsAt?: string | null;
    sortOrder?: number;
    salesPageCourseId?: string | null;
    couponCode?: string | null;
    relatedCourseIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const offerId = await saveCommerceOffer(auth.admin, {
      id: body.id,
      title: String(body.title ?? ""),
      description: body.description,
      offerType: body.offerType ?? "standard",
      targetType: body.targetType ?? "course",
      targetId: String(body.targetId ?? ""),
      priceNgn: Number(body.priceNgn ?? 0),
      originalPriceNgn: body.originalPriceNgn ?? null,
      ctaText: body.ctaText,
      isActive: body.isActive,
      startsAt: body.startsAt ?? null,
      endsAt: body.endsAt ?? null,
      sortOrder: body.sortOrder,
      salesPageCourseId: body.salesPageCourseId ?? null,
      couponCode: body.couponCode ?? null,
      relatedCourseIds: body.relatedCourseIds,
      createdBy: auth.user.id,
    });

    await logAudit({
      action: body.id ? "commerce_offer_updated" : "commerce_offer_created",
      targetType: "commerce_offer",
      targetId: offerId,
      metadata: { title: body.title },
    });

    return NextResponse.json({ ok: true, id: offerId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save offer." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-commerce-offers-patch", 60);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: { id?: string; action?: "activate" | "deactivate" | "delete" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Offer id is required." }, { status: 400 });
  }

  try {
    if (body.action === "activate" || body.action === "deactivate") {
      await setCommerceOfferActive(auth.admin, id, body.action === "activate");
      await logAudit({
        action: body.action === "activate" ? "commerce_offer_activated" : "commerce_offer_deactivated",
        targetType: "commerce_offer",
        targetId: id,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      await deleteCommerceOffer(auth.admin, id);
      await logAudit({
        action: "commerce_offer_deleted",
        targetType: "commerce_offer",
        targetId: id,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed." },
      { status: 400 },
    );
  }
}
