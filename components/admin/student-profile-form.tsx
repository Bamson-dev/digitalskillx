"use client";

import { useFormState } from "react-dom";
import { Save } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import {
  AdminInlineFeedback,
  AdminSaveButton,
  useFormStateSaveUx,
} from "@/components/admin/admin-save-ux";
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
  const { label } = useFormStateSaveUx(state, {
    successToast: "Profile saved successfully.",
    idleLabel: "Save Changes",
  });

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
      <AdminInlineFeedback state={state} />
      <AdminSaveButton label={label} size="sm">
        <Save className="h-4 w-4" /> {label}
      </AdminSaveButton>
    </form>
  );
}
