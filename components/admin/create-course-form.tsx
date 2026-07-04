"use client";

import { useFormState } from "react-dom";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  createCourse,
  type CreateCourseState,
} from "@/app/(admin)/admin/(panel)/courses/actions";

const initialState: CreateCourseState = {};

export function CreateCourseForm() {
  const [state, formAction] = useFormState(createCourse, initialState);

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium">New course title</label>
          <Input name="title" placeholder="e.g. Facebook Ads Mastery" required />
          {state.error ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {state.error}
            </p>
          ) : null}
        </div>
        <SubmitButton pendingText="Creating…">
          <Plus className="h-4 w-4" /> Create course
        </SubmitButton>
      </form>
    </Card>
  );
}
