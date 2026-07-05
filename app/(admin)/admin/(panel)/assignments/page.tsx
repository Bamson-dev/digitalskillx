import type { Metadata } from "next";
import { Trash2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { AssignmentForm } from "@/components/admin/assignment-form";
import { createAssignment, deleteAssignment, publishAssignment } from "./actions";

export const metadata: Metadata = { title: "Assignments" };

export default async function AdminAssignmentsPage() {
  const supabase = createClient();

  const [{ data: courses }, { data: modules }, { data: assignments }] = await Promise.all([
    supabase.from("courses").select("id, title").order("title"),
    supabase.from("modules").select("id, title, course_id").order("title"),
    supabase
      .from("assignments")
      .select("id, title, due_date, status, module_id, course:courses(title), module:modules(title)")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Assignments</h1>
        <p className="mt-1 text-sm text-muted">
          Create draft assignments, publish when ready, and review submissions in Grading.
        </p>
      </div>

      <Card>
        <CardHeader title="New assignment" />
        <AssignmentForm
          courses={courses ?? []}
          modules={modules ?? []}
          createAction={createAssignment}
        />
      </Card>

      <Card>
        <CardHeader title="All assignments" />
        {!assignments || assignments.length === 0 ? (
          <p className="text-sm text-muted">No assignments yet.</p>
        ) : (
          <ul className="divide-y divide-[rgb(var(--border))]">
            {assignments.map((assignment) => {
              const course = Array.isArray(assignment.course) ? assignment.course[0] : assignment.course;
              const moduleRow = Array.isArray(assignment.module) ? assignment.module[0] : assignment.module;
              const isCourseLevel = !assignment.module_id;
              const isDraft = assignment.status === "draft";

              return (
                <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{assignment.title}</span>
                      <Badge tone={isDraft ? "amber" : "green"}>{isDraft ? "Draft" : "Published"}</Badge>
                      <Badge tone={isCourseLevel ? "brand" : "neutral"}>
                        {isCourseLevel ? "Course-level" : "Module"}
                      </Badge>
                    </div>
                    <p className="text-muted">
                      {course?.title ?? "Unknown course"}
                      {!isCourseLevel && moduleRow?.title ? ` · ${moduleRow.title}` : null}
                      {assignment.due_date ? ` · due ${formatDate(assignment.due_date)}` : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isDraft ? (
                      <form action={publishAssignment}>
                        <input type="hidden" name="id" value={assignment.id} />
                        <Button type="submit" size="sm">
                          <Send className="h-4 w-4" /> Publish
                        </Button>
                      </form>
                    ) : null}
                    <form action={deleteAssignment}>
                      <input type="hidden" name="id" value={assignment.id} />
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
