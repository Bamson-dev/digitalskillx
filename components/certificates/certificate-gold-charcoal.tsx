import { CertificateFooter } from "@/components/certificates/certificate-footer";
import { certificateFont } from "@/components/certificates/certificate-font";
import type { CertificateRenderData } from "@/components/certificates/certificate-types";

const BG = "#FBF9F3";
const CHARCOAL = "#2C2C2A";
const GOLD = "#C08A22";

function GoldMedallionSeal() {
  return (
    <div
      style={{
        width: "5.5rem",
        height: "5.5rem",
        borderRadius: "50%",
        background: "linear-gradient(145deg, #E8C56A 0%, #C08A22 45%, #9A6B12 100%)",
        border: `2px solid ${GOLD}`,
        boxShadow: "0 4px 14px rgba(192, 138, 34, 0.35)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto",
        color: "#fff",
        textAlign: "center",
        fontSize: "0.55rem",
        fontWeight: 700,
        letterSpacing: "0.14em",
        lineHeight: 1.35,
        textTransform: "uppercase",
      }}
    >
      <span>Verified</span>
      <span style={{ fontSize: "0.48rem", opacity: 0.95 }}>DigitalSkillX</span>
    </div>
  );
}

export function CertificateGoldCharcoal({
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
        padding: "1.25rem",
        boxSizing: "border-box",
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <div
        style={{
          height: "100%",
          border: `2px solid ${CHARCOAL}`,
          padding: "0.45rem",
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
            color: CHARCOAL,
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
              color: CHARCOAL,
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
              color: CHARCOAL,
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            {studentName}
          </p>
          <p style={{ margin: "1rem 0 0", fontSize: "0.85rem", opacity: 0.75 }}>has successfully completed</p>
          <p
            style={{
              margin: "0.35rem 0 0",
              fontSize: "1.25rem",
              fontWeight: 600,
              color: CHARCOAL,
            }}
          >
            {courseName}
          </p>

          <div style={{ marginTop: "1.5rem" }}>
            <GoldMedallionSeal />
          </div>

          <CertificateFooter
            issuedAt={issuedAt}
            certificateNumber={certificateNumber}
            qrDataUrl={qrDataUrl}
            labelColor={GOLD}
            textColor={CHARCOAL}
          />
        </div>
      </div>
    </div>
  );
}
