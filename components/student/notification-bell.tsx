"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

type Notification = {
  id: string;
  title: string | null;
  message: string;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("id, title, message, link_url, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems(data ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = items.filter((i) => !i.is_read).length;

  async function markAllRead() {
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-muted hover:bg-brand-50"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-app bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-app px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 ? (
              <button onClick={markAllRead} className="text-xs font-medium text-brand hover:underline">
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">You&apos;re all caught up.</p>
            ) : (
              items.map((n) => {
                const inner = (
                  <div className={`px-3 py-2.5 text-sm hover:bg-brand-50/40 ${!n.is_read ? "bg-brand-50/30" : ""}`}>
                    {n.title ? <p className="font-medium">{n.title}</p> : null}
                    <p className="text-muted">{n.message}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDate(n.created_at, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                );
                return (
                  <div key={n.id} className="border-b border-app/60 last:border-0">
                    {n.link_url ? <Link href={n.link_url}>{inner}</Link> : inner}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
