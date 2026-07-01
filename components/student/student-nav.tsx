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
    <header className="sticky top-0 z-20 border-b border-surface-border bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/dashboard" className="font-display text-lg font-bold tracking-tight text-white">
          Digital<span className="text-brand">SkillX</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active ? "bg-brand/10 text-brand" : "text-neutral-400 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="hidden text-xs text-neutral-500 hover:text-white sm:inline"
          >
            Store
          </Link>
          <NotificationBell />
          <span className="hidden text-sm text-neutral-500 md:inline">{name}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-900 hover:text-white"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
