"use client";

import { useRef } from "react";
import { Ban, CheckCircle2, KeyRound, MonitorSmartphone, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

type DeviceSession = {
  id: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  city: string | null;
  country: string | null;
  lastActiveAt: string;
  isCurrent: boolean;
};

export function StudentDeviceAccessPanel({
  studentId,
  paidProgramAccess,
  activeDeviceCount,
  maxDevices,
  sessions,
  resetDevicesAction,
  updateMaxDevicesAction,
}: {
  studentId: string;
  paidProgramAccess: boolean;
  activeDeviceCount: number;
  maxDevices: number;
  sessions: DeviceSession[];
  resetDevicesAction: (formData: FormData) => void | Promise<void>;
  updateMaxDevicesAction: (formData: FormData) => void | Promise<void>;
}) {
  const resetRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900">
            {activeDeviceCount} active device{activeDeviceCount === 1 ? "" : "s"}
            {paidProgramAccess ? (
              <span className="font-normal text-muted"> · limit {maxDevices}</span>
            ) : (
              <span className="font-normal text-muted"> · free access (no device limit)</span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            Paid programs allow up to {maxDevices} devices by default. Free-only students are not
            limited. Reset clears all device logins so the student can sign in again.
          </p>
        </div>
        <form ref={resetRef} action={resetDevicesAction}>
          <input type="hidden" name="id" value={studentId} />
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => {
              if (
                confirm(
                  "Reset all device logins for this student?\n\nThey will be signed out everywhere and can log in again on new devices (up to their max).",
                )
              ) {
                resetRef.current?.requestSubmit();
              }
            }}
          >
            <MonitorSmartphone className="h-4 w-4" /> Reset devices
          </Button>
        </form>
      </div>

      {paidProgramAccess ? (
        <form action={updateMaxDevicesAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={studentId} />
          <div>
            <label htmlFor="max_devices" className="mb-1 block text-xs font-medium text-muted">
              Max devices (1–50)
            </label>
            <Input
              id="max_devices"
              name="max_devices"
              type="number"
              min={1}
              max={50}
              defaultValue={maxDevices}
              className="w-28"
              required
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            Save max
          </Button>
        </form>
      ) : null}

      {sessions.length === 0 ? (
        <p className="text-sm text-muted">No active device sessions recorded.</p>
      ) : (
        <ul className="divide-y divide-app rounded-lg border border-app">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-neutral-900">
                  {s.browser ?? "Browser"} on {s.os ?? "device"}
                  {s.isCurrent ? (
                    <span className="ml-2 text-xs font-normal text-green-700">current</span>
                  ) : null}
                </p>
                <p className="text-xs text-muted">
                  {[s.device, s.city, s.country].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <p className="shrink-0 text-xs text-muted">
                {new Date(s.lastActiveAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type EnrollmentRow = {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  completedAt: string | null;
  progressPct: number;
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
      <div className="min-w-0 flex-1">
        <p className="font-medium text-neutral-900">{row.courseTitle}</p>
        <div className="mt-2 max-w-xs">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{row.completedAt ? "Completed" : "In progress"}</span>
            <span>{row.progressPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${row.progressPct}%` }}
            />
          </div>
        </div>
      </div>
      <form ref={formRef} action={unenrollAction}>
        <input type="hidden" name="student_id" value={studentId} />
        <input type="hidden" name="course_id" value={row.courseId} />
        <input type="hidden" name="enrollment_id" value={row.enrollmentId} />
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
