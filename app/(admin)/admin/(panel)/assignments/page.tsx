import type { Metadata } from "next";
import { Trash2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { createAssignment, deleteAssignment } from "./actions";

export const metadata: Metadata = { title: "Assignments" };

export default async function AdminAssignmentsPage() {
  const supabase = createClient();

  const { data: modules } = await supabase
    .from("modules")
    .select("id, title, course:courses(title)")
    .order("title");

  const { data: assignments } = await supabase
    .from("assignments")
    .select("id, title, due_date, module:modules(title)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Assignments</h1>
        <p className="mt-1 text-sm text-muted">Create assignments and review submissions in Grading.</p>
      </div>

      <Card>
        <CardHeader title="New assignment" />
        <form action={createAssignment} className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Module</Label>
            <Select name="module_id" required>
              <option value="">Select a module…</option>
              {(modules ?? []).map((m) => {
                const course = Array.isArray(m.course) ? m.course[0] : m.course;
                return (
                  <option key={m.id} value={m.id}>
                    {course?.title ? `${course.title} — ` : ""}
                    {m.title}
                  </option>
                );
              })}
            </Select>
          </div>
          <div>
            <Label>Title</Label>
            <Input name="title" required />
          </div>
          <div className="sm:col-span-2">
            <Label>Instructions</Label>
            <Textarea name="instructions" rows={3} />
          </div>
          <div>
            <Label>Due date</Label>
            <Input name="due_date" type="datetime-local" />
          </div>
          <div>
            <Label>Allowed submission types</Label>
            <div className="flex flex-wrap gap-3 pt-2 text-sm">
              {["file", "text", "link", "video"].map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input type="checkbox" name="submission_types" value={t} defaultChecked={t === "file" || t === "text"} />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">
              <Plus className="h-4 w-4" /> Create assignment
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="All assignments" />
        {!assignments || assignments.length === 0 ? (
          <p className="text-sm text-muted">No assignments yet.</p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border))]">
            {assignments.map((a) => {
              const m = Array.isArray(a.module) ? a.module[0] : a.module;
              return (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-medium">{a.title}</span>{" "}
                    <span className="text-muted">· {m?.title}</span>
                    {a.due_date ? <span className="text-muted"> · due {formatDate(a.due_date)}</span> : null}
                  </span>
                  <form action={deleteAssignment}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
