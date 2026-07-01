import { requireStudent } from "@/lib/auth";
import { StudentShell } from "@/components/student/student-shell";
import { AiAssistant } from "@/components/student/ai-assistant";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireStudent();

  return (
    <>
      <StudentShell name={profile.full_name ?? profile.email}>{children}</StudentShell>
      <AiAssistant />
    </>
  );
}
