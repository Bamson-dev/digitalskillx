import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { issueCertificate, reissueCertificate, updateCertificateRecipientName } from "@/lib/certificates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type IssueBody = {
  action: "issue";
  studentId: string;
  courseId: string;
  recipientName?: string;
};

type ReissueBody = {
  action: "reissue";
  certificateId: string;
  recipientName?: string;
};

type UpdateBody = {
  certificateId: string;
  recipientName: string;
};

/** Admin certificate issue, name update, and reissue (email + PDF). */
export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-certificates", 30);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: IssueBody | ReissueBody;
  try {
    body = (await request.json()) as IssueBody | ReissueBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.action === "issue") {
      const studentId = String(body.studentId ?? "").trim();
      const courseId = String(body.courseId ?? "").trim();
      if (!studentId || !courseId) {
        return NextResponse.json({ error: "studentId and courseId are required." }, { status: 400 });
      }

      const cert = await issueCertificate({
        studentId,
        courseId,
        recipientName: body.recipientName,
        sendEmail: true,
      });
      if (!cert) {
        return NextResponse.json({ error: "Could not issue certificate." }, { status: 400 });
      }

      await logAudit({
        action: "certificate_issued_manual",
        metadata: { studentId, courseId, certificateId: cert.id },
      });

      revalidatePath(`/admin/students/${studentId}`);
      revalidatePath("/admin/students");
      revalidatePath("/certificates");

      return NextResponse.json({
        ok: true,
        certificateId: cert.id,
        certificateNumber: cert.certificate_number,
        recipientName: cert.recipient_name,
        message: "Certificate issued. The student was emailed a PDF copy and can view it on their dashboard.",
      });
    }

    if (body.action === "reissue") {
      const certificateId = String(body.certificateId ?? "").trim();
      if (!certificateId) {
        return NextResponse.json({ error: "certificateId is required." }, { status: 400 });
      }

      const result = await reissueCertificate({
        certificateId,
        recipientName: body.recipientName,
      });

      await logAudit({
        action: "certificate_reissued",
        metadata: { certificateId, recipientName: result.recipientName },
      });

      revalidatePath("/certificates");
      revalidatePath("/admin/students");

      return NextResponse.json({
        ok: true,
        recipientName: result.recipientName,
        emailSent: result.emailResult.sent === true,
        message: result.emailResult.sent
          ? "Certificate reissued and emailed to the student."
          : "Certificate updated but email could not be sent. Check email settings.",
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Certificate request failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Update printed name on a certificate without resending email. */
export async function PATCH(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-certificates", 30);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const certificateId = String(body.certificateId ?? "").trim();
  const recipientName = String(body.recipientName ?? "").trim();
  if (!certificateId || !recipientName) {
    return NextResponse.json({ error: "certificateId and recipientName are required." }, { status: 400 });
  }

  try {
    const cert = await updateCertificateRecipientName({ certificateId, recipientName });
    await logAudit({
      action: "certificate_name_updated",
      metadata: { certificateId, recipientName },
    });
    revalidatePath("/certificates");
    revalidatePath(`/admin/students/${cert.student_id}`);
    return NextResponse.json({ ok: true, recipientName, message: "Certificate name updated." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update certificate.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
