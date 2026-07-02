import { CertificateFooter } from "@/components/certificates/certificate-footer";
import { certificateFont } from "@/components/certificates/certificate-font";
import type { CertificateRenderData } from "@/components/certificates/certificate-types";

const BG = "#FBF9F3";
const GREEN = "#0F3D2E";
const GOLD = "#C08A22";

function CrestSeal() {
  return (
    <div
      style={{
        width: "5.75rem",
        height: "5.75rem",
        margin: "0 auto",
        borderRadius: "50%",
        background: "linear-gradient(145deg, #E8C56A 0%, #C08A22 50%, #9A6B12 100%)",
        padding: "0.35rem",
        boxSizing: "border-box",
        boxShadow: "0 4px 12px rgba(15, 61, 46, 0.2)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          border: `3px solid ${GREEN}`,
          background: BG,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: GREEN,
          fontSize: "0.5rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          lineHeight: 1.35,
        }}
      >
        <span>Verified</span>
        <span style={{ fontSize: "0.44rem", color: GOLD }}>DigitalSkillX</span>
      </div>
    </div>
  );
}

export function CertificateGreenGold({
  studentName,
  courseName,
  issuedAt,
  certificateNumber,
  qrDataUrl,
  organizationName = "DigitalSkillX",
  rootId,
}: CertificateRenderData) {
  return (
    <div
      id={rootId}
      className={certificateFont.className}
      style={{
        position: "relative",
        aspectRatio: "1.414 / 1",
        width: "100%",
        maxWidth: "48rem",
        margin: "0 auto",
        background: BG,
        padding: "1rem",
        boxSizing: "border-box",
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <div
        style={{
          height: "100%",
          border: `5px solid ${GREEN}`,
          padding: "0.35rem",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            height: "100%",
            border: `1px solid ${GOLD}`,
            padding: "2rem 2.25rem 1.75rem",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            textAlign: "center",
            color: GREEN,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              color: GOLD,
            }}
          >
            {organizationName}
          </p>
          <h1
            style={{
              margin: "1rem 0 0",
              fontSize: "1.65rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: GREEN,
            }}
          >
            Certificate of Completion
          </h1>
          <p style={{ margin: "1.25rem 0 0", fontSize: "0.85rem", opacity: 0.75 }}>This certifies that</p>
          <p
            style={{
              margin: "0.5rem 0 0",
              fontSize: "1.85rem",
              fontWeight: 700,
              color: GREEN,
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            {studentName}
          </p>
          <p style={{ margin: "1rem 0 0", fontSize: "0.85rem", opacity: 0.75 }}>has successfully completed</p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "1.25rem", fontWeight: 600, color: GREEN }}>{courseName}</p>

          <div style={{ marginTop: "1.5rem" }}>
            <CrestSeal />
          </div>

          <CertificateFooter
            issuedAt={issuedAt}
            certificateNumber={certificateNumber}
            qrDataUrl={qrDataUrl}
            labelColor={GOLD}
            textColor={GREEN}
          />
        </div>
      </div>
    </div>
  );
}
