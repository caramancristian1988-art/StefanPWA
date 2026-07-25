"use client";

import { useState, useTransition } from "react";
import type { Company } from "@/lib/queries/company";
import type { ApaCanalLayout, ApaCanalPositionalKey, ApaCanalTextKey } from "@/lib/apa-canal-layout";
import { APA_CANAL_POSITIONAL_LABELS, APA_CANAL_TEXT_LABELS, APA_CANAL_LAYOUT_DEFAULTS } from "@/lib/apa-canal-layout";
import type { LayoutState } from "@/app/actions/company";
import ApaCanalInvoicePublic, { type ApaCanalInvoiceData } from "./ApaCanalInvoicePublic";
import { useToast } from "./toast";

const SAMPLE_INVOICE: ApaCanalInvoiceData = {
  number: "INV-2026-0000",
  issueDate: new Date(),
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  currency: "MDL",
  contPersonal: "900616",
  sectorNr: "5sp",
  consumAddress: "or.Cahul, STROESCU, 31",
  consumerName: "ANTONIU GHEORGHE TEODOR",
  meterNumber: "294170",
  meterPrevReading: "00647",
  meterCurrReading: "00660",
  isEstimatedVolume: false,
  billingPeriodLabel: "IULIE 2026",
  recalculari: 0,
  penalitati: 0,
  datoriiAvans: -190,
  grandTotal: 293.6,
  monthlyConsumption: ["7", "8", "9", "10", "11", "12", "1", "2", "3", "4", "5", "6"].map((label, i) => ({
    label,
    value: [10, 31, 10, 10, 6, 8, 5, 5, 27, 32, 0, 13][i],
  })),
  client: { name: "Gheorghe" },
  items: [
    { description: "Serviciul de alimentare cu apa", quantity: 13, unitPrice: 23.45, lineTotal: 304.85 },
    { description: "Serviciul de canalizare", quantity: 13, unitPrice: 13.75, lineTotal: 178.75 },
  ],
};

const inputCls = "h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 text-sm outline-none focus:border-brand";
const labelCls = "mb-1 block text-xs font-semibold text-ink-soft";

export default function ApaCanalLayoutEditor({
  company,
  onSave,
}: {
  company: Company;
  onSave: (layout: ApaCanalLayout) => Promise<LayoutState>;
}) {
  const toast = useToast();
  const [layout, setLayout] = useState<ApaCanalLayout>(company.apaCanalLayout ?? {});
  const [pending, startTransition] = useTransition();

  function setPositional(key: ApaCanalPositionalKey, patch: Partial<ApaCanalLayout[ApaCanalPositionalKey]>) {
    setLayout((prev) => {
      const base = APA_CANAL_LAYOUT_DEFAULTS[key];
      const current = prev[key] ?? base;
      return { ...prev, [key]: { ...current, ...patch } };
    });
  }

  function setText(key: ApaCanalTextKey, patch: Partial<{ fontSizeMm: number; bold: boolean }>) {
    setLayout((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function save() {
    startTransition(async () => {
      const res = await onSave(layout);
      if (res?.ok) toast.success("Șablon salvat");
      else toast.error(res?.error ?? "Eroare la salvare");
    });
  }

  function reset() {
    setLayout({});
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1 overflow-auto rounded-2xl border border-[var(--color-line)] bg-zinc-100 p-4">
        <ApaCanalInvoicePublic
          invoice={SAMPLE_INVOICE}
          company={company}
          layout={layout}
          editable
          onLayoutChange={(key, override) => setLayout((prev) => ({ ...prev, [key]: override }))}
        />
      </div>

      <div className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
        <div className="card flex flex-col gap-3 p-4">
          <h3 className="text-sm font-bold">Elemente poziționabile</h3>
          <p className="-mt-2 text-xs text-ink-soft">Trage/redimensionează direct pe factură, sau editează exact aici (mm).</p>
          {(Object.keys(APA_CANAL_POSITIONAL_LABELS) as ApaCanalPositionalKey[]).map((key) => {
            const base = APA_CANAL_LAYOUT_DEFAULTS[key];
            const val = layout[key] ?? base;
            return (
              <div key={key} className="rounded-xl border border-[var(--color-line)] p-3">
                <p className="mb-2 text-xs font-semibold">{APA_CANAL_POSITIONAL_LABELS[key]}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>X (mm)</label>
                    <input type="number" step="0.1" className={inputCls} value={val.xMm ?? base.xMm}
                      onChange={(e) => setPositional(key, { xMm: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={labelCls}>Y (mm)</label>
                    <input type="number" step="0.1" className={inputCls} value={val.yMm ?? base.yMm}
                      onChange={(e) => setPositional(key, { yMm: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={labelCls}>Lățime (mm)</label>
                    <input type="number" step="0.1" className={inputCls} value={val.widthMm ?? base.widthMm}
                      onChange={(e) => setPositional(key, { widthMm: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={labelCls}>Înălțime/grosime (mm)</label>
                    <input type="number" step="0.1" className={inputCls} value={val.heightMm ?? base.heightMm}
                      onChange={(e) => setPositional(key, { heightMm: Number(e.target.value) })} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card flex flex-col gap-3 p-4">
          <h3 className="text-sm font-bold">Text — mărime și grosime</h3>
          {(Object.keys(APA_CANAL_TEXT_LABELS) as ApaCanalTextKey[]).map((key) => (
            <div key={key} className="rounded-xl border border-[var(--color-line)] p-3">
              <p className="mb-2 text-xs font-semibold">{APA_CANAL_TEXT_LABELS[key]}</p>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className={labelCls}>Mărime font (mm)</label>
                  <input type="number" step="0.1" className={inputCls} value={layout[key]?.fontSizeMm ?? ""}
                    placeholder="implicit"
                    onChange={(e) => setText(key, { fontSizeMm: e.target.value === "" ? undefined : Number(e.target.value) })} />
                </div>
                <label className="flex h-9 items-center gap-1.5 text-xs font-medium">
                  <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={!!layout[key]?.bold}
                    onChange={(e) => setText(key, { bold: e.target.checked })} />
                  Bold
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={save} disabled={pending} className="tap h-11 flex-1 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
            {pending ? "Se salvează…" : "Salvează șablonul"}
          </button>
          <button onClick={reset} disabled={pending} className="tap h-11 rounded-xl border border-[var(--color-line)] px-4 text-sm font-medium hover:bg-[var(--color-surface-2)]">
            Resetează
          </button>
        </div>
      </div>
    </div>
  );
}
