"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateSettings, type SettingsState } from "@/app/actions/settings";
import type { Settings } from "@/lib/queries/settings";
import ReminderOffsetPicker from "./ReminderOffsetPicker";

const input =
  "h-11 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand";
const label = "mb-1.5 block text-xs font-semibold text-ink-soft";

export default function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateSettings,
    undefined,
  );
  const [reminderOffsets, setReminderOffsets] = useState<string[]>(settings.reminderOffsets);
  const [selectedTheme, setSelectedTheme] = useState(settings.theme);

  useEffect(() => {
    if (state?.ok) {
      // Aplică tema imediat pe DOM + localStorage ca să nu fie nevoie de reload
      const el = document.documentElement;
      if (selectedTheme === "dark") {
        el.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else if (selectedTheme === "light") {
        el.classList.remove("dark");
        localStorage.setItem("theme", "light");
      } else {
        // system
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) el.classList.add("dark"); else el.classList.remove("dark");
        localStorage.removeItem("theme");
      }
      router.refresh();
    }
  }, [state, router, selectedTheme]);

  return (
    <form action={action} className="card flex flex-col gap-4 p-5">
      <h2 className="text-base font-bold">Preferințe</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Fus orar</label>
          <input name="timezone" defaultValue={settings.timezone} className={input} />
        </div>
        <div>
          <label className={label}>Temă</label>
          <select name="theme" value={selectedTheme} onChange={(e) => setSelectedTheme(e.target.value)} className={input}>
            <option value="system">Sistem</option>
            <option value="light">Luminoasă</option>
            <option value="dark">Întunecată</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>Început zi</label>
          <input type="time" name="workdayStart" defaultValue={settings.workdayStart} className={input} />
        </div>
        <div>
          <label className={label}>Sfârșit zi</label>
          <input type="time" name="workdayEnd" defaultValue={settings.workdayEnd} className={input} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={label}>Slot (min)</label>
          <input type="number" name="slotMinutes" min={0} step="any" inputMode="decimal" defaultValue={settings.slotMinutes} className={input} />
        </div>
      </div>

      <div>
        <label className={label}>Remindere standard (la programări noi)</label>
        <ReminderOffsetPicker
          name="reminderOffsets"
          value={reminderOffsets}
          onChange={setReminderOffsets}
        />
        <p className="mt-1 text-xs text-ink-soft">
          Selecția implicit bifată la o programare nouă — ajustabilă per programare.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="defaultReminderEmail" defaultChecked={settings.defaultReminderEmail} className="size-4 accent-[var(--color-brand)]" />
          Email implicit
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="defaultReminderTelegram" defaultChecked={settings.defaultReminderTelegram} className="size-4 accent-[var(--color-brand)]" />
          Telegram implicit
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Nume expeditor email</label>
          <input name="emailFromName" defaultValue={settings.emailFromName ?? ""} className={input} />
        </div>
        <div>
          <label className={label}>Adresă expeditor</label>
          <input name="emailFromAddr" type="email" defaultValue={settings.emailFromAddr ?? ""} className={input} />
        </div>
      </div>

      {state?.error && <p className="text-sm text-st-cancelled">{state.error}</p>}
      {state?.ok && <p className="text-sm text-st-done">Salvat.</p>}

      <button type="submit" disabled={pending} className="tap h-11 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
        {pending ? "Se salvează…" : "Salvează setările"}
      </button>
    </form>
  );
}
