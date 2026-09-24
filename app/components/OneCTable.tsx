"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ONEC_COLUMNS, type OneCColumn } from "@/lib/apa-canal-1c";

type Row = Record<string, string | number | null> & {
  id: string;
  clientId: string | null;
  invoiceNumber: string | null;
  pwaTotal: number | null;
  diff: number | null;
};
type Payload = {
  items: Row[];
  total: number;
  page: number;
  perPage: number;
  sums: { calculat: number; datorieAvans: number; deAchitat: number };
};
type Detail = {
  id: string; uid: string; nume: string; payerId: string | null; invoiceId: string | null; invoiceNumber: string | null;
  consumers: Record<string, string | number | null>[] | null;
  meters: Record<string, string | number | null>[] | null;
  readings: Record<string, string | number | null>[] | null;
  lines: Record<string, string | number | null>[] | null;
};

const MONEY = new Set(["calculat", "datorieAvans", "deAchitat", "apaSuma", "canalSuma", "apaTarif", "canalTarif"]);
const PER_PAGE = [50, 100, 200, 500];

const money = (n: number | null | undefined) =>
  n == null ? "" : n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmt(col: OneCColumn, v: string | number | null | undefined) {
  if (v == null || v === "") return "";
  if (col.type === "num") return MONEY.has(col.key) ? money(Number(v)) : String(v);
  return String(v);
}

const inputCls =
  "h-7 w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 text-xs font-normal outline-none focus:border-brand";

export default function OneCTable() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("nume");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const req = useRef(0);
  const appliedRef = useRef<Record<string, string>>({});

  // Filtrele se aplică după o scurtă pauză de tastare (fiecare aplicare = o interogare pe server).
  useEffect(() => {
    const t = setTimeout(() => {
      const prev = appliedRef.current;
      const same = Object.keys({ ...prev, ...filters }).every((k) => (prev[k] ?? "") === (filters[k] ?? ""));
      if (same) return;
      appliedRef.current = filters;
      setApplied(filters);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [filters]);

  const queryString = useCallback(
    (extra: Record<string, string> = {}) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(applied)) if (v.trim()) sp.set(`f_${k}`, v.trim());
      sp.set("sort", sort);
      sp.set("dir", dir);
      if (onlyDiff) sp.set("diff", "1");
      for (const [k, v] of Object.entries(extra)) sp.set(k, v);
      return sp.toString();
    },
    [applied, sort, dir, onlyDiff],
  );

  useEffect(() => {
    const id = ++req.current;
    setLoading(true);
    setError(null);
    fetch(`/api/platitori/tabel?${queryString({ page: String(page), perPage: String(perPage) })}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Eroare la încărcare.");
        return j as Payload;
      })
      .then((j) => { if (id === req.current) setData(j); })
      .catch((e: Error) => { if (id === req.current) setError(e.message); })
      .finally(() => { if (id === req.current) setLoading(false); });
  }, [queryString, page, perPage]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const activeFilters = Object.values(applied).filter((v) => v.trim()).length + (onlyDiff ? 1 : 0);
  const exportUrl = useCallback((sheet: string) => `/api/platitori/tabel/export?${queryString({ sheet })}`, [queryString]);

  function toggleSort(key: string) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setDir("asc"); }
    setPage(1);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => { setOnlyDiff(e.target.checked); setPage(1); }} className="size-4 accent-[var(--color-brand)]" />
          Doar diferențe PWA ≠ 1C
        </label>
        <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="h-9 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2 text-sm" aria-label="Rânduri pe pagină">
          {PER_PAGE.map((n) => <option key={n} value={n}>{n} / pagină</option>)}
        </select>
        {activeFilters > 0 && (
          <button type="button" onClick={() => { appliedRef.current = {}; setFilters({}); setApplied({}); setOnlyDiff(false); setPage(1); }} className="tap h-9 rounded-lg border border-[var(--color-line)] px-3 text-sm text-ink-soft hover:bg-[var(--color-surface-2)]">
            Resetează filtrele ({activeFilters})
          </button>
        )}
        <details className="relative ml-auto">
          <summary className="tap inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-strong">
            📊 Descarcă Excel ▾
          </summary>
          <div className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-1 shadow-xl">
            <p className="px-3 py-1.5 text-[11px] text-ink-soft">Cu filtrele curente și filtru pe fiecare coloană în Excel. Fiecare tabel are UID.</p>
            {(
              [
                ["main", "Tabel comun (un rând per UID)"],
                ["consumers", "Consumatori (Потребители)"],
                ["meters", "Contoare (ИзмерительныеПриборы)"],
                ["readings", "Citiri (Потребления)"],
                ["lines", "Linii de calcul (РасчетСумм)"],
              ] as const
            ).map(([k, l]) => (
              <a key={k} href={exportUrl(k)} download onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")} className="block rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-2)]">{l}</a>
            ))}
          </div>
        </details>
      </div>

      <p className="mb-2 text-xs text-ink-soft">
        Filtrele merg pe fiecare coloană (text: „conține”). La coloanele cu numere poți scrie <b>&gt;100</b>, <b>&lt;=0</b>, <b>=45.3</b> sau un interval <b>10-50</b>.
        Click pe un rând = toate datele lui din cele 6 tabele 1C.
      </p>

      {data && (
        <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span><b>{data.total.toLocaleString("ro-RO")}</b> abonați</span>
          <span>Σ Calculat: <b>{money(data.sums.calculat)}</b></span>
          <span>Σ Datorie/avans: <b>{money(data.sums.datorieAvans)}</b></span>
          <span>Σ De achitat: <b>{money(data.sums.deAchitat)}</b></span>
          {loading && <span className="text-ink-soft">se încarcă…</span>}
        </div>
      )}
      {error && <p className="mb-2 rounded-lg bg-st-cancelled/10 px-3 py-2 text-sm text-st-cancelled">{error}</p>}

      <div className="card overflow-auto" style={{ maxHeight: "68vh" }}>
        <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20 bg-[var(--color-surface-2)]">
            <tr>
              {ONEC_COLUMNS.map((c, i) => (
                <th
                  key={c.key}
                  style={{ minWidth: c.w, width: c.w }}
                  title={`Câmp 1C: ${c.src}`}
                  className={`border-b border-[var(--color-line)] px-2 pt-2 text-left align-bottom ${i === 1 ? "sticky left-0 z-30 bg-[var(--color-surface-2)]" : ""}`}
                >
                  <button type="button" onClick={() => toggleSort(c.key)} className="flex w-full items-center gap-1 pb-1 text-left font-semibold hover:text-brand">
                    <span className="truncate">{c.label}</span>
                    <span className="shrink-0 text-[10px] text-ink-soft">{sort === c.key ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
                  </button>
                  <input
                    value={filters[c.key] ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                    placeholder={c.type === "num" ? ">100 · 10-50" : "Filtru…"}
                    className={`${inputCls} mb-2`}
                    aria-label={`Filtru ${c.label}`}
                  />
                </th>
              ))}
              <th className="border-b border-[var(--color-line)] px-2 pt-2 text-left align-top font-semibold" style={{ minWidth: 110 }}>Factură PWA</th>
              <th className="border-b border-[var(--color-line)] px-2 pt-2 text-right align-top font-semibold" style={{ minWidth: 100 }}>Total PWA</th>
              <th className="border-b border-[var(--color-line)] px-2 pt-2 text-right align-top font-semibold" style={{ minWidth: 110 }}>Diferență PWA − 1C</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.id} onClick={() => setDetailId(r.id)} className="cursor-pointer hover:bg-brand-soft/40">
                {ONEC_COLUMNS.map((c, i) => (
                  <td
                    key={c.key}
                    className={`border-b border-[var(--color-line)] px-2 py-1.5 ${c.type === "num" ? "text-right tabular-nums" : ""} ${i === 1 ? "sticky left-0 z-10 bg-[var(--color-surface)] font-medium" : ""}`}
                    style={{ maxWidth: Math.max(c.w, 160) }}
                  >
                    <div className="truncate" title={fmt(c, r[c.key])}>{fmt(c, r[c.key])}</div>
                  </td>
                ))}
                <td className="border-b border-[var(--color-line)] px-2 py-1.5">{r.invoiceNumber}</td>
                <td className="border-b border-[var(--color-line)] px-2 py-1.5 text-right tabular-nums">{money(r.pwaTotal)}</td>
                <td className={`border-b border-[var(--color-line)] px-2 py-1.5 text-right tabular-nums ${r.diff && Math.abs(r.diff) > 0.011 ? "font-semibold text-st-cancelled" : ""}`}>{money(r.diff)}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={ONEC_COLUMNS.length + 3} className="p-8 text-center text-ink-soft">Niciun abonat cu filtrele acestea.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="tap card rounded-lg px-3 py-2 disabled:opacity-40">‹ Anterior</button>
        <span className="text-center text-ink-soft">
          Pagina {page} din {pages}
          {data && data.total > 0 && <><br /><span className="text-xs">{(page - 1) * data.perPage + 1}–{Math.min(page * data.perPage, data.total)} din {data.total.toLocaleString("ro-RO")}</span></>}
        </span>
        <button type="button" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)} className="tap card rounded-lg px-3 py-2 disabled:opacity-40">Următor ›</button>
      </div>

      {detailId && <DetailDialog id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function MiniTable({ title, rows, cols }: { title: string; rows: Record<string, string | number | null>[] | null; cols: [string, string][] }) {
  const list = rows ?? [];
  return (
    <section className="mb-4">
      <h3 className="mb-1 text-sm font-semibold">{title} <span className="font-normal text-ink-soft">({list.length})</span></h3>
      {list.length === 0 ? (
        <p className="text-xs text-ink-soft">— niciun rând în fișierul 1C —</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-[var(--color-line)]" style={{ maxHeight: 260 }}>
          <table className="w-max min-w-full text-xs">
            <thead className="sticky top-0 bg-[var(--color-surface-2)]">
              <tr>{cols.map(([k, l]) => <th key={k} className="whitespace-nowrap px-2 py-1 text-left font-semibold">{l}</th>)}</tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i} className="border-t border-[var(--color-line)]">
                  {cols.map(([k]) => <td key={k} className="whitespace-nowrap px-2 py-1">{r[k] == null || r[k] === "" ? "" : String(r[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/platitori/tabel?detail=${id}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Eroare."); return j as Detail; })
      .then((j) => alive && setD(j))
      .catch((e: Error) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-t-2xl bg-[var(--color-surface)] p-4 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold">{d?.nume ?? "Se încarcă…"}</h2>
            {d && <p className="break-all text-xs text-ink-soft">UID: {d.uid} · Factură: {d.invoiceNumber ?? "—"}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {d?.payerId && <Link href={`/platitori/${d.payerId}`} className="tap rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]">Fișa plătitorului</Link>}
            {d?.invoiceId && <Link href={`/invoices/${d.invoiceId}/edit`} className="tap rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]">Factura</Link>}
            <button type="button" onClick={onClose} className="tap grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-[var(--color-surface-2)]" aria-label="Închide">✕</button>
          </div>
        </div>
        {err && <p className="text-sm text-st-cancelled">{err}</p>}
        {d && (
          <>
            <MiniTable title="Consumatori (Потребители)" rows={d.consumers} cols={[["perioada", "Perioadă"], ["nume", "Consumator"], ["inn", "IDNO/ИНН"], ["inceput", "Început"], ["sfarsit", "Sfârșit"], ["zona", "Zonă presiune"], ["sector", "Sector"], ["nrPersoane", "Nr. pers."], ["suprafata", "Suprafață"]]} />
            <MiniTable title="Contoare (ИзмерительныеПриборы)" rows={d.meters} cols={[["perioada", "Perioadă"], ["consumator", "Consumator"], ["contor", "Contor"], ["dataInstalare", "Instalat"], ["sigiliu", "Sigiliu"], ["dataScoatere", "Scos"], ["subAbonat", "Sub-abonat"], ["subContract", "Sub-contract"], ["subCont", "Sub-cont"], ["subContor", "Sub-contor"]]} />
            <MiniTable title="Citiri (Потребления)" rows={d.readings} cols={[["consumator", "Consumator"], ["contor", "Contor"], ["sursa", "Sursa"], ["citirePrec", "Citire ant."], ["dataPrec", "Data ant."], ["citire", "Citire"], ["dataCitire", "Data"], ["consum", "Consum"], ["medie", "Medie"], ["consumSubcontoare", "Subcontoare"]]} />
            <MiniTable title="Linii de calcul (РасчетСумм)" rows={d.lines} cols={[["consumator", "Consumator"], ["contor", "Contor"], ["serviciu", "Serviciu"], ["volum", "Volum"], ["tarif", "Tarif"], ["suma", "Sumă"], ["data", "Data"]]} />
          </>
        )}
      </div>
    </div>
  );
}
