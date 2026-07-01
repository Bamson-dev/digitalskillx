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
import { CurrencyToggle } from "@/components/marketplace/currency-toggle";
import { NotificationBell } from "@/components/student/notification-bell";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/courses", label: "My Courses", icon: BookOpen },
  { href: "/certificates", label: "Certificates", icon: Award },
  { href: "/support", label: "Need help?", icon: HelpCircle },
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
              "flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
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
      <Link
        href="/support"
        onClick={() => setOpen(false)}
        className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
      >
        Need help?
      </Link>
      <Link
        href="/settings"
        onClick={() => setOpen(false)}
        className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
      >
        Account &amp; privacy
      </Link>
      <div className="my-3 border-t border-surface-border" />
      <Link
        href="/"
        onClick={() => setOpen(false)}
        className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
      >
        Browse store
      </Link>
      <form action={signOut} className="mt-1">
        <button
          type="submit"
          className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-brand hover:bg-brand/5"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </form>
    </nav>
  );

  return (
    <div className="min-h-screen bg-surface-muted text-neutral-900">
      {/* Mobile header */}
      <header className="sticky top-0 z-30 border-b border-surface-border bg-white lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-neutral-100"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <p className="font-display text-base font-bold">{firstName}</p>
          <div className="flex items-center gap-1">
            <CurrencyToggle />
            <NotificationBell />
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
              {firstName.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-label="Close" />
          <div className="absolute left-0 top-0 flex h-full w-[min(100%,280px)] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
              <div>
                <p className="font-display font-bold">DigitalSkillX</p>
                <p className="text-xs text-neutral-500">Student dashboard</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-neutral-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-surface-border bg-white lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="border-b border-surface-border px-5 py-5">
              <p className="font-display text-lg font-bold">DigitalSkillX</p>
              <p className="text-xs text-neutral-500">Student dashboard</p>
            </div>
            <div className="flex-1 overflow-y-auto">{sidebar}</div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Desktop top bar */}
          <div className="hidden items-center justify-between border-b border-surface-border bg-white px-6 py-4 lg:flex">
            <div />
            <div className="flex items-center gap-3">
              <CurrencyToggle />
              <NotificationBell />
              <span className="text-sm text-neutral-600">{name}</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
                {firstName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>

          <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
