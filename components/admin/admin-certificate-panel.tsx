"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Award, Loader2, Mail, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type AdminCertificateRow = {
  id: string;
  certificateNumber: string;
  courseTitle: string | null;
  recipientName: string;
};

export function AdminCertificatePanel({
  studentId,
  fullName,
  enrolledCourses,
  certificates,
}: {
  studentId: string;
  fullName: string | null;
  enrolledCourses: { courseId: string; courseTitle: string }[];
  certificates: AdminCertificateRow[];
}) {
  const router = useRouter();
  const [issueCourseId, setIssueCourseId] = useState("");
  const [issueName, setIssueName] = useState(fullName ?? "");
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCertId, setBusyCertId] = useState<string | null>(null);
  const [nameEdits, setNameEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(certificates.map((cert) => [cert.id, cert.recipientName])),
  );

  async function issueCertificate() {
    if (!issueCourseId) {
      setError("Select a course to issue a certificate.");
      return;
    }
    setIssuing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/certificates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "issue",
          studentId,
          courseId: issueCourseId,
          recipientName: issueName.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not issue certificate.");
      setMessage(json.message ?? "Certificate issued.");
      setIssueCourseId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue certificate.");
    } finally {
      setIssuing(false);
    }
  }

  async function saveName(certificateId: string) {
    const recipientName = nameEdits[certificateId]?.trim();
    if (!recipientName) {
      setError("Recipient name cannot be empty.");
      return;
    }
    setBusyCertId(certificateId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/certificates", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificateId, recipientName }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not update name.");
      setMessage(json.message ?? "Certificate name updated.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update name.");
    } finally {
      setBusyCertId(null);
    }
  }

  async function reissue(certificateId: string) {
    const recipientName = nameEdits[certificateId]?.trim();
    if (!recipientName) {
      setError("Recipient name cannot be empty.");
      return;
    }
    if (!confirm("Reissue this certificate? The student will receive a new email with the PDF attached.")) {
      return;
    }
    setBusyCertId(certificateId);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/certificates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reissue",
          certificateId,
          recipientName,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not reissue certificate.");
      setMessage(json.message ?? "Certificate reissued.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reissue certificate.");
    } finally {
      setBusyCertId(null);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Award className="h-4 w-4 text-brand" /> Certificates
        </h4>
        <p className="mb-3 text-xs text-muted">
          Students receive the certificate by email and on their dashboard. Edit the printed name, then reissue to
          send an updated PDF.
        </p>

        <div className="space-y-2 rounded-lg border border-app bg-surface-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Issue new certificate</p>
          <Input
            value={issueName}
            onChange={(event) => setIssueName(event.target.value)}
            placeholder="Name on certificate"
            aria-label="Name on certificate"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={issueCourseId}
              onChange={(event) => setIssueCourseId(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-app bg-card px-3 text-sm"
              aria-label="Course for certificate"
            >
              <option value="">Select enrolled course…</option>
              {enrolledCourses.map((course) => (
                <option key={course.courseId} value={course.courseId}>
                  {course.courseTitle}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" disabled={issuing} onClick={issueCertificate} className="shrink-0">
              {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
              Issue & email
            </Button>
          </div>
        </div>
      </div>

      {certificates.length === 0 ? (
        <p className="text-sm text-muted">None issued yet.</p>
      ) : (
        <ul className="space-y-3">
          {certificates.map((cert) => {
            const busy = busyCertId === cert.id;
            const editedName = nameEdits[cert.id] ?? cert.recipientName;
            const nameChanged = editedName.trim() !== cert.recipientName;
            return (
              <li key={cert.id} className="rounded-lg border border-app bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900">{cert.courseTitle ?? "Course"}</p>
                    <p className="text-xs text-muted">#{cert.certificateNumber}</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <label className="block text-xs font-medium text-muted">Name on certificate</label>
                  <Input
                    value={editedName}
                    onChange={(event) =>
                      setNameEdits((prev) => ({ ...prev, [cert.id]: event.target.value }))
                    }
                    aria-label={`Name on certificate for ${cert.courseTitle ?? "course"}`}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || !nameChanged}
                      onClick={() => saveName(cert.id)}
                    >
                      {busy && nameChanged ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save name
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => reissue(cert.id)}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                      Reissue & email PDF
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {message ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p> : null}
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
