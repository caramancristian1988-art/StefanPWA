import Link from "next/link";
import { requirePermission } from "@/lib/dal";
import { getUserTimezone } from "@/lib/queries/settings";
import { tasksDueBetween, type CalendarTask } from "@/lib/queries/tasks";
import { todayKey, addDaysToKey, humanDay, dayBoundsUtc, dateKeyOf } from "@/lib/date";
import { IconChevronLeft, IconChevronRight } from "@/app/components/icons";

export const dynamic = "force-dynamic";

type View = "month" | "day";
type Status = CalendarTask["status"];

const DOT: Record<Status, string> = {
  NEW: "bg-st-new",
  ASSIGNED: "bg-st-new",
  READ: "bg-st-confirmed",
  IN_PROGRESS: "bg-st-progress",
  ON_HOLD: "bg-st-noshow",
  REVIEW: "bg-st-confirmed",
  DONE: "bg-st-done",
  CANCELLED: "bg-st-cancelled",
};
const ST_RO: Record<Status, string> = {
  NEW: "Nou", ASSIGNED: "Asignat", READ: "Citit", IN_PROGRESS: "În lucru",
  ON_HOLD: "În așteptare", REVIEW: "În verificare", DONE: "Finalizat", CANCELLED: "Anulat",
};
const TYPE_RO = { TASK: "Task", TICKET: "Tichet", WORK_ORDER: "Work order" } as const;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const user = await requirePermission("tasks.view");
  const tz = await getUserTimezone(user.id);
  const sp = await searchParams;
  const view = (["month", "day"].includes(sp.view ?? "") ? sp.view : "month") as View;
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayKey(tz);

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-[var(--color-surface-2)] p-1">
          {(["month", "day"] as View[]).map((v) => (
            <Link
              key={v}
              href={`/calendar?view=${v}&date=${anchor}`}
              prefetch={false}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                view === v ? "bg-brand text-white" : "text-ink-soft"
              }`}
            >
              {v === "month" ? "Lună" : "Zi"}
            </Link>
          ))}
        </div>
        <Link
          href={`/calendar?view=${view}&date=${todayKey(tz)}`}
          prefetch={false}
          className="tap card ml-auto rounded-full px-3.5 py-1.5 text-sm"
        >
          Azi
        </Link>
      </div>

      {view === "month" ? (
        <MonthView userId={user.id} teamIds={user.teamIds} tz={tz} anchor={anchor} />
      ) : (
        <DayView userId={user.id} teamIds={user.teamIds} tz={tz} dateKey={anchor} />
      )}
    </div>
  );
}

async function MonthView({
  userId, teamIds, tz, anchor,
}: { userId: string; teamIds: string[]; tz: string; anchor: string }) {
  const [y, m] = anchor.split("-").map(Number);
  const firstKey = `${y}-${String(m).padStart(2, "0")}-01`;
  const firstDow = (new Date(Date.UTC(y, m - 1, 1, 12)).getUTCDay() + 6) % 7;
  const gridStart = addDaysToKey(firstKey, -firstDow, tz);
  const cells = Array.from({ length: 42 }, (_, i) => addDaysToKey(gridStart, i, tz));

  const from = dayBoundsUtc(cells[0], tz).start;
  const to = dayBoundsUtc(cells[cells.length - 1], tz).end;
  const tasks = await tasksDueBetween({ scope: "mine", userId, teamIds, from, to });

  const byDay = new Map<string, CalendarTask[]>();
  for (const t of tasks) {
    const key = dateKeyOf(t.dueAt, tz);
    const arr = byDay.get(key) ?? [];
    arr.push(t);
    byDay.set(key, arr);
  }

  const today = todayKey(tz);
  const prevMonth = addDaysToKey(firstKey, -1, tz).slice(0, 7) + "-01";
  const nextMonth = addDaysToKey(`${y}-${String(m).padStart(2, "0")}-28`, 7, tz).slice(0, 7) + "-01";
  const monthLabel = new Intl.DateTimeFormat("ro-RO", { timeZone: tz, month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 15)),
  );

  return (
    <div>
      <Nav view="month" prev={prevMonth} next={nextMonth} label={monthLabel} />
      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-ink-soft">
        {["L", "Ma", "Mi", "J", "V", "S", "D"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const inMonth = day.slice(0, 7) === `${y}-${String(m).padStart(2, "0")}`;
          const items = byDay.get(day) ?? [];
          return (
            <Link
              key={day}
              href={`/calendar?view=day&date=${day}`}
              prefetch={false}
              className={`card flex min-h-16 flex-col gap-1 p-1.5 ${inMonth ? "" : "opacity-40"} ${
                day === today ? "ring-2 ring-brand" : ""
              }`}
            >
              <span className={`text-xs tabular-nums ${day === today ? "font-bold text-brand" : "text-ink-soft"}`}>
                {Number(day.slice(8))}
              </span>
              <div className="flex flex-wrap gap-0.5">
                {items.slice(0, 5).map((t) => (
                  <span key={t.id} className={`size-1.5 rounded-full ${DOT[t.status]}`} title={`${t.title} · ${ST_RO[t.status]}`} />
                ))}
              </div>
              {items.length > 0 && (
                <span className="mt-auto text-[10px] font-medium text-ink-soft">{items.length}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

async function DayView({
  userId, teamIds, tz, dateKey,
}: { userId: string; teamIds: string[]; tz: string; dateKey: string }) {
  const { start, end } = dayBoundsUtc(dateKey, tz);
  const tasks = await tasksDueBetween({ scope: "mine", userId, teamIds, from: start, to: end });

  return (
    <div>
      <Nav
        view="day"
        prev={addDaysToKey(dateKey, -1, tz)}
        next={addDaysToKey(dateKey, 1, tz)}
        label={humanDay(dateKey, tz)}
      />
      {tasks.length === 0 ? (
        <div className="card grid place-items-center p-10 text-center text-sm text-ink-soft">
          Niciun task scadent în această zi.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tasks.map((t) => (
            <Link key={t.id} href="/tasks" prefetch={false} className="card flex items-center gap-2.5 px-3 py-2">
              <span className={`size-2.5 shrink-0 rounded-full ${DOT[t.status]}`} title={ST_RO[t.status]} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
              <span className="hidden shrink-0 text-[11px] text-ink-soft sm:inline">{TYPE_RO[t.type]}</span>
              {t.assigneeName && <span className="shrink-0 text-[11px] text-ink-soft">{t.assigneeName}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Nav({ view, prev, next, label }: { view: View; prev: string; next: string; label: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <Link href={`/calendar?view=${view}&date=${prev}`} prefetch={false} className="tap card grid size-9 place-items-center rounded-lg" aria-label="Anterior">
        <IconChevronLeft className="size-4" />
      </Link>
      <span className="text-sm font-semibold capitalize">{label}</span>
      <Link href={`/calendar?view=${view}&date=${next}`} prefetch={false} className="tap card grid size-9 place-items-center rounded-lg" aria-label="Următor">
        <IconChevronRight className="size-4" />
      </Link>
    </div>
  );
}
