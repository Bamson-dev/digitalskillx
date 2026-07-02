import { CertificateFooter } from "@/components/certificates/certificate-footer";
import { certificateFont } from "@/components/certificates/certificate-font";
import type { CertificateRenderData } from "@/components/certificates/certificate-types";

const BG = "#FBF9F3";
const NAVY = "#0E2A4A";
const GOLD = "#C08A22";

function RibbonSeal() {
  return (
    <div style={{ position: "relative", width: "7rem", margin: "0 auto" }}>
      <div
        style={{
          width: "5rem",
          height: "5rem",
          margin: "0 auto",
          borderRadius: "50%",
          background: "linear-gradient(145deg, #E8C56A 0%, #C08A22 50%, #9A6B12 100%)",
          border: `2px solid ${GOLD}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: "0.52rem",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          lineHeight: 1.35,
          zIndex: 1,
          position: "relative",
        }}
      >
        <span>Verified</span>
        <span style={{ fontSize: "0.46rem" }}>DigitalSkillX</span>
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "-0.35rem",
          transform: "translateX(-50%)",
          width: "6.5rem",
          height: "1.1rem",
          background: "linear-gradient(90deg, #9A6B12, #C08A22, #E8C56A, #C08A22, #9A6B12)",
          clipPath: "polygon(8% 0, 92% 0, 100% 100%, 0 100%)",
        }}
      />
    </div>
  );
}

export function CertificateNavyRibbon({
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
        overflow: "hidden",
        boxSizing: "border-box",
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
    >
      <div
        style={{
          background: NAVY,
          color: "#fff",
          textAlign: "center",
          padding: "1.35rem 1.5rem 1.1rem",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "0.7rem",
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            opacity: 0.9,
          }}
        >
          {organizationName}
        </p>
        <h1
          style={{
            margin: "0.5rem 0 0",
            fontSize: "1.55rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
          }}
        >
          Certificate of Completion
        </h1>
      </div>
      <div style={{ height: "3px", background: GOLD }} />

      <div
        style={{
          padding: "1.75rem 2.25rem 1.5rem",
          display: "flex",
          flexDirection: "column",
          height: "calc(100% - 5.5rem)",
          boxSizing: "border-box",
          textAlign: "center",
          color: NAVY,
        }}
      >
        <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.7 }}>This certifies that</p>
        <p
          style={{
            margin: "0.5rem 0 0",
            fontSize: "1.85rem",
            fontWeight: 700,
            color: NAVY,
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}
        >
          {studentName}
        </p>
        <p style={{ margin: "1rem 0 0", fontSize: "0.85rem", opacity: 0.7 }}>has successfully completed</p>
        <p style={{ margin: "0.35rem 0 0", fontSize: "1.25rem", fontWeight: 600, color: NAVY }}>{courseName}</p>

        <div style={{ marginTop: "1.25rem" }}>
          <RibbonSeal />
        </div>

        <CertificateFooter
          issuedAt={issuedAt}
          certificateNumber={certificateNumber}
          qrDataUrl={qrDataUrl}
          labelColor={GOLD}
          textColor={NAVY}
        />
      </div>
    </div>
  );
}
