"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { ORG } from "@/lib/org";
import { BrandLogo } from "@/components/marketplace/brand-logo";
import { CurrencyToggle } from "@/components/marketplace/currency-toggle";
import { cn } from "@/lib/utils";

type NavUser = { email: string; full_name: string | null } | null;

export function MarketplaceNav({
  user,
  role,
}: {
  user: NavUser;
  role?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const homeActive = pathname === "/";
  const browseActive = pathname.startsWith("/course");

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-surface-border bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-4 sm:px-6">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100 sm:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <BrandLogo className="shrink-0" />

          <nav className="ml-1 hidden items-center gap-6 sm:ml-2 sm:flex">
            <Link
              href="/"
              className={cn(
                "text-sm font-medium transition",
                homeActive ? "border-b-2 border-brand pb-0.5 text-neutral-900" : "text-neutral-500 hover:text-neutral-900",
              )}
            >
              Home
            </Link>
            <Link
              href="/#courses"
              className={cn(
                "text-sm font-medium transition",
                browseActive ? "border-b-2 border-brand pb-0.5 text-neutral-900" : "text-neutral-500 hover:text-neutral-900",
              )}
            >
              Browse
            </Link>
          </nav>

          <div className="hidden flex-1 justify-center md:flex">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                placeholder="Search courses…"
                className="h-10 w-full rounded-lg border border-surface-border bg-surface-muted pl-9 pr-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                readOnly
                aria-label="Search courses"
              />
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <CurrencyToggle className="shrink-0" />

            {user ? (
              <div className="flex items-center gap-1 sm:gap-2">
                {role === "admin" ? (
                  <Link
                    href="/admin/dashboard"
                    className="hidden rounded-lg px-2 py-2 text-sm text-neutral-500 hover:text-neutral-900 sm:inline-flex"
                  >
                    Admin
                  </Link>
                ) : null}
                <Link
                  href="/dashboard"
                  className="inline-flex h-9 items-center rounded-lg px-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 sm:px-3"
                >
                  Dashboard
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-1 sm:gap-2">
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center rounded-lg px-2 text-sm font-medium text-neutral-800 hover:text-neutral-900 sm:px-3"
                >
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-9 min-w-[100px] items-center justify-center rounded-lg bg-brand px-3 text-sm font-semibold text-white transition hover:bg-brand-700 sm:h-10 sm:min-w-[130px] sm:px-4"
                >
                  Create Account
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-[60] sm:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute left-0 top-0 flex h-full w-[min(100%,300px)] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
              <BrandLogo onClick={() => setOpen(false)} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-neutral-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3">
              <Link href="/" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                Home
              </Link>
              <Link href="/#courses" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                Browse courses
              </Link>
              {user ? (
                <Link href="/dashboard" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setOpen(false)}
                    className="mt-2 inline-flex h-12 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white"
                  >
                    Create Account
                  </Link>
                </>
              )}
            </nav>
            <div className="mt-auto border-t border-surface-border p-4">
              <p className="mb-2 text-xs text-neutral-500">Currency</p>
              <CurrencyToggle />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function MarketplaceFooter() {
  return (
    <footer className="border-t border-surface-border bg-surface-muted px-4 py-10 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="font-display text-lg font-bold text-neutral-900">
              DigitalSkill<span className="text-brand">X</span>
            </p>
            <p className="mt-2 max-w-xs text-sm text-neutral-500">{ORG.tagline}</p>
            <p className="mt-4 text-xs text-neutral-400">{ORG.footer} · {ORG.rc}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Company</p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-500">
              <li><Link href="/about" className="hover:text-neutral-900">About Us</Link></li>
              <li><Link href="/about" className="hover:text-neutral-900">Contact</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Legal</p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-500">
              <li><Link href="/privacy" className="hover:text-neutral-900">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-neutral-900">Terms of Service</Link></li>
              <li><Link href="/refund-policy" className="hover:text-neutral-900">Refund Policy</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Support</p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-500">
              <li>
                <Link href="/login?next=/support" className="hover:text-neutral-900">
                  Need help?
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
