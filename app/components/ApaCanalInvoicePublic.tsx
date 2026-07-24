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

const num2 = (n: number) => n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Grafic cu bare + linii orizontale de grilă la fiecare 5 unități, ca în modelul primit. */
function ConsumptionChart({ points }: { points: ConsumPoint[] }) {
  if (points.length === 0) return null;
  const maxVal = Math.max(...points.map((p) => p.value), 5);
  const yMax = Math.ceil(maxVal / 5) * 5;
  const stepCount = yMax / 5;
  const ySteps = Array.from({ length: stepCount + 1 }, (_, i) => yMax - i * 5); // yMax..0

  return (
    <div className="flex h-40 gap-1.5 border border-zinc-300 bg-white p-1.5">
      <div className="flex h-full flex-col justify-between text-right text-[9px] leading-none text-zinc-500">
        {ySteps.map((s) => <span key={s}>{s}</span>)}
      </div>
      <div className="relative flex-1">
        {/* Linii orizontale de grilă */}
        {ySteps.map((s) => (
          <div
            key={s}
            className="absolute left-0 right-0 border-t border-zinc-200"
            style={{ bottom: `${(s / yMax) * 100}%` }}
          />
        ))}
        {/* Bare */}
        <div className="relative flex h-full items-end gap-[3px]">
          {points.map((p, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
              <div
                className="w-full max-w-[18px] bg-[#4472c4]"
                style={{ height: `${Math.max(1, (p.value / yMax) * 100)}%` }}
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
    <div className="flex gap-1.5">
      <div className="w-[18px] shrink-0" />
      <div className="flex flex-1 gap-[3px]">
        {points.map((p, i) => (
          <span key={i} className="flex-1 text-center text-[9px] text-zinc-500">{p.label}</span>
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
    <article className="rounded-2xl bg-white p-6 text-[13px] text-zinc-900 shadow-sm ring-1 ring-zinc-200 print:rounded-none print:p-4 print:shadow-none print:ring-0">
      <h1 className="mb-4 text-base font-semibold">
        Factura pentru serviciul de alimentare cu apă și de canalizare
      </h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_280px]">
        {/* ── Coloana principală ── */}
        <div className="flex flex-col gap-4">
          {/* Date + cont personal + consumator */}
          <div className="flex flex-col justify-between gap-3 sm:flex-row">
            <div className="space-y-0.5">
              <p>Data emiterii: <b>{fmtDate(invoice.issueDate)}</b></p>
              <p>Data limită de achitare: <b>{fmtDate(invoice.dueDate)}</b></p>
            </div>
            <div className="space-y-0.5 sm:text-right">
              <p className="font-bold">
                Cont personal: {invoice.contPersonal || "—"}
                {invoice.sectorNr && (
                  <span className="ml-2 rounded border border-zinc-400 px-1 text-[11px] font-normal">
                    sector nr. {invoice.sectorNr}
                  </span>
                )}
              </p>
              <p>Adresa locului de consum:</p>
              <p>{invoice.consumAddress || "—"}</p>
              <p className="font-bold uppercase">{invoice.consumerName || invoice.client?.name || ""}</p>
            </div>
          </div>

          {/* Grafic + tabel contor */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <ConsumptionChart points={points} />
              <ConsumptionChartLabels points={points} />
            </div>
            <table className="text-center text-[11px]">
              <thead>
                <tr className="text-zinc-500">
                  <th className="px-2 pb-1 font-medium">Numărul<br />contorului</th>
                  <th className="px-2 pb-1 font-medium">Indicii<br />precedenți</th>
                  <th className="px-2 pb-1 font-medium">Indicii<br />actuali</th>
                  <th className="px-2 pb-1 font-medium">Volum<br />estimativ</th>
                </tr>
              </thead>
              <tbody>
                <tr className="font-semibold">
                  <td className="px-2">{invoice.meterNumber || "—"}</td>
                  <td className="px-2">{invoice.meterPrevReading || "—"}</td>
                  <td className="px-2">{invoice.meterCurrReading || "—"}</td>
                  <td className="px-2">{invoice.isEstimatedVolume ? "DA" : ""}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {invoice.billingPeriodLabel && (
            <p className="font-semibold">Perioada de calcul: {invoice.billingPeriodLabel.toUpperCase()}</p>
          )}

          {/* Servicii + totaluri */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <table className="flex-1 text-[12px]">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-zinc-500">
                  <th className="py-1 font-medium">Denumirea serviciului</th>
                  <th className="py-1 text-right font-medium">Volumul,m3</th>
                  <th className="py-1 text-right font-medium">Tariful lei/m3</th>
                  <th className="py-1 text-right font-medium">Suma calculata</th>
                </tr>
              </thead>
              <tbody>
                {apaItem && (
                  <tr className="border-b border-zinc-100">
                    <td className="py-1.5">Serviciul de alimentare cu apa</td>
                    <td className="py-1.5 text-right tabular-nums">{num2(apaItem.quantity)}</td>
                    <td className="py-1.5 text-right tabular-nums">{num2(apaItem.unitPrice)}</td>
                    <td className="py-1.5 text-right tabular-nums">{num2(apaItem.lineTotal)}</td>
                  </tr>
                )}
                {canalItem && (
                  <tr>
                    <td className="py-1.5">Serviciul de canalizare</td>
                    <td className="py-1.5 text-right tabular-nums">{num2(canalItem.quantity)}</td>
                    <td className="py-1.5 text-right tabular-nums">{num2(canalItem.unitPrice)}</td>
                    <td className="py-1.5 text-right tabular-nums">{num2(canalItem.lineTotal)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="w-full shrink-0 space-y-1 sm:w-56">
              <div className="flex justify-between">
                <span>Recalculări:</span>
                <span className="tabular-nums">{invoice.recalculari ? num2(invoice.recalculari) : ""}</span>
              </div>
              <div className="flex justify-between">
                <span>Suma calculată</span>
                <span className="tabular-nums">{num2(sumaCalculata)}</span>
              </div>
              <div className="flex justify-between">
                <span>Datorii(+)/avans(-)</span>
                <span className="tabular-nums">{num2(invoice.datoriiAvans)}</span>
              </div>
              {invoice.penalitati !== 0 && (
                <div className="flex justify-between">
                  <span>Penalitate:</span>
                  <span className="tabular-nums">{num2(invoice.penalitati)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-zinc-300 pt-1 text-base font-bold">
                <span>Suma spre plată :</span>
                <span className="tabular-nums">{num2(invoice.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* ATENȚIE */}
          <div className="rounded-md border-2 border-red-400 p-3">
            <p className="mb-1 font-bold text-red-600">ATENȚIE !</p>
            <p className="text-[11px] leading-relaxed text-zinc-700">{company.apaCanalAtentieText}</p>
          </div>
        </div>

        {/* ── Sidebar dreapta ── */}
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            {company.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo} alt={company.apaCanalCompanyLine} className="h-16 w-16 shrink-0 rounded-lg object-contain" />
            ) : null}
            <div className="space-y-0.5 text-[11px] text-zinc-600">
              <p>{company.apaCanalAddress}</p>
              <p>{company.apaCanalEmail}</p>
              <p className="font-semibold text-zinc-800">{company.apaCanalCompanyLine}</p>
              <p>{company.apaCanalCodFiscal}</p>
            </div>
          </div>

          <div className="rounded-md bg-teal-50 p-3 ring-1 ring-teal-200">
            <p className="mb-1 font-bold text-teal-700">Anunț !</p>
            <p className="text-[11px] leading-relaxed text-teal-900">{company.apaCanalAnuntText}</p>
          </div>

          <div className="text-[11px] text-zinc-700">
            <p className="mb-1 font-semibold text-zinc-800">Contacte: <span className="font-normal text-brand">{company.apaCanalContactName}</span></p>
            <div className="space-y-0.5 whitespace-pre-line">{company.apaCanalContactsText}</div>
          </div>
        </div>
      </div>
    </article>
  );
}
