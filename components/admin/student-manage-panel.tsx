"use client";

import { useRef } from "react";
import { Ban, CheckCircle2, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  studentId: string;
  email: string;
  fullName: string | null;
  isSuspended: boolean;
  suspendAction: (formData: FormData) => void | Promise<void>;
  resetPasswordAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
};

export function StudentAdminToolbar({
  studentId,
  email,
  fullName,
  isSuspended,
  suspendAction,
  resetPasswordAction,
  deleteAction,
}: Props) {
  const suspendRef = useRef<HTMLFormElement>(null);
  const resetRef = useRef<HTMLFormElement>(null);
  const deleteRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-wrap gap-2">
      <form ref={suspendRef} action={suspendAction}>
        <input type="hidden" name="id" value={studentId} />
        <input type="hidden" name="suspend" value={(!isSuspended).toString()} />
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => {
            const verb = isSuspended ? "unsuspend" : "suspend";
            if (
              confirm(
                isSuspended
                  ? "Restore this student's access to the platform?"
                  : "Suspend this student? They will not be able to log in until unsuspended.",
              )
            ) {
              suspendRef.current?.requestSubmit();
            }
          }}
        >
          {isSuspended ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> Unsuspend
            </>
          ) : (
            <>
              <Ban className="h-4 w-4" /> Suspend
            </>
          )}
        </Button>
      </form>

      <form ref={resetRef} action={resetPasswordAction}>
        <input type="hidden" name="id" value={studentId} />
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="full_name" value={fullName ?? ""} />
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => {
            if (
              confirm(
                "Generate a new password and email it to this student? Their current password will stop working.",
              )
            ) {
              resetRef.current?.requestSubmit();
            }
          }}
        >
          <KeyRound className="h-4 w-4" /> Reset password
        </Button>
      </form>

      <form ref={deleteRef} action={deleteAction}>
        <input type="hidden" name="id" value={studentId} />
        <Button
          variant="danger"
          size="sm"
          type="button"
          onClick={() => {
            if (
              confirm(
                "Permanently delete this student account?\n\nThis removes their enrollments, progress, and certificates. Transaction records are kept for accounting. This cannot be undone.",
              )
            ) {
              deleteRef.current?.requestSubmit();
            }
          }}
        >
          <Trash2 className="h-4 w-4" /> Delete account
        </Button>
      </form>
    </div>
  );
}

type EnrollmentRow = {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  completedAt: string | null;
};

export function StudentEnrollmentList({
  studentId,
  enrollments,
  unenrollAction,
}: {
  studentId: string;
  enrollments: EnrollmentRow[];
  unenrollAction: (formData: FormData) => void | Promise<void>;
}) {
  if (enrollments.length === 0) {
    return <p className="text-sm text-muted">Not enrolled in any course.</p>;
  }

  return (
    <div className="space-y-2">
      {enrollments.map((row) => (
        <EnrollmentRowItem
          key={row.enrollmentId}
          studentId={studentId}
          row={row}
          unenrollAction={unenrollAction}
        />
      ))}
    </div>
  );
}

function EnrollmentRowItem({
  studentId,
  row,
  unenrollAction,
}: {
  studentId: string;
  row: EnrollmentRow;
  unenrollAction: (formData: FormData) => void | Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-app px-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-neutral-900">{row.courseTitle}</p>
        <p className="text-xs text-muted">
          {row.completedAt ? "Completed" : "In progress"}
        </p>
      </div>
      <form ref={formRef} action={unenrollAction}>
        <input type="hidden" name="student_id" value={studentId} />
        <input type="hidden" name="course_id" value={row.courseId} />
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
          onClick={() => {
            if (
              confirm(
                `Remove "${row.courseTitle}" from this student?\n\nThey will lose access immediately.`,
              )
            ) {
              formRef.current?.requestSubmit();
            }
          }}
        >
          Remove access
        </button>
      </form>
    </div>
  );
}
