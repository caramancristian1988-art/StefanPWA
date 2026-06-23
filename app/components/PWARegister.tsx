"use client";

import { useEffect } from "react";

/** Înregistrează service worker-ul (silențios). */
export default function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
