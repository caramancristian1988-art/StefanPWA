"use client";

import { useState, useTransition, useRef } from "react";
import AppointmentItem from "./AppointmentItem";
import OpenQuickAddButton from "./OpenQuickAddButton";
import ExportButton from "./ExportButton";
import ImportButton from "./ImportButton";
import AutoOpenQuickAdd from "./AutoOpenQuickAdd";
import { QuickAddProvider } from "./quick-add-context";
import { humanDay } from "@/lib/date";
import { listAppointmentsAction } from "@/app/actions/appointments";
import type { ApptVM, CategoryLite, QuickDefaults } from "./types";

const VIEWS = [
  { key: "azi", label: "Azi" },
  { key: "maine", label: "Mâine" },
  { key: "saptamana", label: "Săptămâna" },
  { key: "lista", label: "Listă" },
] as const;

const STATUSES = [
  { value: "NEW", label: "Nou" },
  { value: "CONFIRMED", label: "Confirmat" },
  { value: "IN_PROGRESS", label: "În lucru" },
  { value: "DONE", label: "Finalizat" },
  { value: "CANCELLED", label: "Anulat" },
  { value: "NO_SHOW", label: "Nu a venit" },
];

const fldCls = (val: string) =>
  `h-9 appearance-none sel-arrow rounded-lg border pl-2 pr-7 text-xs outline-none focus:border-brand ${
    val
      ? "border-brand bg-brand/10 font-semibold text-brand"
      : "border-[var(--color-line)] bg-[var(--color-surface)] text-ink"
  }`;

export default function AppointmentsManager({
  initialItems,
  initialView,
  initialQ,
  initialStatus,
  initialCategory,
  initialGrouped,
  categories,
  quickDefaults,
  initialCreate,
  today,
  tz,
}: {
  initialItems: ApptVM[];
  initialView: string;
  initialQ: string;
  initialStatus: string;
  initialCategory: string;
  initialGrouped: boolean;
  categories: CategoryLite[];
  quickDefaults: QuickDefaults;
  initialCreate?: boolean;
  today: string;
  tz: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [grouped, setGrouped] = useState(initialGrouped);
  const [localView, setLocalView] = useState(initialView || "azi");
  const [localQ, setLocalQ] = useState(initialQ);
  const [localStatus, setLocalStatus] = useState(initialStatus);
  const [localCategory, setLocalCategory] = useState(initialCategory);
  const [pending, startNav] = useTransition();
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applyFilter(patch: Partial<{ view: string; q: string; status: string; category: string }>) {
    const newView = patch.view !== undefined ? patch.view : localView;
    const newQ = patch.q !== undefined ? patch.q : localQ;
    const newStatus = patch.status !== undefined ? patch.status : localStatus;
    const newCategory = patch.category !== undefined ? patch.category : localCategory;

    setLocalView(newView);
    setLocalQ(newQ);
    setLocalStatus(newStatus);
    setLocalCategory(newCategory);

    const params = new URLSearchParams();
    if (newView && newView !== "azi") params.set("view", newView);
    if (newQ) params.set("q", newQ);
    if (newStatus) params.set("status", newStatus);
    if (newCategory) params.set("category", newCategory);
    const qs = params.toString();
    window.history.replaceState(null, "", `/appointments${qs ? `?${qs}` : ""}`);

    startNav(async () => {
      const result = await listAppointmentsAction({
        view: newView || "azi",
        q: newQ || undefined,
        status: newStatus || undefined,
        category: newCategory || undefined,
      });
      setItems(result.items);
      setGrouped(result.grouped);
    });
  }

  function handleSearchChange(val: string) {
    setLocalQ(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => applyFilter({ q: val }), 350);
  }

  const byDay = new Map<string, ApptVM[]>();
  for (const it of items) {
    const arr = byDay.get(it.dateKey) ?? [];
    arr.push(it);
    byDay.set(it.dateKey, arr);
  }
  const days = [...byDay.keys()].sort();

  return (
    <QuickAddProvider categories={categories} defaults={quickDefaults}>
      {initialCreate && <AutoOpenQuickAdd />}
      <div className="w-full">
        {/* View tabs + filter bar */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => applyFilter({ view: v.key })}
                className={`tap shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
                  localView === v.key ? "bg-brand text-white" : "card text-ink-soft"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={localQ}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Caută client…"
              className="h-9 min-w-36 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm outline-none focus:border-brand"
            />
            <select value={localStatus} onChange={(e) => applyFilter({ status: e.target.value })} className={fldCls(localStatus)}>
              <option value="">Status: toate</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {categories.length > 0 && (
              <select value={localCategory} onChange={(e) => applyFilter({ category: e.target.value })} className={fldCls(localCategory)}>
                <option value="">Categorie: toate</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {(localQ || localStatus || localCategory) && (
              <button
                onClick={() => {
                  if (searchDebounce.current) clearTimeout(searchDebounce.current);
                  applyFilter({ q: "", status: "", category: "" });
                }}
                className="tap h-9 rounded-lg border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)]"
              >
                ✕ Filtre
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <OpenQuickAddButton />
          <ExportButton
            entity="appointments"
            params={{
              view: localView !== "azi" ? localView : undefined,
              q: localQ || undefined,
              status: localStatus || undefined,
              category: localCategory || undefined,
            }}
            className="tap h-10 shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-3 text-sm text-ink-soft hover:bg-[var(--color-surface-2)]"
          />
          <ImportButton
            entity="appointments"
            className="tap h-10 shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-3 text-sm text-ink-soft hover:bg-[var(--color-surface-2)]"
          />
        </div>

        {pending && <div className="mb-2 h-0.5 animate-pulse rounded-full bg-brand opacity-60" />}

        {items.length === 0 ? (
          <div className="card grid place-items-center p-10 text-center text-sm text-ink-soft">
            Nicio programare în acest interval.
          </div>
        ) : grouped ? (
          <div className="flex flex-col gap-5">
            {days.map((day) => (
              <section key={day}>
                <h3 className="mb-2 capitalize text-xs font-semibold uppercase tracking-wide text-ink-soft">
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
