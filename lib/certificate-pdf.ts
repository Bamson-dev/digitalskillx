import "server-only";
import PDFDocument from "pdfkit";
import { ORG, siteUrl } from "@/lib/org";

export function generateCertificatePdfBuffer(params: {
  studentName: string;
  courseTitle: string;
  certificateNumber: string;
  issuedAt: string;
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 48 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const centerX = pageWidth / 2;

    doc.rect(24, 24, doc.page.width - 48, doc.page.height - 48).stroke("#e11d48");

    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .fillColor("#e11d48")
      .text(ORG.platformName, 0, 56, { align: "center" });

    doc
      .font("Helvetica")
      .fontSize(12)
      .fillColor("#64748b")
      .text("Certificate of Completion", 0, 92, { align: "center" });

    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor("#111827")
      .text(params.studentName, 0, 150, { align: "center" });

    doc
      .font("Helvetica")
      .fontSize(13)
      .fillColor("#475569")
      .text("has successfully completed", 0, 188, { align: "center" });

    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#111827")
      .text(params.courseTitle, 48, 220, { align: "center", width: pageWidth - 96 });

    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#64748b")
      .text(`Certificate number: ${params.certificateNumber}`, 0, 290, { align: "center" });

    doc.text(`Issued: ${new Date(params.issuedAt).toLocaleDateString("en-GB")}`, 0, 308, {
      align: "center",
    });

    doc.text(`Verify: ${siteUrl()}/verify/${params.certificateNumber}`, 0, 326, {
      align: "center",
      link: `${siteUrl()}/verify/${params.certificateNumber}`,
    });

    doc
      .fontSize(10)
      .fillColor("#94a3b8")
      .text(ORG.certificateOrg, centerX - 200, doc.page.height - 72, {
        width: 400,
        align: "center",
      });

    doc.end();
  });
}
