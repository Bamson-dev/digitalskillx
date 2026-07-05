"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { ORG } from "@/lib/org";
import { BrandLogo } from "@/components/marketplace/brand-logo";
import { CurrencyToggle } from "@/components/marketplace/currency-toggle";
import { cn } from "@/lib/utils";

type NavUser = { email: string; full_name: string | null } | null;

function NavSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses…"
          className="h-10 w-full rounded-lg border border-surface-border bg-surface-muted pl-9 pr-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          aria-label="Search courses"
        />
      </div>
    </form>
  );
}

export function MarketplaceNav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const homeActive = pathname === "/";
  const browseActive = pathname === "/browse" || pathname.startsWith("/course");

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-surface-border bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:h-16 sm:gap-4 sm:px-6">
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100 sm:hidden"
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
                homeActive
                  ? "border-b-2 border-brand pb-0.5 text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900",
              )}
            >
              Home
            </Link>
            <Link
              href="/browse"
              className={cn(
                "text-sm font-medium transition",
                browseActive
                  ? "border-b-2 border-brand pb-0.5 text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-900",
              )}
            >
              Browse
            </Link>
          </nav>

          <div className="hidden flex-1 justify-center md:flex">
            <NavSearch className="w-full max-w-xs" />
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <CurrencyToggle className="shrink-0" />

            {user ? (
              <Link
                href="/dashboard"
                className="hidden h-10 items-center rounded-lg px-3 text-sm font-medium text-neutral-700 hover:text-neutral-900 sm:inline-flex"
              >
                Dashboard
              </Link>
            ) : (
              <div className="flex items-center gap-1 sm:gap-2">
                <Link
                  href="/login"
                  className="hidden h-10 items-center rounded-lg px-3 text-sm font-medium text-neutral-800 hover:text-neutral-900 sm:inline-flex"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-10 min-w-[100px] items-center justify-center rounded-lg bg-brand px-3 text-sm font-semibold text-white transition hover:bg-brand-700 sm:min-w-[130px] sm:px-4"
                >
                  Get Started
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
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-neutral-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Home
              </Link>
              <Link
                href="/browse"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Browse
              </Link>
              {user ? (
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                >
                  Login
                </Link>
              )}
            </nav>
            <div className="border-t border-surface-border p-4">
              <p className="mb-2 text-xs text-neutral-500">Search</p>
              <NavSearch />
            </div>
            <div className="mt-auto border-t border-surface-border p-4">
              <p className="mb-2 text-xs text-neutral-500">Currency</p>
              <CurrencyToggle />
              {!user ? (
                <Link
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white"
                >
                  Get Started
                </Link>
              ) : null}
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
      <div className="mx-auto max-w-6xl overflow-x-hidden">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <p className="font-display text-lg font-bold text-neutral-900">
              DigitalSkill<span className="text-brand">X</span>
            </p>
            <p className="mt-2 max-w-xs text-sm text-neutral-500">{ORG.tagline}</p>
            <p className="mt-4 text-xs text-neutral-400">
              {ORG.footer}
            </p>
            <p className="mt-1 text-xs text-neutral-400">{ORG.rc}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Platform</p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-500">
              <li>
                <Link href="/" className="hover:text-brand">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/browse" className="hover:text-brand">
                  Browse Courses
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-brand">
                  About Us
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Legal</p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-500">
              <li>
                <Link href="/privacy" className="hover:text-brand">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-brand">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="hover:text-brand">
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-900">Support</p>
            <ul className="mt-3 space-y-2 text-sm text-neutral-500">
              <li>
                <Link href="/login?next=/support" className="hover:text-brand">
                  Need help?
                </Link>
              </li>
              <li>
                <Link href="/about" className="hover:text-brand">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-10 border-t border-surface-border pt-6 text-center text-xs text-neutral-400">
          © {new Date().getFullYear()} {ORG.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
