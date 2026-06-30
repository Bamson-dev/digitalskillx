import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ORG } from "@/lib/org";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Send authenticated users straight to their workspace.
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    redirect(profile?.role === "admin" ? "/admin/dashboard" : "/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight text-brand">
          DigitalSkillX
        </span>
        <nav className="flex items-center gap-3 text-sm font-medium">
          <Link href="/login" className="text-muted hover:text-foreground">
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-brand px-4 py-2 text-white hover:bg-brand-700"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          {ORG.tagline}
        </span>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Learn at your pace. Earn certificates that prove it.
        </h1>
        <p className="mt-5 max-w-xl text-balance text-lg text-muted">
          Structured, self-paced access to every DigitalSkillX course — with
          progress tracking, quizzes, and verifiable certificates.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-700"
          >
            Create your account
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-app px-6 py-3 font-semibold hover:bg-brand-50"
          >
            I already have an account
          </Link>
        </div>
      </section>

      <footer className="px-6 py-6 text-center text-xs text-muted">
        {ORG.footer} · {ORG.rc} · {ORG.location}
      </footer>
    </main>
  );
}
