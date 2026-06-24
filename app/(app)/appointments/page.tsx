import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { getSettings } from "@/lib/queries/settings";
import { listCategories } from "@/lib/queries/categories";
import { listByDateKey, listByDateKeys } from "@/lib/queries/appointments";
import {
  todayKey,
  tomorrowKey,
  weekKeys,
  addDaysToKey,
  humanDay,
} from "@/lib/date";
import { toVM } from "@/lib/view";
import AppointmentItem from "@/app/components/AppointmentItem";
import OpenQuickAddButton from "@/app/components/OpenQuickAddButton";
import { QuickAddProvider } from "@/app/components/quick-add-context";
import type { ApptVM } from "@/app/components/types";

export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "azi", label: "Azi" },
  { key: "maine", label: "Mâine" },
  { key: "saptamana", label: "Săptămâna" },
  { key: "lista", label: "Listă" },
] as const;

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requirePermission("appointments.view");
  const [settings, categories] = await Promise.all([
    getSettings(user.id),
    listCategories(),
  ]);
  const tz = settings.timezone;
  const { view = "azi" } = await searchParams;

  const today = todayKey(tz);
  const tomorrow = tomorrowKey(tz);
  let items: ApptVM[] = [];
  let grouped = false;

  if (view === "maine") {
    items = (await listByDateKey(user.id, tomorrow)).map((a) => toVM(a, tz));
  } else if (view === "saptamana") {
    items = (await listByDateKeys(user.id, weekKeys(today, tz))).map((a) => toVM(a, tz));
    grouped = true;
  } else if (view === "lista") {
    const keys = Array.from({ length: 14 }, (_, i) => addDaysToKey(today, i, tz));
    items = (await listByDateKeys(user.id, keys)).map((a) => toVM(a, tz));
    grouped = true;
  } else {
    items = (await listByDateKey(user.id, today)).map((a) => toVM(a, tz));
  }

  const quickDefaults = {
    today,
    tomorrow,
    slotMinutes: settings.slotMinutes,
    reminderEmail: settings.defaultReminderEmail,
    reminderTelegram: settings.defaultReminderTelegram,
  };

  return (
    <QuickAddProvider categories={categories} defaults={quickDefaults}>
      <div className="w-full">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/appointments?view=${v.key}`}
              className={`tap shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                view === v.key
                  ? "bg-brand text-white"
                  : "card text-ink-soft"
              }`}
            >
              {v.label}
            </Link>
          ))}
        </div>

        <div className="mb-4">
          <OpenQuickAddButton />
        </div>

        {items.length === 0 ? (
          <Empty />
        ) : grouped ? (
          <GroupedList items={items} tz={tz} today={today} />
        ) : (
          <div className="flex flex-col gap-2.5">
            {items.map((a) => (
              <AppointmentItem key={a.id} appt={a} />
            ))}
          </div>
        )}
      </div>
    </QuickAddProvider>
  );
}

function GroupedList({
  items,
  tz,
  today,
}: {
  items: ApptVM[];
  tz: string;
  today: string;
}) {
  const byDay = new Map<string, ApptVM[]>();
  for (const it of items) {
    const arr = byDay.get(it.dateKey) ?? [];
    arr.push(it);
    byDay.set(it.dateKey, arr);
  }
  const days = [...byDay.keys()].sort();

  return (
    <div className="flex flex-col gap-5">
      {days.map((day) => (
        <section key={day}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft capitalize">
            {day === today ? "Azi · " : ""}
            {humanDay(day, tz)}
          </h3>
          <div className="flex flex-col gap-2.5">
            {byDay.get(day)!.map((a) => (
              <AppointmentItem key={a.id} appt={a} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="card grid place-items-center p-10 text-center text-sm text-ink-soft">
      Nicio programare în acest interval.
    </div>
  );
}
