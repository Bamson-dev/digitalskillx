import type { ReactNode } from "react";
import { MessageCircle, Send, Users } from "lucide-react";
import { hasCourseCommunity, type CourseCommunityLinks } from "@/lib/course-community";
import { cn } from "@/lib/utils";

type CourseCommunitySectionProps = {
  links: CourseCommunityLinks;
  courseTitle?: string;
  variant?: "default" | "compact";
  className?: string;
};

function CommunityButton({
  href,
  label,
  description,
  icon,
  className,
}: {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
  className: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex items-center gap-4 rounded-xl border border-transparent px-4 py-4 transition-all hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
        {icon}
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-sm font-bold text-white">{label}</span>
        <span className="mt-0.5 block text-xs text-white/80">{description}</span>
      </span>
    </a>
  );
}

export function CourseCommunitySection({
  links,
  courseTitle,
  variant = "default",
  className,
}: CourseCommunitySectionProps) {
  if (!hasCourseCommunity(links)) return null;

  const compact = variant === "compact";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-brand/15 bg-gradient-to-br from-brand-50 via-white to-sky-50 shadow-sm",
        className,
      )}
      aria-labelledby="course-community-heading"
    >
      <div className={cn("p-6 sm:p-8", compact && "p-5 sm:p-6")}>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-sm">
            <Users className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">
              Community
            </p>
            <h2
              id="course-community-heading"
              className={cn(
                "mt-1 font-display font-bold text-neutral-950",
                compact ? "text-lg" : "text-xl sm:text-2xl",
              )}
            >
              Join your course community
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              Connect with fellow students{courseTitle ? ` in ${courseTitle}` : ""}, ask questions,
              and get updates from your instructor in our private groups.
            </p>
          </div>
        </div>

        <div className={cn("mt-6 grid gap-3", compact ? "sm:grid-cols-1" : "sm:grid-cols-2")}>
          {links.telegramUrl ? (
            <CommunityButton
              href={links.telegramUrl}
              label="Join on Telegram"
              description="Chat, announcements & peer support"
              icon={<Send className="h-5 w-5" aria-hidden />}
              className="bg-[#229ED9] hover:bg-[#1d8fc7]"
            />
          ) : null}
          {links.whatsappUrl ? (
            <CommunityButton
              href={links.whatsappUrl}
              label="Join on WhatsApp"
              description="Group discussions & quick help"
              icon={<MessageCircle className="h-5 w-5" aria-hidden />}
              className="bg-[#25D366] hover:bg-[#20bd5a]"
            />
          ) : null}
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          Links open in a new tab. Use the same name and email as your DigitalSkillX account when
          joining.
        </p>
      </div>
    </section>
  );
}
