"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconX } from "./icons";

type Config = {
  url: string;
  username: string;
  hasPassword: boolean;
  hasToken: boolean;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncMessage: string | null;
  lastSuccessAt: string | null;
  autoSync: boolean;
  canEdit: boolean;
};

type Stats = {
  documenteTotale: number;
  sariteFaraAbonent: number;
  clientiNoiDeCreat: number;
  clientiExistentiActualizati: number;
  facturiDeCreat: number;
  facturiSaritePreexistente: number;
  totalNecuvenit: number;
  totalDePlata: number;
};
type Applied = { clientsCreated: number; clientsUpdated: number; invoicesCreated: number; itemsCreated: number };

const fld =
  "h-11 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand disabled:opacity-60";
const lbl = "mb-1 block text-xs font-semibold text-ink-soft";
const money = (n: number) => `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL`;

/**
 * Buton + fereastră pentru sincronizarea plătitorilor dintr-un API: aici se pun linkul și credențialele
 * (login/parolă sau token), se testează conexiunea (fără să scrie nimic) și se extrag datele.
 * Parola nu se citește niciodată înapoi din server — câmpul rămâne gol când există una salvată.
 */
export default function ApaCanalApiSync() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<null | "save" | "test" | "sync">(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);

  async function load() {
    setError(null);
    try {
      const r = await fetch("/api/integrations/apa-canal", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Eroare la încărcare.");
      setCfg(j);
      setUrl(j.url);
      setUsername(j.username);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare.");
    }
  }

  useEffect(() => {
    if (open) {
      setStats(null);
      setApplied(null);
      setInfo(null);
      setPassword("");
      setToken("");
      load();
    }
  }, [open]);

  const dirty = !!cfg && (url.trim() !== cfg.url || username.trim() !== cfg.username || password !== "" || token !== "");

  async function save(): Promise<boolean> {
    setError(null);
    setInfo(null);
    setBusy("save");
    try {
      const r = await fetch("/api/integrations/apa-canal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // câmpurile goale de parolă/token = "păstrează ce e salvat" (nu se trimit deloc)
        body: JSON.stringify({ url, username, ...(password ? { password } : {}), ...(token ? { token } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Nu s-a putut salva.");
      setCfg(j);
      setPassword("");
      setToken("");
      setInfo("Salvat.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nu s-a putut salva.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function toggleAuto(next: boolean) {
    setError(null);
    setInfo(null);
    setBusy("save");
    try {
      const r = await fetch("/api/integrations/apa-canal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSync: next }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Nu s-a putut schimba.");
      setCfg(j);
      setInfo(next ? "Sincronizare automată pornită — se rulează în fiecare noapte." : "Sincronizare automată oprită.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nu s-a putut schimba.");
    } finally {
      setBusy(null);
    }
  }

  async function run(commit: boolean) {
    setError(null);
    setInfo(null);
    setStats(null);
    setApplied(null);
    if (cfg?.canEdit && dirty && !(await save())) return;
    if (commit && !confirm("Extrag plătitorii din API și îi scriu în aplicație (clienți și facturi noi). Continui?")) return;
    setBusy(commit ? "sync" : "test");
    try {
      const r = await fetch("/api/integrations/apa-canal/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commit }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Eroare la sincronizare.");
      setStats(j.stats);
      if (commit) {
        setApplied(j.applied);
        router.refresh();
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la sincronizare.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  const locked = busy !== null;
  const canEdit = cfg?.canEdit ?? false;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tap inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-3 text-sm font-medium text-ink-soft hover:bg-[var(--color-surface-2)]"
      >
        🔌 Sincronizare API
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => !locked && setOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-t-2xl bg-[var(--color-surface)] p-5 shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Sincronizare plătitori din API</h2>
                <p className="mt-1 text-xs text-ink-soft">
                  Pune linkul API-ului și credențialele; la apăsare, aplicația extrage plătitorii direct de acolo. API-ul trebuie să
                  întoarcă același JSON ca exportul 1C (Документы, Абоненты, Потребители…). Ce există deja nu se dublează.
                </p>
              </div>
              <button type="button" disabled={locked} onClick={() => setOpen(false)} className="tap grid size-9 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-[var(--color-surface-2)] disabled:opacity-40" aria-label="Închide">
                <IconX className="size-4" />
              </button>
            </div>

            {!cfg && !error && <p className="py-6 text-center text-sm text-ink-soft">Se încarcă…</p>}

            {cfg && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className={lbl} htmlFor="api-url">Link API</label>
                  <input id="api-url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={!canEdit || locked} placeholder="https://server.exemplu.md/api/platitori" inputMode="url" autoComplete="off" className={fld} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={lbl} htmlFor="api-user">Login</label>
                    <input id="api-user" value={username} onChange={(e) => setUsername(e.target.value)} disabled={!canEdit || locked} autoComplete="off" className={fld} />
                  </div>
                  <div>
                    <label className={lbl} htmlFor="api-pass">Parolă</label>
                    <input id="api-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!canEdit || locked} autoComplete="new-password" placeholder={cfg.hasPassword ? "•••••••• salvată" : ""} className={fld} />
                  </div>
                </div>
                <div>
                  <label className={lbl} htmlFor="api-token">Token (opțional — se folosește doar dacă nu ai login)</label>
                  <input id="api-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} disabled={!canEdit || locked} autoComplete="new-password" placeholder={cfg.hasToken ? "•••••••• salvat" : ""} className={fld} />
                </div>
                {/^http:\/\//i.test(url.trim()) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(url.trim()) && (
                  <p className="rounded-lg bg-st-progress/10 px-3 py-2 text-xs text-st-progress">
                    Linkul începe cu http:// — login-ul și parola ar circula necriptat prin internet. Folosește https:// dacă serverul îl permite.
                  </p>
                )}
                {!canEdit && <p className="text-xs text-ink-soft">Doar un administrator poate schimba linkul și credențialele. Poți totuși testa și sincroniza.</p>}
                <p className="text-[11px] text-ink-soft">Parola se păstrează criptat și nu mai apare niciodată pe ecran.</p>

                {cfg.lastSyncAt && (
                  <p className={`rounded-lg px-3 py-2 text-xs ${cfg.lastSyncOk ? "bg-brand-soft text-brand-strong" : "bg-st-cancelled/10 text-st-cancelled"}`}>
                    Ultima încercare: {new Date(cfg.lastSyncAt).toLocaleString("ro-RO")} — {cfg.lastSyncMessage}
                  </p>
                )}
                {cfg.lastSuccessAt && <p className="text-[11px] text-ink-soft">Ultima dată când s-au scris date din API: {new Date(cfg.lastSuccessAt).toLocaleString("ro-RO")}.</p>}

                <div className="rounded-xl border border-[var(--color-line)] p-3">
                  <label className="flex items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={cfg.autoSync}
                      disabled={!canEdit || locked || dirty || (!cfg.autoSync && cfg.lastSyncOk !== true)}
                      onChange={(e) => toggleAuto(e.target.checked)}
                      className="mt-0.5 size-4 accent-[var(--color-brand)]"
                    />
                    <span>
                      <b>Extrage automat în fiecare noapte</b> (în jur de 03:00)
                      <span className="mt-0.5 block text-xs text-ink-soft">
                        {cfg.autoSync
                          ? "Pornit: aplicația își aduce singură datele, nu mai trebuie să apeși butonul. Dacă API-ul întoarce același lucru ca data trecută, nu se schimbă nimic."
                          : cfg.lastSyncOk === true
                            ? "Setările au funcționat — poți porni extragerea automată."
                            : "Se poate porni doar după o testare sau o sincronizare reușită cu setările curente."}
                        {!canEdit && " Doar un administrator o poate porni sau opri."}
                      </span>
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canEdit && (
                    <button type="button" disabled={locked || !dirty} onClick={save} className="tap h-11 rounded-xl border border-[var(--color-line)] px-4 text-sm font-semibold hover:bg-[var(--color-surface-2)] disabled:opacity-40">
                      {busy === "save" ? "Se salvează…" : "Salvează"}
                    </button>
                  )}
                  <button type="button" disabled={locked || !(cfg.url || url.trim())} onClick={() => run(false)} className="tap h-11 rounded-xl border border-brand px-4 text-sm font-semibold text-brand-strong hover:bg-brand-soft disabled:opacity-40">
                    {busy === "test" ? "Se testează…" : "Testează conexiunea"}
                  </button>
                  <button type="button" disabled={locked || !(cfg.url || url.trim())} onClick={() => run(true)} className="tap h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-40">
                    {busy === "sync" ? "Se extrage…" : "Extrage din API"}
                  </button>
                </div>
                {locked && (busy === "test" || busy === "sync") && (
                  <p className="text-xs text-ink-soft">Se descarcă și se procesează datele — poate dura 1–2 minute, nu închide fereastra.</p>
                )}
              </div>
            )}

            {error && <p className="mt-3 rounded-lg bg-st-cancelled/10 px-3 py-2 text-sm text-st-cancelled">{error}</p>}
            {info && !error && <p className="mt-3 text-sm text-brand-strong">{info}</p>}

            {stats && (
              <div className="mt-3 rounded-xl border border-[var(--color-line)] p-3 text-sm">
                <p className="mb-1 font-semibold">{applied ? "Sincronizare încheiată" : "Conexiune reușită — iată ce s-ar schimba (nu s-a scris nimic)"}</p>
                <ul className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
                  <li>Abonați în API: <b>{stats.documenteTotale.toLocaleString("ro-RO")}</b></li>
                  <li>Clienți noi: <b>{stats.clientiNoiDeCreat.toLocaleString("ro-RO")}</b></li>
                  <li>Clienți actualizați: <b>{stats.clientiExistentiActualizati.toLocaleString("ro-RO")}</b></li>
                  <li>Facturi noi: <b>{stats.facturiDeCreat.toLocaleString("ro-RO")}</b></li>
                  <li>Facturi deja existente (sărite): <b>{stats.facturiSaritePreexistente.toLocaleString("ro-RO")}</b></li>
                  <li>Fără abonat/document (sărite): <b>{stats.sariteFaraAbonent.toLocaleString("ro-RO")}</b></li>
                  <li>Calculat (facturi noi): <b>{money(stats.totalNecuvenit)}</b></li>
                  <li>De achitat (facturi noi): <b>{money(stats.totalDePlata)}</b></li>
                </ul>
                {applied && (
                  <p className="mt-2 text-xs text-brand-strong">
                    Scrise: {applied.clientsCreated} clienți noi, {applied.clientsUpdated} actualizați, {applied.invoicesCreated} facturi ({applied.itemsCreated} linii).
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
