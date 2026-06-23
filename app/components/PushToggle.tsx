"use client";

import { useEffect, useState } from "react";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    setMsg("");
    try {
      if (!VAPID) throw new Error("Lipsește NEXT_PUBLIC_VAPID_PUBLIC_KEY.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Permisiune refuzată.");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error("Salvarea abonamentului a eșuat.");
      setSubscribed(true);
      setMsg("Notificări activate.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg("Notificări dezactivate.");
    } catch {
      setMsg("Eroare.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    await fetch("/api/push/test", { method: "POST" });
    setMsg("Notificare de test trimisă.");
  }

  return (
    <div className="card p-5">
      <h2 className="mb-1 text-base font-bold">Notificări (PWA)</h2>
      <p className="mb-3 text-sm text-ink-soft">
        {supported
          ? "Primește notificări pe acest dispozitiv."
          : "Acest browser nu suportă notificări push."}
      </p>
      {supported && (
        <div className="flex flex-wrap gap-2">
          {!subscribed ? (
            <button onClick={enable} disabled={busy} className="tap h-11 rounded-xl bg-brand px-4 font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
              {busy ? "…" : "Activează notificările"}
            </button>
          ) : (
            <>
              <button onClick={test} className="tap h-11 rounded-xl bg-[var(--color-surface-2)] px-4 font-medium hover:bg-brand-soft">
                Trimite test
              </button>
              <button onClick={disable} disabled={busy} className="tap h-11 rounded-xl border border-[var(--color-line)] px-4 font-medium text-ink-soft">
                Dezactivează
              </button>
            </>
          )}
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
