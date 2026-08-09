"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

type CatalogItem = { id: string; title: string };

type CommerceOfferType =
  | "standard"
  | "discount"
  | "bundle"
  | "upgrade"
  | "cross_sell"
  | "post_purchase";

type CommerceTargetType = "course" | "bundle" | "digital_product";

type CommerceOffer = {
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
  coupon_code: string | null;
};

const OFFER_TYPES: { value: CommerceOfferType; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "discount", label: "Discount" },
  { value: "bundle", label: "Bundle deal" },
  { value: "upgrade", label: "Upgrade" },
  { value: "cross_sell", label: "Cross-sell" },
  { value: "post_purchase", label: "After purchase" },
];

const TARGET_TYPES: { value: CommerceTargetType; label: string }[] = [
  { value: "course", label: "Course" },
  { value: "bundle", label: "Bundle" },
  { value: "digital_product", label: "Digital product" },
];

const emptyForm = {
  title: "",
  description: "",
  offerType: "standard" as CommerceOfferType,
  targetType: "course" as CommerceTargetType,
  targetId: "",
  priceNgn: "",
  originalPriceNgn: "",
  ctaText: "Buy now",
  isActive: true,
  couponCode: "",
};

export function CommerceOffersPanel({
  courses,
  bundles,
  digitalProducts,
  initialOffers = [],
}: {
  courses: CatalogItem[];
  bundles: CatalogItem[];
  digitalProducts: CatalogItem[];
  initialOffers?: CommerceOffer[];
}) {
  const { toast } = useToast();
  const [offers, setOffers] = useState<CommerceOffer[]>(initialOffers);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(initialOffers.length === 0);

  const targetOptions = useMemo(() => {
    if (form.targetType === "bundle") return bundles;
    if (form.targetType === "digital_product") return digitalProducts;
    return courses;
  }, [form.targetType, courses, bundles, digitalProducts]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/commerce-offers", { credentials: "include" });
      const json = (await res.json()) as { offers?: CommerceOffer[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load offers.");
      setOffers(json.offers ?? []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load offers.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (initialOffers.length === 0) void refresh();
  }, [initialOffers.length, refresh]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/commerce-offers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          offerType: form.offerType,
          targetType: form.targetType,
          targetId: form.targetId,
          priceNgn: Number(form.priceNgn || 0),
          originalPriceNgn: form.originalPriceNgn ? Number(form.originalPriceNgn) : null,
          ctaText: form.ctaText,
          isActive: form.isActive,
          couponCode: form.couponCode || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save offer.");
      toast("Offer saved.", "success");
      setForm(emptyForm);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save offer.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function patchOffer(id: string, action: "activate" | "deactivate" | "delete") {
    if (action === "delete" && !window.confirm("Delete this offer permanently?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/commerce-offers", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Action failed.");
      toast(
        action === "delete" ? "Offer deleted." : action === "activate" ? "Offer activated." : "Offer paused.",
        "success",
      );
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  function targetLabel(offer: CommerceOffer) {
    const list =
      offer.target_type === "bundle"
        ? bundles
        : offer.target_type === "digital_product"
          ? digitalProducts
          : courses;
    return list.find((i) => i.id === offer.target_id)?.title ?? offer.target_id;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Create offer"
          description="Price and CTA shown on sales or checkout surfaces. Product list comes from this page."
        />
        <form onSubmit={onSubmit} className="grid max-w-2xl gap-3">
          <div>
            <Label htmlFor="offer-title">Title</Label>
            <Input
              id="offer-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              placeholder="Summer discount — Facebook Ads"
            />
          </div>
          <div>
            <Label htmlFor="offer-desc">Description</Label>
            <Textarea
              id="offer-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="offer-type">Offer type</Label>
              <Select
                id="offer-type"
                value={form.offerType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, offerType: e.target.value as CommerceOfferType }))
                }
              >
                {OFFER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="target-type">Sells</Label>
              <Select
                id="target-type"
                value={form.targetType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    targetType: e.target.value as CommerceTargetType,
                    targetId: "",
                  }))
                }
              >
                {TARGET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="target-id">Product</Label>
            {targetOptions.length > 0 ? (
              <Select
                id="target-id"
                value={form.targetId}
                onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
                required
              >
                <option value="">Select…</option>
                {targetOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id="target-id"
                value={form.targetId}
                onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
                required
                placeholder="Product UUID"
              />
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="price-ngn">Price (₦)</Label>
              <Input
                id="price-ngn"
                type="number"
                min={1}
                required
                value={form.priceNgn}
                onChange={(e) => setForm((f) => ({ ...f, priceNgn: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="original-price">Compare-at price (₦)</Label>
              <Input
                id="original-price"
                type="number"
                min={0}
                value={form.originalPriceNgn}
                onChange={(e) => setForm((f) => ({ ...f, originalPriceNgn: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cta">Button text</Label>
              <Input
                id="cta"
                value={form.ctaText}
                onChange={(e) => setForm((f) => ({ ...f, ctaText: e.target.value }))}
                placeholder="Buy now"
              />
            </div>
            <div>
              <Label htmlFor="coupon">Coupon code</Label>
              <Input
                id="coupon"
                value={form.couponCode}
                onChange={(e) => setForm((f) => ({ ...f, couponCode: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active (visible when live)
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save offer"}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Offers" description={loading ? "Loading…" : `${offers.length} total`} />
        {offers.length === 0 && !loading ? (
          <p className="text-sm text-muted">No offers yet.</p>
        ) : (
          <ul className="space-y-3">
            {offers.map((offer) => (
              <li
                key={offer.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-app p-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{offer.title}</p>
                  <p className="text-muted">
                    {TARGET_TYPES.find((t) => t.value === offer.target_type)?.label ?? offer.target_type}
                    {" · "}
                    {targetLabel(offer)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    ₦{offer.price_ngn.toLocaleString()}
                    {offer.original_price_ngn != null
                      ? ` (was ₦${offer.original_price_ngn.toLocaleString()})`
                      : ""}
                    {" · "}
                    {offer.is_active ? "Active" : "Paused"}
                    {offer.coupon_code ? ` · Coupon ${offer.coupon_code}` : ""}
                    {" · "}
                    {offer.cta_text}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {offer.is_active ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void patchOffer(offer.id, "deactivate")}
                    >
                      Pause
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void patchOffer(offer.id, "activate")}
                    >
                      Activate
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => void patchOffer(offer.id, "delete")}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
