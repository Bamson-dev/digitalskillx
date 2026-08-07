"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type SessionView = {
  id: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null;
  city: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  isCurrent: boolean;
  flaggedImpossibleTravel: boolean;
  createdAt: string;
};

export function AccountSecurityPanel() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/student/sessions");
      const json = (await res.json()) as { sessions?: SessionView[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load sessions");
      setSessions(json.sessions ?? []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load sessions", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/student/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      toast("Sessions updated");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="security" className="rounded-xl border border-surface-border bg-white p-6 shadow-card">
      <h2 className="font-semibold text-neutral-900">Account security</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Active devices signed into your account. Sign out anything you do not recognize.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-muted" role="status">
          Loading sessions…
        </p>
      ) : null}

      {!loading && sessions.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          No tracked sessions yet. New sign-ins will appear here after account session tracking is
          enabled.
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-app px-3 py-3 text-sm"
          >
            <div>
              <div className="font-medium text-neutral-900">
                {s.browser ?? "Browser"} on {s.os ?? "device"}
                {s.isCurrent ? (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                    This device
                  </span>
                ) : null}
                {s.flaggedImpossibleTravel ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                    Unusual location
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-muted">
                {[s.device, s.city, s.country, s.ipAddress].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="mt-1 text-xs text-muted">
                Last active {new Date(s.lastActiveAt).toLocaleString()}
              </div>
            </div>
            {!s.isCurrent ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void mutate({ action: "revoke", sessionId: s.id })}
              >
                Sign out
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {sessions.length > 1 ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => void mutate({ action: "revoke_all" })}
          >
            Sign out all other sessions
          </Button>
        </div>
      ) : null}
    </section>
  );
}
