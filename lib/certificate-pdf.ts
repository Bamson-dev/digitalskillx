import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ORG } from "@/lib/org";

export type CertificatePdfInput = {
  recipientName: string;
  courseTitle: string;
  certificateNumber: string;
  issuedAt: string;
  verifyUrl: string;
};

/** Landscape A4 certificate PDF (serverless-safe; no external font files). */
export async function generateCertificatePdfBuffer(
  input: CertificatePdfInput
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([842, 595]); // A4 landscape (pt)
  const { width, height } = page.getSize();

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const innerMargin = 24;
  const borderColor = rgb(0.85, 0.12, 0.12);
  const textDark = rgb(0.1, 0.1, 0.1);
  const textMuted = rgb(0.35, 0.35, 0.35);

  // Outer border
  page.drawRectangle({
    x: margin,
    y: margin,
    width: width - margin * 2,
    height: height - margin * 2,
    borderColor,
    borderWidth: 3,
  });

  // Inner border
  page.drawRectangle({
    x: margin + innerMargin,
    y: margin + innerMargin,
    width: width - (margin + innerMargin) * 2,
    height: height - (margin + innerMargin) * 2,
    borderColor,
    borderWidth: 1,
  });

  const centerX = width / 2;
  let y = height - margin - innerMargin - 40;

  const drawCentered = (
    text: string,
    size: number,
    font: typeof helvetica,
    color = textDark
  ) => {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: centerX - textWidth / 2,
      y,
      size,
      font,
      color,
    });
    y -= size + 12;
  };

  drawCentered("Certificate of Completion", 28, helveticaBold);
  y -= 8;
  drawCentered(ORG.certificateOrg, 12, helvetica, textMuted);
  y -= 16;
  drawCentered("This certifies that", 14, helvetica, textMuted);
  y -= 8;
  drawCentered(input.recipientName, 32, helveticaBold);
  y -= 8;
  drawCentered("has successfully completed", 14, helvetica, textMuted);
  y -= 8;
  drawCentered(input.courseTitle, 20, helveticaBold);

  y = margin + innerMargin + 80;
  const issued = new Date(input.issuedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  drawCentered(`Issued ${issued}`, 11, helvetica, textMuted);
  drawCentered(`Certificate No. ${input.certificateNumber}`, 10, helvetica, textMuted);
  drawCentered(`Verify: ${input.verifyUrl}`, 9, helvetica, textMuted);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
