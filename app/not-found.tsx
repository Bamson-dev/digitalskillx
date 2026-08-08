import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <p className="font-display text-sm font-semibold text-brand">DigitalSkillX</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-neutral-950">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-sm text-neutral-600">
        This page doesn&apos;t exist, or the course is no longer available.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Go to homepage
        </Link>
        <Link
          href="/browse"
          className="inline-flex h-11 items-center justify-center px-2 text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-950 hover:underline"
        >
          Browse courses
        </Link>
      </div>
    </div>
  );
}
