import Image from "next/image";
import { formatDate } from "@/lib/utils";

/** Bottom band: date issued, certificate number, and verification QR. */
export function CertificateFooter({
  issuedAt,
  certificateNumber,
  qrDataUrl,
  labelColor = "#C08A22",
  textColor = "#2C2C2A",
}: {
  issuedAt: string;
  certificateNumber: string;
  qrDataUrl: string;
  labelColor?: string;
  textColor?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: "1rem",
        marginTop: "auto",
        paddingTop: "1.5rem",
        borderTop: `1px solid ${labelColor}33`,
        fontSize: "0.7rem",
        color: textColor,
      }}
    >
      <div style={{ textAlign: "left" }}>
        <p style={{ color: labelColor, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>
          Date issued
        </p>
        <p style={{ margin: "0.25rem 0 0", fontWeight: 600 }}>{formatDate(issuedAt)}</p>
      </div>
      <div style={{ textAlign: "center" }}>
        <Image src={qrDataUrl} alt="Verification QR code" width={88} height={88} unoptimized />
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.65rem", opacity: 0.75 }}>Scan to verify</p>
      </div>
      <div style={{ textAlign: "right" }}>
        <p style={{ color: labelColor, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", margin: 0 }}>
          Certificate no.
        </p>
        <p style={{ margin: "0.25rem 0 0", fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
          {certificateNumber}
        </p>
      </div>
    </div>
  );
}
