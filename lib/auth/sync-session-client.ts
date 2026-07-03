type SessionTokens = {
  access_token: string;
  refresh_token: string;
};

/** Write Supabase session cookies on the server before a full-page redirect. */
export async function syncSessionToServer(session: SessionTokens) {
  const res = await fetch("/api/auth/sync-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not sync session.");
  }
}

export async function syncSessionAndRedirect(session: SessionTokens, destination: string) {
  await syncSessionToServer(session);
  window.location.replace(destination);
}
