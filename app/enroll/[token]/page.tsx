import type { Metadata } from "next";
import { EnrollInviteClient } from "@/components/enrollment/enroll-invite-client";

export const metadata: Metadata = { title: "Your invite" };

export default function EnrollPage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token ?? "").trim();
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50/80 to-white">
      <header className="border-b border-app/60 bg-white/70 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-3xl font-display text-lg font-bold tracking-tight">
          DigitalSkillX
        </div>
      </header>
      <EnrollInviteClient token={token} />
    </div>
  );
}
