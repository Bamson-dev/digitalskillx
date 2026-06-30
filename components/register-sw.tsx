"use client";

import { useEffect } from "react";

/** Registers the PWA service worker on the client (PRD §17). */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
