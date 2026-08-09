"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Link2,
  BarChart3,
  Settings,
  ClipboardList,
  CheckSquare,
  Zap,
  Megaphone,
  ShoppingBag,
  Briefcase,
  UsersRound,
  Package,
  Tag,
  Percent,
  AlertTriangle,
  Activity,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { signOutAdmin } from "@/app/(admin)/admin/actions";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const primaryNav: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/courses", label: "Courses", icon: BookOpen },
  { href: "/admin/students", label: "Customers", icon: Users },
  { href: "/admin/enrollment-links", label: "Enrollment Links", icon: Link2 },
];

const teachingNav: NavItem[] = [
  { href: "/admin/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/admin/grading", label: "Grading", icon: CheckSquare },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
];

const insightsNav: NavItem[] = [
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/sales", label: "Sales", icon: ShoppingBag },
  { href: "/admin/offers", label: "Offers", icon: Percent },
  { href: "/admin/digital-products", label: "Digital products", icon: Tag },
  { href: "/admin/business", label: "Business", icon: Briefcase },
  { href: "/admin/segments", label: "Segments", icon: UsersRound },
  { href: "/admin/bundles", label: "Bundles", icon: Package },
];

const advancedNav: NavItem[] = [
  { href: "/admin/system-health", label: "System health", icon: Activity },
  { href: "/admin/broken-lessons", label: "Broken lessons", icon: AlertTriangle },
  { href: "/admin/automations", label: "Automations", icon: Zap },
];

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex min-h-[40px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-brand text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  onNavigate,
  muted,
}: {
  label?: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  muted?: boolean;
}) {
  return (
    <div className={cn("space-y-1", muted && "opacity-90")}>
      {label ? (
        <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
      ) : null}
      {items.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </div>
  );
}

function SidebarBody({
  adminName,
  pathname,
  onNavigate,
}: {
  adminName: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="px-5 py-5">
        <span className="text-lg font-bold tracking-tight text-brand-400">
          DigitalSkillX <span className="font-normal text-white/70">Admin</span>
        </span>
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        <NavGroup items={primaryNav} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup label="Teaching" items={teachingNav} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup label="Insights" items={insightsNav} pathname={pathname} onNavigate={onNavigate} />
        <NavGroup
          label="Advanced"
          items={advancedNav}
          pathname={pathname}
          onNavigate={onNavigate}
          muted
        />
        <div className="pt-2">
          <NavLink
            item={{ href: "/admin/settings", label: "Settings", icon: Settings }}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        </div>
      </nav>

      <div className="border-t border-slate-800 p-3">
        <div className="mb-2 px-2 text-xs text-slate-500">
          Signed in as
          <div className="truncate text-sm font-medium text-slate-300">{adminName}</div>
        </div>
        <form action={signOutAdmin}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-900 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

export function AdminShell({
  adminName,
  children,
}: {
  adminName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-brand-50/40">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 text-white lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-slate-900"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-brand-400">DigitalSkillX Admin</span>
        <span className="w-11" aria-hidden />
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <aside className="absolute left-0 top-0 flex h-full w-[min(100%,280px)] flex-col bg-slate-950 text-slate-200 shadow-xl">
            <div className="flex items-center justify-end px-3 pt-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-900"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarBody
              adminName={adminName}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-200 lg:flex">
          <SidebarBody adminName={adminName} pathname={pathname} />
        </aside>
        <main className="min-w-0 flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** @deprecated Prefer AdminShell — kept for any deep imports during transition. */
export function AdminSidebar({ adminName }: { adminName: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950 text-slate-200">
      <SidebarBody adminName={adminName} pathname={pathname} />
    </aside>
  );
}
