"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

type DigitalProduct = {
  id: string;
  title: string;
  description: string;
  price_ngn: number;
  price_usd: number;
  access_instructions: string;
  download_url: string | null;
  is_active: boolean;
};

const emptyForm = {
  title: "",
  description: "",
  priceNgn: "",
  priceUsd: "",
  accessInstructions: "",
  downloadUrl: "",
  isActive: true,
};

export function DigitalProductsPanel({
  initialProducts = [],
}: {
  initialProducts?: DigitalProduct[];
}) {
  const { toast } = useToast();
  const [products, setProducts] = useState<DigitalProduct[]>(initialProducts);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(initialProducts.length === 0);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/digital-products", { credentials: "include" });
      const json = (await res.json()) as { products?: DigitalProduct[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load products.");
      setProducts(json.products ?? []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (initialProducts.length === 0) void refresh();
  }, [initialProducts.length, refresh]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/digital-products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          priceNgn: Number(form.priceNgn || 0),
          priceUsd: Number(form.priceUsd || 0),
          accessInstructions: form.accessInstructions,
          downloadUrl: form.downloadUrl || null,
          isActive: form.isActive,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save product.");
      toast("Product saved.", "success");
      setForm(emptyForm);
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this digital product?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/digital-products", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed.");
      toast("Product deleted.", "success");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Add digital product"
          description="Downloads, templates, or other non-course products."
        />
        <form onSubmit={onSubmit} className="grid max-w-xl gap-3">
          <div>
            <Label htmlFor="dp-title">Title</Label>
            <Input
              id="dp-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              placeholder="Ad Creative Pack"
            />
          </div>
          <div>
            <Label htmlFor="dp-desc">Description</Label>
            <Textarea
              id="dp-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="dp-price-ngn">Price (₦)</Label>
              <Input
                id="dp-price-ngn"
                type="number"
                min={0}
                value={form.priceNgn}
                onChange={(e) => setForm((f) => ({ ...f, priceNgn: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="dp-price-usd">Price (USD)</Label>
              <Input
                id="dp-price-usd"
                type="number"
                min={0}
                step="0.01"
                value={form.priceUsd}
                onChange={(e) => setForm((f) => ({ ...f, priceUsd: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="dp-access">Access instructions</Label>
            <Textarea
              id="dp-access"
              rows={2}
              value={form.accessInstructions}
              onChange={(e) => setForm((f) => ({ ...f, accessInstructions: e.target.value }))}
              placeholder="Shown after purchase"
            />
          </div>
          <div>
            <Label htmlFor="dp-url">Download URL</Label>
            <Input
              id="dp-url"
              type="url"
              value={form.downloadUrl}
              onChange={(e) => setForm((f) => ({ ...f, downloadUrl: e.target.value }))}
              placeholder="https://…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save product"}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Digital products"
          description={loading ? "Loading…" : `${products.length} total`}
        />
        {products.length === 0 && !loading ? (
          <p className="text-sm text-muted">No digital products yet.</p>
        ) : (
          <ul className="space-y-3">
            {products.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-app p-3 text-sm"
              >
                <div>
                  <p className="font-semibold">{p.title}</p>
                  {p.description ? <p className="text-muted">{p.description}</p> : null}
                  <p className="mt-1 text-xs text-muted">
                    ₦{p.price_ngn.toLocaleString()}
                    {p.price_usd > 0 ? ` · $${Number(p.price_usd).toFixed(2)}` : ""}
                    {" · "}
                    {p.is_active ? "Active" : "Paused"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void onDelete(p.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
