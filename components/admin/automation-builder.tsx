"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { createRule } from "@/app/(admin)/admin/(panel)/automations/actions";

const TRIGGERS = [
  { value: "account_created", label: "When a student account is created" },
  { value: "course_enrolled", label: "When a student is enrolled in a course" },
  { value: "lesson_completed", label: "When a lesson is completed" },
  { value: "quiz_passed", label: "When a quiz is passed" },
  { value: "quiz_failed", label: "When a quiz is failed" },
  { value: "course_completed", label: "When a course is completed" },
  { value: "student_inactive", label: "When a student is inactive" },
];

const ACTIONS = [
  { value: "send_notification", label: "Send in-app notification" },
  { value: "send_email", label: "Send email" },
  { value: "enroll_course", label: "Enroll into a course" },
  { value: "issue_certificate", label: "Issue a certificate" },
  { value: "add_tag", label: "Add a tag to the student" },
  { value: "notify_admin", label: "Notify an admin" },
];

export function AutomationBuilder({ courses }: { courses: { id: string; title: string }[] }) {
  const [actionType, setActionType] = useState("send_notification");

  return (
    <Card>
      <CardHeader title="New automation" description="If this trigger fires, then run this action." />
      <form action={createRule} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Rule name</Label>
          <Input name="name" placeholder="e.g. Welcome series" required />
        </div>
        <div>
          <Label>Trigger</Label>
          <Select name="trigger_event">
            {TRIGGERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Condition — course (optional)</Label>
          <Select name="condition_course_id">
            <option value="">Any course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </div>

        <div className="sm:col-span-2 border-t border-app pt-4">
          <Label>Action</Label>
          <Select name="action_type" value={actionType} onChange={(e) => setActionType(e.target.value)}>
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>

        {actionType === "send_email" ? (
          <>
            <div className="sm:col-span-2">
              <Label>Email subject</Label>
              <Input name="action_subject" />
            </div>
            <div className="sm:col-span-2">
              <Label>Email body</Label>
              <Textarea name="action_body" rows={3} />
            </div>
          </>
        ) : null}

        {(actionType === "send_notification" || actionType === "notify_admin") ? (
          <div className="sm:col-span-2">
            <Label>Message</Label>
            <Input name="action_message" />
          </div>
        ) : null}

        {(actionType === "enroll_course" || actionType === "issue_certificate") ? (
          <div className="sm:col-span-2">
            <Label>Course</Label>
            <Select name="action_course_id">
              <option value="">{actionType === "issue_certificate" ? "Triggering course" : "Select course"}</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {actionType === "add_tag" ? (
          <div className="sm:col-span-2">
            <Label>Tag</Label>
            <Input name="action_tag" placeholder="e.g. completed-fb-ads" />
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <Button type="submit">
            <Plus className="h-4 w-4" /> Create automation
          </Button>
        </div>
      </form>
    </Card>
  );
}
