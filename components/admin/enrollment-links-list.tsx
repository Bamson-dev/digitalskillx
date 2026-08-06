"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { EnrollmentLink, EnrollmentLinkStatus } from "@/types/database";

type LinkRow = EnrollmentLink & {
  enrollment_link_courses?: Array<{ course_id: string }>;
};

const STATUS_STYLE: Record<EnrollmentLinkStatus, string> = {
  draft: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  disabled: "bg-slate-100 text-slate-600",
  expired: "bg-orange-100 text-orange-800",
  deleted: "bg-red-100 text-red-700",
};

export function EnrollmentLinksList() {
  const router = useRouter();
  const { toast } = useToast();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [accessType, setAccessType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [menuId, setMenuId] = useState<string | null>(null);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (search.trim()) sp.set("search", search.trim());
    if (status !== "all") sp.set("status", status);
    if (accessType !== "all") sp.set("accessType", accessType);
    if (sort !== "newest") sp.set("sort", sort);
    return sp.toString();
  }, [search, status, accessType, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/enrollment-links?${query}`);
      const json = (await res.json()) as { links?: LinkRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setLinks(json.links ?? []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load links", "error");
    } finally {
      setLoading(false);
    }
  }, [query, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/enrollment-links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: string; url?: string };
    if (!res.ok) throw new Error(json.error ?? "Action failed");
    return json;
  }

  async function onAction(id: string, action: string) {
    setMenuId(null);
    try {
      if (action === "delete") {
        if (!confirm("Soft-delete this enrollment link?")) return;
        const res = await fetch(`/api/admin/enrollment-links/${id}`, { method: "DELETE" });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Delete failed");
        toast("Enrollment link deleted");
        await load();
        return;
      }
      if (action === "duplicate") {
        const json = await patch(id, { action: "duplicate" });
        toast("Link duplicated");
        if (json.url) {
          await navigator.clipboard.writeText(json.url);
          toast("New link URL copied", "info");
        }
        await load();
        return;
      }
      if (action === "enable" || action === "disable") {
        await patch(id, { action });
        toast(action === "enable" ? "Link enabled" : "Link disabled");
        await load();
        return;
      }
      if (action === "copy") {
        toast("Token is only shown once at create. Open the link detail to manage settings.", "info");
        return;
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed", "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Enrollment Links</h1>
          <p className="mt-1 text-sm text-muted">
            Create shareable invites that enroll students into one or more courses.
          </p>
        </div>
        <Link href="/admin/enrollment-links/new">
          <Button>
            <Plus className="h-4 w-4" /> Create link
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="disabled">Disabled</option>
          <option value="expired">Expired</option>
        </Select>
        <Select value={accessType} onChange={(e) => setAccessType(e.target.value)} className="w-44">
          <option value="all">All access</option>
          <option value="public">Public</option>
          <option value="imported_students">Imported students</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-44">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="most_redeemed">Most redeemed</option>
          <option value="expiring_soon">Expiring soon</option>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-app bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-app bg-surface-muted/40 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Access</th>
              <th className="px-4 py-3 font-medium">Courses</th>
              <th className="px-4 py-3 font-medium">Redemptions</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  Loading…
                </td>
              </tr>
            ) : links.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  No enrollment links yet.
                </td>
              </tr>
            ) : (
              links.map((link) => (
                <tr key={link.id} className="border-b border-app last:border-0 hover:bg-brand-50/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/enrollment-links/${link.id}`}
                      className="font-medium text-foreground hover:text-brand"
                    >
                      {link.name}
                    </Link>
                    <div className="text-xs text-muted">{link.token_prefix}…</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        STATUS_STYLE[link.status],
                      )}
                    >
                      {link.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {link.access_type.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3">
                    {link.enrollment_link_courses?.length ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    {link.current_redemptions}
                    {link.max_redemptions != null ? ` / ${link.max_redemptions}` : ""}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {link.expires_at
                      ? new Date(link.expires_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="relative px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-foreground"
                      onClick={() => setMenuId(menuId === link.id ? null : link.id)}
                      aria-label="Actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuId === link.id ? (
                      <div className="absolute right-4 z-10 mt-1 w-44 rounded-lg border border-app bg-white py-1 shadow-lg">
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left hover:bg-brand-50"
                          onClick={() => router.push(`/admin/enrollment-links/${link.id}`)}
                        >
                          View / Edit
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-brand-50"
                          onClick={() => void onAction(link.id, "copy")}
                        >
                          <Copy className="h-3.5 w-3.5" /> Copy tip
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left hover:bg-brand-50"
                          onClick={() => void onAction(link.id, "duplicate")}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left hover:bg-brand-50"
                          onClick={() =>
                            void onAction(
                              link.id,
                              link.status === "disabled" ? "enable" : "disable",
                            )
                          }
                        >
                          {link.status === "disabled" ? "Enable" : "Disable"}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                          onClick={() => void onAction(link.id, "delete")}
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
