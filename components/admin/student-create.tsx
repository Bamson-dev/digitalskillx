"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import { UserPlus, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  createStudent,
  bulkUploadStudents,
  type StudentActionState,
} from "@/app/(admin)/admin/(panel)/students/actions";

const initial: StudentActionState = {};

export function StudentCreate() {
  const [tab, setTab] = useState<"single" | "csv">("single");
  const [createState, createAction] = useFormState(createStudent, initial);
  const [csvState, csvAction] = useFormState(bulkUploadStudents, initial);
  const state = tab === "single" ? createState : csvState;

  return (
    <Card>
      <div className="mb-4 flex gap-2">
        <Button variant={tab === "single" ? "primary" : "outline"} size="sm" onClick={() => setTab("single")}>
          <UserPlus className="h-4 w-4" /> Add student
        </Button>
        <Button variant={tab === "csv" ? "primary" : "outline"} size="sm" onClick={() => setTab("csv")}>
          <Upload className="h-4 w-4" /> Bulk CSV
        </Button>
      </div>

      {tab === "single" ? (
        <form action={createAction} className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Full name</Label>
            <Input name="full_name" required />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" required />
          </div>
          <div>
            <Label>Password (blank = auto)</Label>
            <Input name="password" placeholder="auto-generated" />
          </div>
          <div className="sm:col-span-3">
            <SubmitButton pendingText="Creating…">
              <UserPlus className="h-4 w-4" /> Create student
            </SubmitButton>
          </div>
        </form>
      ) : (
        <form action={csvAction} className="space-y-3">
          <div>
            <Label>CSV rows — first_name,last_name,email,course_id (optional)</Label>
            <Textarea
              name="csv"
              rows={5}
              placeholder={"first_name,last_name,email,course_id\nAda,Lovelace,ada@example.com,\n"}
              className="font-mono text-xs"
            />
          </div>
          <SubmitButton pendingText="Uploading…">
            <Upload className="h-4 w-4" /> Import students
          </SubmitButton>
        </form>
      )}

      {state.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state.message ? (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
      ) : null}
    </Card>
  );
}
