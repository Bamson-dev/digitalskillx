"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  recallEnrollmentLinkUrl,
  rememberEnrollmentLinkUrl,
} from "@/lib/enrollment-links/client-url-cache";
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
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
      setSelectedIds(new Set());
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load links", "error");
    } finally {
      setLoading(false);
    }
  }, [query, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!menuId) return;
    function onDocPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-enrollment-link-menu]")) return;
      setMenuId(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuId(null);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  const visibleIds = useMemo(() => links.map((link) => link.id), [links]);
  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selectedIds.has(id)) && !allVisibleSelected;

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/enrollment-links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      error?: string;
      url?: string;
      link?: { id: string };
    };
    if (!res.ok) throw new Error(json.error ?? "Action failed");
    return json;
  }

  async function onBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} enrollment link${ids.length === 1 ? "" : "s"}? This cannot be undone from the list.`,
      )
    ) {
      return;
    }

    setBulkDeleting(true);
    try {
      const res = await fetch("/api/admin/enrollment-links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = (await res.json()) as { error?: string; deleted?: number };
      if (!res.ok) throw new Error(json.error ?? "Bulk delete failed");
      toast(
        `Deleted ${json.deleted ?? ids.length} enrollment link${(json.deleted ?? ids.length) === 1 ? "" : "s"}`,
      );
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Bulk delete failed", "error");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function onAction(id: string, action: string) {
    setMenuId(null);
    setMenuPos(null);
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
          if (json.link?.id) rememberEnrollmentLinkUrl(json.link.id, json.url);
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
        const cached = recallEnrollmentLinkUrl(id);
        if (cached) {
          await navigator.clipboard.writeText(cached);
          toast("Enrollment link copied");
          return;
        }
        const ok = confirm(
          "The full invite URL was only shown when this link was created.\n\nGenerate a new URL and copy it? The previous URL will stop working for new enrollments.",
        );
        if (!ok) return;
        const json = await patch(id, { action: "regenerate_token" });
        if (!json.url) throw new Error("Could not generate invite URL.");
        rememberEnrollmentLinkUrl(id, json.url);
        await navigator.clipboard.writeText(json.url);
        toast("New enrollment link copied");
        await load();
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

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="text-sm text-red-900">
            <span className="font-semibold">{selectedCount}</span> selected
            {allVisibleSelected && visibleIds.length > 0
              ? ` (all ${visibleIds.length} shown)`
              : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={clearSelection} disabled={bulkDeleting}>
              Clear selection
            </Button>
            {!allVisibleSelected && visibleIds.length > 0 ? (
              <Button type="button" variant="outline" onClick={toggleSelectAllVisible} disabled={bulkDeleting}>
                Select all shown ({visibleIds.length})
              </Button>
            ) : null}
            <Button
              type="button"
              variant="danger"
              onClick={() => void onBulkDelete()}
              disabled={bulkDeleting}
            >
              <Trash2 className="h-4 w-4" />
              {bulkDeleting ? "Deleting…" : `Delete selected (${selectedCount})`}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-app bg-white">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-app bg-surface-muted/40 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleSelectAllVisible}
                  disabled={loading || visibleIds.length === 0}
                  aria-label="Select all enrollment links shown"
                />
              </th>
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
                <td colSpan={8} className="px-4 py-10 text-center text-muted">
                  Loading…
                </td>
              </tr>
            ) : links.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted">
                  No enrollment links yet.
                </td>
              </tr>
            ) : (
              links.map((link) => {
                const selected = selectedIds.has(link.id);
                return (
                  <tr
                    key={link.id}
                    className={cn(
                      "border-b border-app last:border-0 hover:bg-brand-50/40",
                      selected && "bg-brand-50/60",
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                        checked={selected}
                        onChange={() => toggleOne(link.id)}
                        aria-label={`Select ${link.name}`}
                      />
                    </td>
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
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        data-enrollment-link-menu
                        className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuId === link.id) {
                            setMenuId(null);
                            setMenuPos(null);
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuPos({
                            top: rect.top - 8,
                            left: Math.max(8, rect.right - 176),
                          });
                          setMenuId(link.id);
                        }}
                        aria-expanded={menuId === link.id}
                        aria-haspopup="menu"
                        aria-label="Actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuId === link.id && menuPos ? (
                        <div
                          role="menu"
                          data-enrollment-link-menu
                          className="fixed z-[80] w-44 rounded-lg border border-app bg-white py-1 shadow-lg"
                          style={{
                            top: menuPos.top,
                            left: menuPos.left,
                            transform: "translateY(-100%)",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="block w-full px-3 py-2 text-left hover:bg-brand-50"
                            onClick={() => {
                              setMenuId(null);
                              setMenuPos(null);
                              router.push(`/admin/enrollment-links/${link.id}`);
                            }}
                          >
                            View / Edit
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-brand-50"
                            onClick={() => void onAction(link.id, "copy")}
                          >
                            <Copy className="h-3.5 w-3.5" /> Copy link
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="block w-full px-3 py-2 text-left hover:bg-brand-50"
                            onClick={() => void onAction(link.id, "duplicate")}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            role="menuitem"
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
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
                            onClick={() => void onAction(link.id, "delete")}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
