"use client";

import { useState, useTransition } from "react";
import { saveTicketStatusConfig } from "@/app/actions/settings";
import { DEFAULT_STATUS_CONFIGS, type StatusConfig } from "@/lib/ticket-status-config";
import { useToast } from "./toast";

export default function TicketStatusConfigEditor({
  initial,
}: {
  initial: StatusConfig[];
}) {
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [configs, setConfigs] = useState<StatusConfig[]>(initial);

  function update(key: string, field: keyof StatusConfig, value: unknown) {
    setConfigs((prev) =>
      prev.map((c) => (c.key === key ? { ...c, [field]: value } : c)),
    );
  }

  function save() {
    startTransition(async () => {
      const res = await saveTicketStatusConfig(configs);
      if (res?.error) toast.error(res.error);
      else toast.success("Configurare statusuri salvată.");
    });
  }

  function reset() {
    setConfigs(DEFAULT_STATUS_CONFIGS);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-2 items-center text-xs font-semibold text-muted uppercase tracking-wide px-1">
        <span>Status</span>
        <span className="text-center">Culoare</span>
        <span className="text-center whitespace-nowrap">Notif. la intrare</span>
        <span className="text-center whitespace-nowrap">Oprește notif.</span>
      </div>

      {configs.map((cfg) => (
        <div
          key={cfg.key}
          className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 items-center bg-card border border-border rounded-xl px-4 py-3"
        >
          {/* Label */}
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
              style={{ background: cfg.color }}
            />
            <input
              type="text"
              value={cfg.label}
              onChange={(e) => update(cfg.key, "label", e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm font-medium focus:outline-none border-b border-transparent hover:border-border focus:border-brand transition-colors"
            />
            <span className="text-xs text-muted/60 font-mono">{cfg.key}</span>
          </div>

          {/* Color picker */}
          <label className="relative cursor-pointer" title="Schimbă culoarea">
            <span
              className="flex h-7 w-7 rounded-full border-2 border-border shadow-sm"
              style={{ background: cfg.color }}
            />
            <input
              type="color"
              value={cfg.color}
              onChange={(e) => update(cfg.key, "color", e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
          </label>

          {/* notifyOnEnter toggle */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => update(cfg.key, "notifyOnEnter", !cfg.notifyOnEnter)}
              title={cfg.notifyOnEnter ? "Notificări active la intrare" : "Fără notificări la intrare"}
              className={[
                "h-6 w-11 rounded-full transition-colors relative",
                cfg.notifyOnEnter ? "bg-brand" : "bg-muted/30",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  cfg.notifyOnEnter ? "translate-x-5" : "translate-x-0.5",
                ].join(" ")}
              />
            </button>
          </div>

          {/* suppressAll toggle */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => update(cfg.key, "suppressAll", !cfg.suppressAll)}
              title={cfg.suppressAll ? "Notificările sunt oprite" : "Notificările sunt active"}
              className={[
                "h-6 w-11 rounded-full transition-colors relative",
                cfg.suppressAll ? "bg-st-cancelled" : "bg-muted/30",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  cfg.suppressAll ? "translate-x-5" : "translate-x-0.5",
                ].join(" ")}
              />
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={reset}
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          Resetează la default
        </button>
        <button
          type="button"
          onClick={save}
          className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/90 transition-colors"
        >
          Salvează
        </button>
      </div>

      <p className="text-xs text-muted/70 pt-1">
        <strong>Notif. la intrare</strong> — trimite notificare Telegram/push staff când tichetul
        intră în acest status. &nbsp;|&nbsp;
        <strong>Oprește notif.</strong> — nu mai trimite alte notificări (reamintiri, întârzieri)
        când tichetul e în acest status.
      </p>
    </div>
  );
}
