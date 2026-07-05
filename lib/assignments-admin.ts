import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyAssignmentPublished } from "@/lib/assignment-publish";
import type { Database } from "@/types/database";

export type CreateAssignmentInput = {
  courseId: string;
  moduleId?: string | null;
  title: string;
  instructions?: string | null;
  dueDate?: string | null;
  submissionTypes?: string[];
};

export async function createDraftAssignment(
  admin: SupabaseClient<Database>,
  input: CreateAssignmentInput,
) {
  const courseId = input.courseId.trim();
  const moduleId = input.moduleId?.trim() || null;
  const title = input.title.trim();

  if (!courseId) {
    return { error: "Course is required." };
  }
  if (!title) {
    return { error: "Title is required." };
  }

  if (moduleId) {
    const { data: moduleRow, error: moduleError } = await admin
      .from("modules")
      .select("course_id")
      .eq("id", moduleId)
      .single();
    if (moduleError || moduleRow?.course_id !== courseId) {
      return { error: "Selected module does not belong to the chosen course." };
    }
  }

  const types = input.submissionTypes?.length ? input.submissionTypes : ["file", "text"];

  const { data, error } = await admin
    .from("assignments")
    .insert({
      course_id: courseId,
      module_id: moduleId,
      title,
      instructions: input.instructions?.trim() || null,
      due_date: input.dueDate || null,
      submission_types_allowed: types,
      status: "draft",
    })
    .select("id, title, status, course_id, module_id")
    .single();

  if (error) {
    const message = error.message;
    if (/course_id|status|assignment_status|column/i.test(message)) {
      return {
        error:
          "Assignment database migration is missing. Run sql/assignment-course-publish.sql in Supabase SQL Editor, then retry.",
      };
    }
    return { error: message };
  }

  return { assignment: data };
}

export async function publishDraftAssignment(admin: SupabaseClient<Database>, assignmentId: string) {
  const id = assignmentId.trim();
  if (!id) {
    return { error: "Assignment id is required." };
  }

  const { data: assignment, error } = await admin
    .from("assignments")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id, title, instructions, due_date, course_id, status")
    .maybeSingle();

  if (error) {
    const message = error.message;
    if (/course_id|status|assignment_status|column/i.test(message)) {
      return {
        error:
          "Assignment database migration is missing. Run sql/assignment-course-publish.sql in Supabase SQL Editor, then retry.",
      };
    }
    return { error: message };
  }

  if (!assignment) {
    return { error: "Assignment not found or already published." };
  }

  const delivery = await notifyAssignmentPublished(assignment);
  return { assignment, delivery };
}
