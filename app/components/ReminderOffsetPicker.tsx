"use client";

import { REMINDER_PRESETS } from "@/lib/reminder-presets";

const chip =
  "tap rounded-full px-3.5 py-2 text-sm font-medium border border-[var(--color-line)]";

export default function ReminderOffsetPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(key: string) {
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  }

  return (
    <>
      {value.map((p) => (
        <input key={p} type="hidden" name={name} value={p} />
      ))}
      <div className="flex flex-wrap gap-2">
        {REMINDER_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => toggle(p.key)}
            className={`${chip} ${value.includes(p.key) ? "bg-brand text-white" : ""}`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </>
  );
}
