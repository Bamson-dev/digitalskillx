"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteAccountButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (
      !window.confirm(
        "This permanently deletes your account and personal data. Anonymized purchase records are retained. Continue?",
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/student/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Deletion failed");
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-70"
      >
        {loading ? "Deleting…" : "Delete my account"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
