import { requireStudent } from "@/lib/auth";
import { StudentNav } from "@/components/student/student-nav";
import { AiAssistant } from "@/components/student/ai-assistant";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireStudent();

  return (
    <div className="min-h-screen">
      <StudentNav name={profile.full_name ?? profile.email} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <AiAssistant />
    </div>
  );
}
