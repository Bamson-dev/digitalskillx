"use client";

import { useFormState } from "react-dom";
import { CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  submitAssignment,
  type AssignmentSubmitState,
} from "@/app/(student)/assignments/[id]/actions";

const initial: AssignmentSubmitState = {};

export function AssignmentSubmitForm({
  assignmentId,
  allowed,
}: {
  assignmentId: string;
  allowed: string[];
}) {
  const [state, action] = useFormState(submitAssignment, initial);

  return (
    <>
      <CardHeader title="Submit your work" />
      {state.error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <form action={action} className="space-y-3">
        <input type="hidden" name="assignment_id" value={assignmentId} />
        {allowed.includes("text") ? (
          <div>
            <Label>Written response</Label>
            <Textarea name="content" rows={4} required={allowed.length === 1} />
          </div>
        ) : null}
        {allowed.includes("link") || allowed.includes("video") ? (
          <div>
            <Label>Link (Google Docs / Loom / YouTube)</Label>
            <Input name="link_url" placeholder="https://…" />
          </div>
        ) : null}
        {allowed.includes("file") ? (
          <div>
            <Label>File URL</Label>
            <Input name="file_url" placeholder="Paste an uploaded file URL" />
          </div>
        ) : null}
        <SubmitButton>Submit</SubmitButton>
      </form>
    </>
  );
}
