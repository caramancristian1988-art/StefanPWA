"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ITEMS = [
  { label: "Task nou", href: "/tasks?create=task" },
  { label: "Tichet nou", href: "/tasks?create=ticket" },
  { label: "Proiect nou", href: "/projects?create=1" },
  { label: "Client nou", href: "/clients?create=1" },
];

export default function CreateMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div ref={ref} className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-5 z-40 lg:bottom-6">
      {open && (
        <div className="absolute bottom-16 right-0 w-44 overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-xl">
          {ITEMS.map((it) => (
            <button
              key={it.href}
              onClick={() => go(it.href)}
              className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-[var(--color-surface-2)]"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="tap grid size-14 place-items-center rounded-full bg-brand text-white shadow-xl shadow-brand/30"
        aria-label="Creează"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`transition-transform ${open ? "rotate-45" : ""}`}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
