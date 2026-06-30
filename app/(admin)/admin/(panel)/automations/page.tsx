import type { Metadata } from "next";
import { Trash2, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AutomationBuilder } from "@/components/admin/automation-builder";
import { toggleRule, deleteRule } from "./actions";

export const metadata: Metadata = { title: "Automations" };

export default async function AutomationsPage() {
  await requireAdmin();
  const supabase = createClient();

  const [{ data: rules }, { data: courses }] = await Promise.all([
    supabase.from("automation_rules").select("*").order("created_at", { ascending: false }),
    supabase.from("courses").select("id, title").order("title"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automations</h1>
        <p className="mt-1 text-sm text-muted">Trigger actions automatically as students progress.</p>
      </div>

      <AutomationBuilder courses={courses ?? []} />

      <Card>
        <CardHeader title="Active rules" />
        {!rules || rules.length === 0 ? (
          <p className="text-sm text-muted">No automations yet.</p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border))]">
            {rules.map((r) => {
              const actions = Array.isArray(r.actions) ? r.actions : [];
              return (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Zap className="h-4 w-4 text-brand" />
                    <div>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted">
                        {r.trigger_event} → {actions.map((a) => (a as { type: string }).type).join(", ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Paused</Badge>}
                    <form action={toggleRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="is_active" value={(!r.is_active).toString()} />
                      <Button type="submit" size="sm" variant="ghost">
                        {r.is_active ? "Pause" : "Activate"}
                      </Button>
                    </form>
                    <form action={deleteRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
