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
          placeholder="Search courses"
          className="h-10 w-full border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none"
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
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-4 sm:h-[60px] sm:px-8">
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-neutral-700 hover:text-neutral-950 sm:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <BrandLogo className="shrink-0" />

          <nav className="ml-2 hidden items-center gap-8 sm:flex">
            <Link
              href="/"
              className={cn(
                "text-[13px] font-medium tracking-wide transition",
                homeActive ? "text-neutral-950" : "text-neutral-500 hover:text-neutral-950",
              )}
            >
              Home
            </Link>
            <Link
              href="/browse"
              className={cn(
                "text-[13px] font-medium tracking-wide transition",
                browseActive ? "text-neutral-950" : "text-neutral-500 hover:text-neutral-950",
              )}
            >
              Browse
            </Link>
          </nav>

          <div className="hidden flex-1 justify-end pr-6 md:flex">
            <NavSearch className="w-full max-w-[220px]" />
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <CurrencyToggle className="shrink-0" />

            {user ? (
              <Link
                href="/dashboard"
                className="hidden h-10 items-center px-2 text-[13px] font-medium text-neutral-600 hover:text-neutral-950 sm:inline-flex"
              >
                Dashboard
              </Link>
            ) : (
              <div className="flex items-center gap-1 sm:gap-3">
                <Link
                  href="/login"
                  className="hidden h-10 items-center px-2 text-[13px] font-medium text-neutral-600 hover:text-neutral-950 sm:inline-flex"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="inline-flex h-10 min-w-[96px] items-center justify-center bg-brand px-4 text-[13px] font-semibold text-white transition hover:bg-brand-700 sm:min-w-[120px]"
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
            className="absolute inset-0 bg-neutral-950/50"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute left-0 top-0 flex h-full w-[min(100%,300px)] flex-col bg-white">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-4">
              <BrandLogo onClick={() => setOpen(false)} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center hover:bg-neutral-50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col px-2 py-3">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="px-3 py-3.5 text-sm font-medium text-neutral-800"
              >
                Home
              </Link>
              <Link
                href="/browse"
                onClick={() => setOpen(false)}
                className="px-3 py-3.5 text-sm font-medium text-neutral-800"
              >
                Browse
              </Link>
              {user ? (
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className="px-3 py-3.5 text-sm font-medium text-neutral-800"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="px-3 py-3.5 text-sm font-medium text-neutral-800"
                >
                  Login
                </Link>
              )}
            </nav>
            <div className="border-t border-neutral-200 px-4 py-4">
              <NavSearch />
            </div>
            <div className="mt-auto border-t border-neutral-200 px-4 py-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-400">Currency</p>
              <CurrencyToggle />
              {!user ? (
                <Link
                  href="/register"
                  onClick={() => setOpen(false)}
                  className="mt-4 inline-flex h-12 w-full items-center justify-center bg-brand text-sm font-semibold text-white"
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
    <footer className="border-t border-neutral-200 bg-neutral-50 px-4 py-12 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-[1200px] overflow-x-hidden">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <p className="font-display text-lg font-bold text-neutral-950">
              DigitalSkill<span className="text-brand">X</span>
            </p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-neutral-500">{ORG.tagline}</p>
            <p className="mt-6 text-xs leading-relaxed text-neutral-400">{ORG.footer}</p>
            <p className="mt-1 text-xs text-neutral-400">{ORG.rc}</p>
          </div>
          <div className="lg:col-span-2 lg:col-start-7">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Platform</p>
            <ul className="mt-4 space-y-2.5 text-sm text-neutral-600">
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
          <div className="lg:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Legal</p>
            <ul className="mt-4 space-y-2.5 text-sm text-neutral-600">
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
          <div className="lg:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Support</p>
            <ul className="mt-4 space-y-2.5 text-sm text-neutral-600">
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
        <p className="mt-12 border-t border-neutral-200 pt-6 text-left text-xs text-neutral-400">
          © {new Date().getFullYear()} {ORG.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
