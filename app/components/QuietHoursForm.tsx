"use client";

import { useActionState, useEffect } from "react";
import { updateQuietHours, type SettingsState } from "@/app/actions/settings";
import type { QuietHoursConfig } from "@/lib/quiet-hours";
import { useToast } from "./toast";

const inp =
  "h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand";

export default function QuietHoursForm({
  config,
  canEdit,
}: {
  config: QuietHoursConfig;
  canEdit: boolean;
}) {
  const toast = useToast();
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateQuietHours,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) toast.success("Ore de somn actualizate");
    else if (state?.error) toast.error(state.error);
  }, [state, toast]);

  return (
    <div className="card flex flex-col gap-4 p-5">
      <div>
        <h2 className="text-base font-bold">Ore de somn</h2>
        <p className="text-sm text-ink-soft">
          În intervalul configurat, botul Telegram nu răspunde și reminderele sunt suspendate.
        </p>
      </div>

      {!canEdit ? (
        <div className="rounded-xl border border-[var(--color-line)] px-4 py-3 text-sm">
          {config.quietHoursEnabled ? (
            <p>
              Activ:{" "}
              <b>
                {config.quietHoursStart} – {config.quietHoursEnd}
              </b>{" "}
              ({config.quietHoursTz})
            </p>
          ) : (
            <p className="text-ink-soft">Dezactivat.</p>
          )}
          <p className="mt-1 text-xs text-ink-soft">Doar super-administratorul poate modifica.</p>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="quietHoursEnabled"
              defaultChecked={config.quietHoursEnabled}
              className="size-4 rounded accent-brand"
            />
            Activează orele de somn
          </label>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink-soft">De la</span>
              <input
                type="time"
                name="quietHoursStart"
                defaultValue={config.quietHoursStart}
                required
                className={inp}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink-soft">Până la</span>
              <input
                type="time"
                name="quietHoursEnd"
                defaultValue={config.quietHoursEnd}
                required
                className={inp}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-48">
              <span className="text-xs text-ink-soft">Fus orar</span>
              <input
                type="text"
                name="quietHoursTz"
                defaultValue={config.quietHoursTz}
                placeholder="Europe/Bucharest"
                className={inp}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="tap self-start h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
          >
            Salvează
          </button>
        </form>
      )}
    </div>
  );
}
