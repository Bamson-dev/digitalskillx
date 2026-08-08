"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Award,
  BookOpen,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { NotificationBell } from "@/components/student/notification-bell";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/courses", label: "My Courses", icon: BookOpen },
  { href: "/certificates", label: "Certificates", icon: Award },
  { href: "/support", label: "Support", icon: HelpCircle },
  { href: "/settings", label: "Account", icon: Settings },
];

export function StudentShell({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const firstName = name.split(" ")[0];
  const classroom = pathname.startsWith("/lessons/");

  const sidebar = (
    <nav className="flex flex-col gap-1 p-3">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex min-h-[44px] items-center gap-3 px-3 text-sm font-medium transition",
              active
                ? "bg-brand text-white"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
      <div className="my-3 border-t border-neutral-200" />
      <Link
        href="/"
        onClick={() => setOpen(false)}
        className="flex min-h-[44px] items-center gap-3 px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
      >
        Browse store
      </Link>
      <form action={signOut} className="mt-1">
        <button
          type="submit"
          className="flex min-h-[44px] w-full items-center gap-3 px-3 text-sm font-medium text-brand hover:bg-brand/5"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </form>
    </nav>
  );

  return (
    <div className={cn("min-h-screen text-neutral-900", classroom ? "bg-white" : "bg-neutral-50")}>
      {/* Mobile header — compact in classroom */}
      <header
        className={cn(
          "sticky top-0 z-30 border-b border-neutral-200 bg-white lg:hidden",
          classroom && "border-neutral-100",
        )}
      >
        <div className={cn("flex items-center justify-between gap-3 px-3", classroom ? "h-12" : "h-14 px-4")}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center text-neutral-800 hover:bg-neutral-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="font-display text-sm font-bold tracking-tight text-neutral-900 sm:text-base">
            {classroom ? "Classroom" : firstName}
          </p>
          <div className="flex items-center gap-1">
            <NotificationBell />
            {!classroom ? (
              <div className="flex h-9 w-9 items-center justify-center bg-brand text-sm font-bold text-white">
                {firstName.charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="w-11" aria-hidden />
            )}
          </div>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-neutral-950/40"
            onClick={() => setOpen(false)}
            aria-label="Close"
          />
          <div className="absolute left-0 top-0 flex h-full w-[min(100%,280px)] flex-col bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <div>
                <p className="font-display font-bold text-brand">DigitalSkillX</p>
                <p className="text-xs text-neutral-500">Learning</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center hover:bg-neutral-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className={cn("mx-auto flex", classroom ? "max-w-[1400px]" : "max-w-7xl")}>
        <aside
          className={cn(
            "hidden shrink-0 border-r border-neutral-200 bg-white lg:block",
            classroom ? "w-52" : "w-60",
          )}
        >
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="border-b border-neutral-200 px-5 py-5">
              <p className="font-display text-lg font-bold tracking-tight">
                DigitalSkill<span className="text-brand">X</span>
              </p>
              <p className="text-xs text-neutral-500">{classroom ? "Classroom" : "Student dashboard"}</p>
            </div>
            <div className="flex-1 overflow-y-auto">{sidebar}</div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {!classroom ? (
            <div className="hidden items-center justify-end border-b border-neutral-200 bg-white px-6 py-4 lg:flex">
              <div className="flex items-center gap-3">
                <NotificationBell />
                <span className="text-sm text-neutral-600">{name}</span>
                <div className="flex h-9 w-9 items-center justify-center bg-brand text-sm font-bold text-white">
                  {firstName.charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          ) : null}

          <main
            className={cn(
              classroom
                ? "px-0 pb-24 pt-0 sm:px-4 sm:pb-10 sm:pt-4 lg:px-6 lg:py-6"
                : "px-4 py-6 sm:px-6 sm:py-8",
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
