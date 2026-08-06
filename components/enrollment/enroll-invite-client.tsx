"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PublicLinkView } from "@/lib/enrollment-links/validation-service";

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string; code?: string }
  | { status: "ready"; view: PublicLinkView & { authenticated?: boolean } }
  | { status: "redeeming" };

function trackFunnel(token: string, event: string) {
  void fetch(`/api/enroll/${encodeURIComponent(token)}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => undefined);
}

export function EnrollInviteClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/enroll/${encodeURIComponent(token)}`);
        const json = (await res.json()) as PublicLinkView & {
          error?: string;
          code?: string;
          authenticated?: boolean;
        };
        if (!res.ok) {
          if (!cancelled) {
            setState({
              status: "error",
              message: json.error ?? "This invite is unavailable.",
              code: json.code,
            });
          }
          return;
        }
        if (!cancelled) {
          setState({ status: "ready", view: json });
        }

        if (json.authenticated) {
          if (!cancelled) setState({ status: "redeeming" });
          const redeem = await fetch(`/api/enroll/${encodeURIComponent(token)}`, {
            method: "POST",
          });
          const redeemJson = (await redeem.json()) as {
            error?: string;
            redirectTo?: string;
          };
          if (!redeem.ok) {
            if (!cancelled) {
              setState({
                status: "error",
                message: redeemJson.error ?? "Could not complete enrollment.",
              });
            }
            return;
          }
          router.replace(redeemJson.redirectTo ?? "/dashboard");
        }
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Something went wrong. Please try again.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  const nextPath = `/enroll/${encodeURIComponent(token)}`;

  if (state.status === "loading" || state.status === "redeeming") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center" role="status" aria-live="polite">
        <span
          className="mx-auto mb-3 inline-block h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent"
          aria-hidden
        />
        <p className="text-sm text-muted">
          {state.status === "redeeming" ? "Enrolling you…" : "Loading your invite…"}
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Unable to continue</h1>
        <p className="mt-3 text-muted">{state.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/">
            <Button variant="outline">Back to home</Button>
          </Link>
          <Link href="/support">
            <Button variant="ghost">Contact support</Button>
          </Link>
        </div>
      </div>
    );
  }

  const { view } = state;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="text-center">
        <p className="text-sm font-medium text-brand">You&apos;re invited</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          {view.name || "Start learning"}
        </h1>
        {view.description ? (
          <p className="mx-auto mt-3 max-w-xl text-muted">{view.description}</p>
        ) : (
          <p className="mx-auto mt-3 max-w-xl text-muted">
            Create an account or log in to get access to your course
            {view.courses.length === 1 ? "" : "s"}.
          </p>
        )}
      </div>

      <div className="mt-10 space-y-4">
        {view.courses.length === 0 ? (
          <p className="rounded-xl border border-dashed border-app bg-white px-4 py-8 text-center text-sm text-muted">
            No courses are attached to this invite. Please contact support.
          </p>
        ) : (
          view.courses.map((course) => (
            <div
              key={course.id}
              className="flex gap-4 rounded-2xl border border-app bg-white p-4 shadow-sm"
            >
              <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
                {course.thumbnailUrl ? (
                  <Image
                    src={course.thumbnailUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="112px"
                    unoptimized
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{course.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-muted">
                  {course.description || `${course.lessonCount} lessons`}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={`/register?next=${encodeURIComponent(nextPath)}`}
          onClick={() => trackFunnel(token, "registration_started")}
        >
          <Button size="lg">Create account</Button>
        </Link>
        <Link
          href={`/login?next=${encodeURIComponent(nextPath)}`}
          onClick={() => trackFunnel(token, "login_started")}
        >
          <Button size="lg" variant="outline">
            Log in
          </Button>
        </Link>
      </div>
    </div>
  );
}
