"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Award, LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { NotificationBell } from "@/components/student/notification-bell";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/courses", label: "My Courses", icon: BookOpen },
  { href: "/certificates", label: "Certificates", icon: Award },
];

export function StudentNav({ name }: { name: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-app bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/dashboard" className="font-bold tracking-tight text-brand">
          DigitalSkillX
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-muted hover:bg-brand-50 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <span className="hidden text-sm text-muted md:inline">{name}</span>
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sign out"
              className="rounded-lg p-2 text-muted hover:bg-brand-50"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>

      <nav className="flex items-center justify-around border-t border-app px-2 py-1 sm:hidden">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs font-medium",
                active ? "text-brand-700" : "text-muted",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
