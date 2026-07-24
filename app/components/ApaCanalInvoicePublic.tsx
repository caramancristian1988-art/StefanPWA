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

/** Rotunjește la un "număr frumos" (1/2/5 × 10^n) — ține numărul de linii de grilă mereu rezonabil. */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function ConsumptionChart({ points }: { points: ConsumPoint[] }) {
  if (points.length === 0) return null;
  const maxVal = Math.max(...points.map((p) => p.value), 5);
  const step = niceStep(maxVal / 6);
  const yMax = Math.ceil(maxVal / step) * step;
  const ySteps: number[] = [];
  for (let v = yMax; v >= 0; v -= step) ySteps.push(Math.round(v * 100) / 100);

  return (
    <div className="chart-area">
      <div className="chart-box">
        <div className="chart-yaxis">
          {ySteps.map((s) => <span key={s}>{s}</span>)}
        </div>
        <div className="chart-plot">
          {ySteps.map((s) => (
            <div key={s} className="chart-gridline" style={{ bottom: `${(s / yMax) * 100}%` }} />
          ))}
          <div className="chart-bars">
            {points.map((p, i) => (
              <div key={i} className="chart-bar-col">
                <div className="chart-bar" style={{ height: `${Math.max(1, (p.value / yMax) * 100)}%` }} title={`${p.label}: ${p.value} m³`} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="chart-labels">
        <div className="chart-yaxis-spacer" />
        <div className="chart-labels-row">
          {points.map((p, i) => <span key={i}>{p.label}</span>)}
        </div>
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

  const contactLines = company.apaCanalContactsText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("·");
      if (idx === -1) return { phone: line, dept: "" };
      return { phone: line.slice(0, idx).trim(), dept: line.slice(idx + 1).trim() };
    });

  return (
    <>
      <div className="invoice-page">
        <main className="invoice-main">
          <div className="invoice-header">
            <h1>Factura pentru serviciul de alimentare cu apă și de canalizare</h1>
            <div className="header-rule" />
            <div className="header-details">
              <div className="dates-block">
                <p>Data emiterii: <b>{fmtDate(invoice.issueDate)}</b></p>
                <p>Data limită de achitare: <b>{fmtDate(invoice.dueDate)}</b></p>
              </div>
              <div className="consumer-block">
                <p>
                  Cont personal: <span className="cont-personal">{invoice.contPersonal || "—"}</span>
                  <span className="sector-badge">sector nr.</span> {invoice.sectorNr || ""}
                </p>
                <p>Adresa locului de consum:</p>
                <p>{invoice.consumAddress || "—"}</p>
                <p className="consumer-name">{invoice.consumerName || invoice.client?.name || ""}</p>
              </div>
            </div>
          </div>

          <div className="usage-section">
            <ConsumptionChart points={points} />
            <div className="meter-summary">
              <div className="meter-col">
                <p className="meter-label">Numărul<br />contorului</p>
                <p className="meter-value">{invoice.meterNumber || "—"}</p>
              </div>
              <div className="meter-col">
                <p className="meter-label">Indicii<br />precedenți</p>
                <p className="meter-value">{invoice.meterPrevReading || "—"}</p>
              </div>
              <div className="meter-col">
                <p className="meter-label">Indicii<br />actuali</p>
                <p className="meter-value">{invoice.meterCurrReading || "—"}</p>
              </div>
              <div className="meter-col">
                <p className="meter-label">Volum<br />estimativ</p>
                <p className="meter-value">{invoice.isEstimatedVolume ? "DA" : ""}</p>
              </div>
            </div>
          </div>

          {invoice.billingPeriodLabel && (
            <p className="calc-period">Perioada de calcul: <b>{invoice.billingPeriodLabel.toUpperCase()}</b></p>
          )}

          <div className="services-section">
            <table className="services-table">
              <thead>
                <tr>
                  <th>Denumirea serviciului</th>
                  <th>Volumul,m3</th>
                  <th>Tariful lei/m3</th>
                  <th>Suma calculata</th>
                </tr>
              </thead>
              <tbody>
                {apaItem && (
                  <tr>
                    <td>Serviciul de alimentare cu apa</td>
                    <td>{num2(apaItem.quantity)}</td>
                    <td>{num2(apaItem.unitPrice)}</td>
                    <td>{num2(apaItem.lineTotal)}</td>
                  </tr>
                )}
                {canalItem && (
                  <tr>
                    <td>Serviciul de canalizare</td>
                    <td>{num2(canalItem.quantity)}</td>
                    <td>{num2(canalItem.unitPrice)}</td>
                    <td>{num2(canalItem.lineTotal)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="totals-block">
              <div className="totals-mini">
                <div><span>Recalculări:</span><span>{invoice.recalculari ? num2(invoice.recalculari) : ""}</span></div>
                <div><span>Penalitate:</span><span>{invoice.penalitati ? num2(invoice.penalitati) : ""}</span></div>
              </div>
              <div className="totals-box">
                <div className="row"><span>Suma calculată</span><span>{num2(sumaCalculata)}</span></div>
                <div className="row"><span>Datorii(+)/avans(-)</span><span>{num2(invoice.datoriiAvans)}</span></div>
                <div className="grand"><span>Suma spre plată :</span><span>{num2(invoice.grandTotal)}</span></div>
              </div>
            </div>
          </div>

          <div className="notice-box atentie">
            <p className="notice-title">ATENȚIE !</p>
            <p className="notice-body">{company.apaCanalAtentieText}</p>
          </div>
        </main>

        <aside className="invoice-sidebar">
          <div className="sidebar-logo">
            {company.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo} alt={company.apaCanalCompanyLine} />
            ) : null}
          </div>
          <div className="sidebar-company-info">
            <p>{company.apaCanalAddress}</p>
            <p>{company.apaCanalEmail}</p>
            <p className="company-name">{company.apaCanalCompanyLine}</p>
            <p>{company.apaCanalCodFiscal}</p>
          </div>

          <div className="announcement-box">
            <p className="announcement-title">Anunț !</p>
            <p>{company.apaCanalAnuntText}</p>
          </div>

          <div className="contacts-section">
            <p className="contacts-heading">Contacte: <b>{company.apaCanalContactName}</b></p>
            {contactLines.map((c, i) => (
              <div key={i} className="contact-row">
                <span>{c.phone}</span>
                <span>{c.dept}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <style>{`
        @page { size: A4 landscape; margin: 6mm; }

        .invoice-page {
          width: 285mm;
          height: 198mm;
          overflow: hidden;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 2.45fr) minmax(56mm, 1fr);
          gap: 5mm;
          background: #ffffff;
          color: #111111;
          font-family: Arial, Helvetica, sans-serif;
          box-sizing: border-box;
          padding: 5mm;
          font-size: 9px;
          line-height: 1.3;
        }
        .invoice-page * { box-sizing: border-box; }

        .invoice-main { display: flex; flex-direction: column; min-width: 0; }
        .invoice-sidebar {
          display: flex;
          flex-direction: column;
          gap: 3mm;
          border-left: 1px solid #6fd3df;
          padding-left: 4mm;
        }

        .invoice-header h1 {
          font-size: 11.5px;
          font-weight: 700;
          text-align: left;
          margin: 0 0 1.5mm;
        }
        .header-rule { height: 1px; background: #6fd3df; margin-bottom: 2.5mm; }
        .header-details { display: flex; justify-content: space-between; gap: 4mm; margin-bottom: 3mm; }
        .dates-block p, .consumer-block p { margin: 0 0 1mm; font-size: 8.5px; }
        .consumer-block { text-align: right; }
        .cont-personal { font-weight: 700; }
        .sector-badge {
          display: inline-block;
          border: 1px solid #777777;
          border-radius: 4px;
          padding: 0 3px;
          font-size: 8px;
          font-weight: 400;
          margin: 0 3px 0 6px;
        }
        .consumer-name { font-weight: 700; text-transform: uppercase; }

        .usage-section { display: flex; gap: 4mm; align-items: flex-start; margin-bottom: 2.5mm; }
        .chart-area { flex: 0 0 50%; min-width: 0; }
        .chart-box { display: flex; gap: 1.5mm; height: 24mm; }
        .chart-yaxis {
          display: flex; flex-direction: column; justify-content: space-between;
          font-size: 7px; color: #555555; text-align: right; flex-shrink: 0;
        }
        .chart-yaxis-spacer { width: 14px; flex-shrink: 0; }
        .chart-plot { position: relative; flex: 1; }
        .chart-gridline { position: absolute; left: 0; right: 0; border-top: 1px solid #dddddd; }
        .chart-bars { position: relative; display: flex; align-items: flex-end; height: 100%; gap: 1mm; }
        .chart-bar-col { flex: 1; height: 100%; display: flex; align-items: flex-end; }
        .chart-bar { width: 100%; background: #4f81bd; }
        .chart-labels { display: flex; gap: 1.5mm; margin-top: 1mm; }
        .chart-labels-row { flex: 1; display: flex; gap: 1mm; }
        .chart-labels-row span { flex: 1; text-align: center; font-size: 7px; color: #555555; }

        .meter-summary { flex: 1; display: flex; gap: 4mm; padding-top: 2mm; }
        .meter-col { text-align: center; flex: 1; }
        .meter-label { font-size: 7.5px; color: #444444; margin: 0 0 1mm; line-height: 1.2; }
        .meter-value { font-size: 9px; font-weight: 600; margin: 0; }

        .calc-period { font-size: 9px; margin: 0 0 2.5mm; }

        .services-section { display: flex; gap: 4mm; margin-bottom: 2.5mm; }
        .services-table { flex: 0 0 66%; border-collapse: collapse; font-size: 8.5px; width: 66%; }
        .services-table th {
          border-top: 1px solid #6fd3df;
          border-bottom: 1px solid #6fd3df;
          font-weight: 600;
          text-align: left;
          padding: 1.3mm 2mm 1.3mm 0;
        }
        .services-table td { padding: 1.3mm 2mm 1.3mm 0; }
        .services-table th:not(:first-child), .services-table td:not(:first-child) { text-align: right; }

        .totals-block { flex: 1; display: flex; flex-direction: column; gap: 1.5mm; min-width: 0; }
        .totals-mini { font-size: 8.5px; }
        .totals-mini div { display: flex; justify-content: space-between; margin-bottom: 0.8mm; }
        .totals-box { background: #9ddff0; border-radius: 8px; padding: 2mm 3mm; font-size: 8.5px; }
        .totals-box .row { display: flex; justify-content: space-between; margin-bottom: 0.8mm; }
        .totals-box .grand { display: flex; justify-content: space-between; font-weight: 700; font-size: 12px; margin-top: 1mm; }

        .notice-box {
          margin-top: auto;
          background: #97ddeb;
          border-radius: 10px;
          padding: 2.5mm 3.5mm;
        }
        .notice-title { color: #ff2a1a; font-size: 13px; font-weight: 700; margin: 0 0 1mm; }
        .notice-body { font-size: 8px; line-height: 1.35; margin: 0; text-align: left; }

        .sidebar-logo { text-align: center; }
        .sidebar-logo img { max-width: 26mm; max-height: 26mm; margin: 0 auto; object-fit: contain; }
        .sidebar-company-info { text-align: center; font-size: 8px; line-height: 1.45; }
        .sidebar-company-info p { margin: 0 0 0.8mm; }
        .sidebar-company-info .company-name { font-weight: 700; }

        .announcement-box { background: #8fd8e7; border-radius: 16px; padding: 2.5mm 3.5mm; text-align: center; }
        .announcement-title { color: #ff2a1a; font-size: 13px; font-weight: 700; margin: 0 0 1mm; text-align: center; }
        .announcement-box p:not(.announcement-title) { font-size: 8px; margin: 0; line-height: 1.35; }

        .contacts-section { font-size: 8px; }
        .contacts-heading { margin: 0 0 1.2mm; font-weight: 600; }
        .contact-row { display: flex; justify-content: space-between; gap: 2mm; margin-bottom: 0.6mm; }
        .contact-row span:first-child { text-align: left; white-space: nowrap; }
        .contact-row span:last-child { text-align: right; }

        .invoice-preview-wrapper {
          width: 100%;
          overflow-x: auto;
          background: #f2f2f2;
          padding: 16px;
        }

        @media print {
          html, body { margin: 0; padding: 0; background: white; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .invoice-preview-wrapper { width: auto; overflow: visible; background: white; padding: 0; }
          .invoice-page {
            width: 285mm;
            height: 198mm;
            margin: 0 auto;
            box-shadow: none;
            border: none;
            border-radius: 0;
            page-break-inside: avoid;
            break-inside: avoid;
            overflow: hidden;
          }
          .no-print { display: none !important; }
        }
      `}</style>
    </>
  );
}
