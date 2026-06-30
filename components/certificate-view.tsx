import Image from "next/image";
import { ORG } from "@/lib/org";
import { formatDate } from "@/lib/utils";

/** Printable certificate layout shared by the student view and PDF render. */
export function CertificateView({
  studentName,
  courseName,
  completedAt,
  issuedAt,
  certificateNumber,
  qrDataUrl,
}: {
  studentName: string;
  courseName: string;
  completedAt: string | null;
  issuedAt: string;
  certificateNumber: string;
  qrDataUrl: string;
}) {
  return (
    <div
      id="certificate"
      className="relative mx-auto aspect-[1.414/1] w-full max-w-3xl overflow-hidden rounded-xl border-[6px] border-brand bg-white p-10 text-center text-slate-900 shadow-lg"
    >
      <div className="absolute inset-3 rounded-lg border border-brand-200" />
      <div className="relative flex h-full flex-col">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-brand-700">
          {ORG.shortName}
        </p>
        <h1 className="mt-6 text-3xl font-bold">Certificate of Completion</h1>
        <p className="mt-6 text-sm text-slate-500">This certifies that</p>
        <p className="mt-2 text-2xl font-bold text-brand-800">{studentName}</p>
        <p className="mt-4 text-sm text-slate-500">has successfully completed</p>
        <p className="mt-1 text-xl font-semibold">{courseName}</p>

        <div className="mt-auto flex items-end justify-between pt-8 text-left text-xs text-slate-600">
          <div>
            <p className="border-t border-slate-400 pt-1 font-semibold">{ORG.instructor}</p>
            <p>Instructor</p>
            <p className="mt-3">Completed: {formatDate(completedAt ?? issuedAt)}</p>
            <p>Issued: {formatDate(issuedAt)}</p>
          </div>
          <div className="text-center">
            <Image src={qrDataUrl} alt="Verification QR" width={96} height={96} unoptimized />
            <p className="mt-1">Verify online</p>
          </div>
          <div className="text-right">
            <p className="font-semibold">{ORG.certificateOrg}</p>
            <p>{ORG.rc}</p>
            <p className="mt-3">Certificate №</p>
            <p className="font-mono font-semibold">{certificateNumber}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
