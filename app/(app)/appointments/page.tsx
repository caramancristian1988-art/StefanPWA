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
import AppointmentsControls from "@/app/components/AppointmentsControls";
import OpenQuickAddButton from "@/app/components/OpenQuickAddButton";
import ExportButton from "@/app/components/ExportButton";
import AutoOpenQuickAdd from "@/app/components/AutoOpenQuickAdd";
import { QuickAddProvider } from "@/app/components/quick-add-context";
import type { ApptVM } from "@/app/components/types";
import type { AppointmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["NEW", "CONFIRMED", "IN_PROGRESS", "DONE", "CANCELLED", "NO_SHOW"]);

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; create?: string; q?: string; status?: string; category?: string }>;
}) {
  const user = await requirePermission("appointments.view");
  const [settings, categories] = await Promise.all([
    getSettings(user.id),
    listCategories(),
  ]);
  const tz = settings.timezone;
  const { view = "azi", create, q, status, category } = await searchParams;

  const filter = {
    search: q?.trim() || undefined,
    status: (status && VALID_STATUSES.has(status) ? status : undefined) as AppointmentStatus | undefined,
    categoryId: category || undefined,
  };

  const today = todayKey(tz);
  const tomorrow = tomorrowKey(tz);
  let items: ApptVM[] = [];
  let grouped = false;

  if (view === "maine") {
    items = (await listByDateKey(user.id, tomorrow, filter)).map((a) => toVM(a, tz));
  } else if (view === "saptamana") {
    items = (await listByDateKeys(user.id, weekKeys(today, tz), filter)).map((a) => toVM(a, tz));
    grouped = true;
  } else if (view === "lista") {
    const keys = Array.from({ length: 14 }, (_, i) => addDaysToKey(today, i, tz));
    items = (await listByDateKeys(user.id, keys, filter)).map((a) => toVM(a, tz));
    grouped = true;
  } else {
    items = (await listByDateKey(user.id, today, filter)).map((a) => toVM(a, tz));
  }

  const quickDefaults = {
    today,
    tomorrow,
    slotMinutes: settings.slotMinutes,
    reminderEmail: settings.defaultReminderEmail,
    reminderTelegram: settings.defaultReminderTelegram,
    reminderOffsets: settings.reminderOffsets,
  };

  return (
    <QuickAddProvider categories={categories} defaults={quickDefaults}>
      {create === "1" && <AutoOpenQuickAdd />}
      <div className="w-full">
        <AppointmentsControls categories={categories} />

        <div className="mb-4 flex items-center gap-2">
          <OpenQuickAddButton />
          <ExportButton
            entity="appointments"
            params={{
              view: view !== "azi" ? view : undefined,
              q: q || undefined,
              status: status || undefined,
              category: category || undefined,
            }}
            className="tap h-10 shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-3 text-sm text-ink-soft hover:bg-[var(--color-surface-2)]"
          />
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
