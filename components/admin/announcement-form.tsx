"use client";

import { useFormState } from "react-dom";
import { Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RichText } from "@/components/ui/rich-text";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  sendAnnouncement,
  type AnnouncementState,
} from "@/app/(admin)/admin/(panel)/announcements/actions";

const initial: AnnouncementState = {};

export function AnnouncementForm({ courses }: { courses: { id: string; title: string }[] }) {
  const [state, action] = useFormState(sendAnnouncement, initial);

  return (
    <Card>
      <form action={action} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Subject</Label>
            <Input name="subject" required />
          </div>
          <div>
            <Label>Audience</Label>
            <Select name="target" defaultValue="all">
              <option value="all">All students</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  Enrolled in: {c.title}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label>Message</Label>
          <RichText name="body" placeholder="Write your announcement…" />
        </div>
        <SubmitButton pendingText="Sending…">
          <Send className="h-4 w-4" /> Send announcement
        </SubmitButton>
        {state.error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        ) : null}
        {state.message ? (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
        ) : null}
      </form>
    </Card>
  );
}
