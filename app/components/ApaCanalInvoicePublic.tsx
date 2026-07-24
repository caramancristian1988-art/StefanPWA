import type { Company } from "@/lib/queries/company";
import { fmtDate } from "./invoice-meta";

type ConsumPoint = { label: string; value: number };

type ApaCanalInvoiceData = {
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  currency: string;
  contPersonal: string | null;
  sectorNr: string | null;
  consumAddress: string | null;
  consumerName: string | null;
  meterNumber: string | null;
  meterPrevReading: string | null;
  meterCurrReading: string | null;
  isEstimatedVolume: boolean;
  billingPeriodLabel: string | null;
  recalculari: number;
  penalitati: number;
  datoriiAvans: number;
  grandTotal: number;
  monthlyConsumption: unknown;
  client: { name: string } | null;
  items: { description: string; quantity: number; unitPrice: number; lineTotal: number }[];
};

// Paleta exactă extrasă din modelul de factură Apă-Canal.
const COLOR_BG = "#FCFDFC";
const COLOR_BOX_BLUE = "#86D3EA";
const COLOR_BAR = "#5492B2";
const COLOR_TEXT = "#202C2A";
const COLOR_BORDER = "#AEB0B0";
const COLOR_BORDER_LIGHT = "#D9DDDD";
const COLOR_RED = "#E53935";

const num2 = (n: number) => n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Rotunjește la un "număr frumos" (1/2/5 × 10^n) — ține numărul de linii de grilă mereu rezonabil. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

/** Grafic cu bare + linii orizontale de grilă (max. ~7 trepte, indiferent de valori). */
function ConsumptionChart({ points }: { points: ConsumPoint[] }) {
  if (points.length === 0) return null;
  const maxVal = Math.max(...points.map((p) => p.value), 5);
  const step = niceStep(maxVal / 6);
  const yMax = Math.ceil(maxVal / step) * step;
  const ySteps: number[] = [];
  for (let v = yMax; v >= 0; v -= step) ySteps.push(Math.round(v * 100) / 100);

  return (
    <div className="flex h-64 gap-2 overflow-hidden p-2" style={{ background: COLOR_BG, border: `1px solid ${COLOR_BORDER}` }}>
      <div className="flex h-full shrink-0 flex-col justify-between text-right text-[10px] leading-none" style={{ color: COLOR_BORDER }}>
        {ySteps.map((s) => <span key={s}>{s}</span>)}
      </div>
      <div className="relative flex-1">
        {/* Linii orizontale de grilă */}
        {ySteps.map((s) => (
          <div
            key={s}
            className="absolute left-0 right-0 border-t"
            style={{ bottom: `${(s / yMax) * 100}%`, borderColor: COLOR_BORDER_LIGHT }}
          />
        ))}
        {/* Bare */}
        <div className="relative flex h-full items-end gap-1">
          {points.map((p, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
              <div
                className="w-full max-w-[26px]"
                style={{ height: `${Math.max(1, (p.value / yMax) * 100)}%`, background: COLOR_BAR }}
                title={`${p.label}: ${p.value} m³`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConsumptionChartLabels({ points }: { points: ConsumPoint[] }) {
  if (points.length === 0) return null;
  return (
    <div className="flex gap-2">
      <div className="w-[26px] shrink-0" />
      <div className="flex flex-1 gap-1">
        {points.map((p, i) => (
          <span key={i} className="flex-1 text-center text-[10px]" style={{ color: COLOR_BORDER }}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}

export default function ApaCanalInvoicePublic({
  invoice,
  company,
}: {
  invoice: ApaCanalInvoiceData;
  company: Company;
}) {
  const apaItem = invoice.items.find((it) => /alimentare cu apa/i.test(it.description));
  const canalItem = invoice.items.find((it) => /canalizare/i.test(it.description));
  const sumaCalculata = (apaItem?.lineTotal ?? 0) + (canalItem?.lineTotal ?? 0);
  const points: ConsumPoint[] = Array.isArray(invoice.monthlyConsumption)
    ? (invoice.monthlyConsumption as ConsumPoint[])
    : [];

  return (
    <article
      className="overflow-x-auto rounded-2xl p-6 text-[13px] shadow-sm ring-1 ring-zinc-200 print:rounded-none print:p-4 print:shadow-none print:ring-0"
      style={{ background: COLOR_BG, color: COLOR_TEXT }}
    >
      <div className="min-w-[900px]">
        <h1 className="mb-2 text-base font-semibold">
          Factura pentru serviciul de alimentare cu apă și de canalizare
        </h1>
        <div className="mb-4 h-[3px]" style={{ background: COLOR_BOX_BLUE }} />

        <div className="grid grid-cols-[1fr_360px] gap-6">
          {/* ── Coloana principală ── */}
          <div className="flex flex-col gap-4">
            {/* Date + cont personal + consumator */}
            <div className="flex justify-between gap-3">
              <div className="shrink-0 space-y-0.5 whitespace-nowrap">
                <p>Data emiterii: <b>{fmtDate(invoice.issueDate)}</b></p>
                <p>Data limită de achitare: <b>{fmtDate(invoice.dueDate)}</b></p>
              </div>
              <div className="space-y-0.5 text-right">
                <p className="whitespace-nowrap font-bold">
                  Cont personal: {invoice.contPersonal || "—"}
                  {invoice.sectorNr && (
                    <span className="ml-2 rounded px-1 text-[11px] font-normal" style={{ border: `1.5px solid ${COLOR_TEXT}` }}>
                      sector nr. {invoice.sectorNr}
                    </span>
                  )}
                </p>
                <p>Adresa locului de consum:</p>
                <p>{invoice.consumAddress || "—"}</p>
                <p className="font-bold uppercase">{invoice.consumerName || invoice.client?.name || ""}</p>
              </div>
            </div>

            {/* Grafic (cu conturul lui propriu) + tabel contor independent, în dreapta, centrat pe verticală */}
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <ConsumptionChart points={points} />
                <ConsumptionChartLabels points={points} />
              </div>
              <table className="shrink-0 text-center text-[12px]">
                <thead>
                  <tr style={{ color: COLOR_BORDER }}>
                    <th className="whitespace-nowrap px-3 pb-1.5 font-medium">Numărul<br />contorului</th>
                    <th className="whitespace-nowrap px-3 pb-1.5 font-medium">Indicii<br />precedenți</th>
                    <th className="whitespace-nowrap px-3 pb-1.5 font-medium">Indicii<br />actuali</th>
                    <th className="whitespace-nowrap px-3 pb-1.5 font-medium">Volum<br />estimativ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-semibold">
                    <td className="whitespace-nowrap px-3">{invoice.meterNumber || "—"}</td>
                    <td className="whitespace-nowrap px-3">{invoice.meterPrevReading || "—"}</td>
                    <td className="whitespace-nowrap px-3">{invoice.meterCurrReading || "—"}</td>
                    <td className="whitespace-nowrap px-3">{invoice.isEstimatedVolume ? "DA" : ""}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {invoice.billingPeriodLabel && (
              <p className="font-semibold">Perioada de calcul: {invoice.billingPeriodLabel.toUpperCase()}</p>
            )}

            {/* Servicii + (Recalculări/Penalitate ca text simplu) + totaluri (casetă albastră separată) */}
            <div className="flex gap-4">
              <table className="flex-1 text-[12px]">
                <thead>
                  <tr className="text-left" style={{ borderBottom: `1px solid ${COLOR_BOX_BLUE}`, color: COLOR_BORDER }}>
                    <th className="whitespace-nowrap py-1 font-medium">Denumirea serviciului</th>
                    <th className="whitespace-nowrap py-1 text-right font-medium">Volumul,m3</th>
                    <th className="whitespace-nowrap py-1 text-right font-medium">Tariful lei/m3</th>
                    <th className="whitespace-nowrap py-1 text-right font-medium">Suma calculata</th>
                  </tr>
                </thead>
                <tbody>
                  {apaItem && (
                    <tr style={{ borderBottom: `1px solid ${COLOR_BORDER_LIGHT}` }}>
                      <td className="whitespace-nowrap py-1.5">Serviciul de alimentare cu apa</td>
                      <td className="py-1.5 text-right tabular-nums">{num2(apaItem.quantity)}</td>
                      <td className="py-1.5 text-right tabular-nums">{num2(apaItem.unitPrice)}</td>
                      <td className="py-1.5 text-right tabular-nums">{num2(apaItem.lineTotal)}</td>
                    </tr>
                  )}
                  {canalItem && (
                    <tr>
                      <td className="whitespace-nowrap py-1.5">Serviciul de canalizare</td>
                      <td className="py-1.5 text-right tabular-nums">{num2(canalItem.quantity)}</td>
                      <td className="py-1.5 text-right tabular-nums">{num2(canalItem.unitPrice)}</td>
                      <td className="py-1.5 text-right tabular-nums">{num2(canalItem.lineTotal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-start gap-4">
              <div className="space-y-1.5">
                <p>Recalculări:{invoice.recalculari ? ` ${num2(invoice.recalculari)}` : ""}</p>
                <p>Penalitate:{invoice.penalitati ? ` ${num2(invoice.penalitati)}` : ""}</p>
              </div>
              <div className="w-64 shrink-0 space-y-1 rounded-2xl p-3" style={{ background: COLOR_BOX_BLUE }}>
                <div className="flex justify-between whitespace-nowrap">
                  <span>Suma calculată</span>
                  <span className="tabular-nums">{num2(sumaCalculata)}</span>
                </div>
                <div className="flex justify-between whitespace-nowrap">
                  <span>Datorii(+)/avans(-)</span>
                  <span className="tabular-nums">{num2(invoice.datoriiAvans)}</span>
                </div>
                <div className="flex justify-between whitespace-nowrap pt-1 text-base font-bold" style={{ borderTop: `1px solid ${COLOR_TEXT}` }}>
                  <span>Suma spre plată :</span>
                  <span className="tabular-nums">{num2(invoice.grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* ATENȚIE */}
            <div className="rounded-2xl p-4" style={{ background: COLOR_BOX_BLUE }}>
              <p className="mb-1 text-lg font-bold" style={{ color: COLOR_RED }}>ATENȚIE !</p>
              <p className="text-[12px] leading-relaxed" style={{ color: COLOR_TEXT }}>{company.apaCanalAtentieText}</p>
            </div>
          </div>

          {/* ── Sidebar dreapta ── */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              {company.apaCanalLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.apaCanalLogo} alt={company.apaCanalCompanyLine} className="h-44 w-44 shrink-0 object-contain" />
              ) : null}
              <div className="space-y-1.5 text-[13px] leading-relaxed" style={{ color: COLOR_TEXT }}>
                <p>{company.apaCanalAddress}</p>
                <p>{company.apaCanalEmail}</p>
                <p className="font-semibold">{company.apaCanalCompanyLine}</p>
                <p>{company.apaCanalCodFiscal}</p>
              </div>
            </div>

            <div className="rounded-2xl p-6 text-center" style={{ background: COLOR_BOX_BLUE }}>
              <p className="mb-2 text-xl font-bold" style={{ color: COLOR_RED }}>Anunț !</p>
              <p className="text-[12.5px] leading-relaxed" style={{ color: COLOR_TEXT }}>{company.apaCanalAnuntText}</p>
            </div>

            <div className="text-[11.5px]">
              <p className="mb-1 font-semibold">Contacte: <span className="font-normal text-brand">{company.apaCanalContactName}</span></p>
              <div className="space-y-0.5 whitespace-pre-line">{company.apaCanalContactsText}</div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
