"use client";

import { useFormState } from "react-dom";
import { Save } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  updateStudentProfile,
  type StudentActionState,
} from "@/app/(admin)/admin/(panel)/students/actions";

const initial: StudentActionState = {};

export function StudentProfileForm({
  studentId,
  fullName,
  email,
}: {
  studentId: string;
  fullName: string | null;
  email: string;
}) {
  const [state, action] = useFormState(updateStudentProfile, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={studentId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" defaultValue={fullName ?? ""} required />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={email} required />
        </div>
      </div>
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
      ) : null}
      <SubmitButton pendingText="Saving…" size="sm">
        <Save className="h-4 w-4" /> Save profile
      </SubmitButton>
    </form>
  );
}
