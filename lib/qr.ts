import "server-only";
import QRCode from "qrcode";

/** Generate a PNG data URL for a QR code (used on certificates, PRD §11.1). */
export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 240 });
}
