"use client";

import { Rnd } from "react-rnd";
import type { Company } from "@/lib/queries/company";
import { fmtDate } from "./invoice-meta";
import {
  MM_TO_PX,
  round1,
  APA_CANAL_LAYOUT_DEFAULTS,
  type ApaCanalLayout,
  type ApaCanalElementKey,
  type ApaCanalElementOverride,
} from "@/lib/apa-canal-layout";

type ConsumPoint = { label: string; value: number };

export type ApaCanalInvoiceData = {
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
    <div className="flex gap-[1.5mm] overflow-hidden p-[1.5mm]" style={{ height: "44mm", background: COLOR_BG, border: `1px solid ${COLOR_BORDER}` }}>
      <div className="flex h-full shrink-0 flex-col justify-between text-right leading-none" style={{ color: COLOR_BORDER, fontSize: "2.6mm" }}>
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
        <div className="relative flex h-full items-end gap-[0.8mm]">
          {points.map((p, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
              <div
                className="w-full"
                style={{ maxWidth: "7mm", height: `${Math.max(1, (p.value / yMax) * 100)}%`, background: COLOR_BAR }}
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
    <div className="flex gap-[1.5mm]">
      <div className="shrink-0" style={{ width: "7mm" }} />
      <div className="flex flex-1 gap-[0.8mm]">
        {points.map((p, i) => (
          <span key={i} className="flex-1 text-center" style={{ color: COLOR_BORDER, fontSize: "2.6mm" }}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}

type FieldState = { overridden: boolean; textStyle: React.CSSProperties };

/**
 * Fiecare element de pe factură trece prin acest wrapper. Dacă nu există suprascriere și nu
 * suntem în editor, se randează exact ca înainte (în flux normal, grid/flex) — nicio schimbare
 * de comportament pentru facturile care nu ating niciodată editorul. Dacă există o suprascriere
 * sau suntem în modul editabil, elementul iese din flux și se poziționează absolut față de
 * `.invoice-page` (px<->mm), opțional cu mâner de tras/redimensionat (Rnd) în editor.
 */
function LayoutField({
  elementKey,
  layout,
  editable,
  onChange,
  defaultStyle,
  children,
  scale = 1,
}: {
  elementKey: ApaCanalElementKey;
  layout?: ApaCanalLayout | null;
  editable?: boolean;
  onChange?: (key: ApaCanalElementKey, override: ApaCanalElementOverride) => void;
  defaultStyle: React.CSSProperties;
  children: (state: FieldState) => React.ReactNode;
  /** Factorul de scalare vizuală a previzualizării în editor (react-rnd trebuie să știe de el ca să convertească corect delta-urile de mouse). */
  scale?: number;
}) {
  const override = layout?.[elementKey];
  // Notă: NU includem chei cu valoare `undefined` — un spread `{...textStyle}` peste un
  // `fontSize` implicit ar suprascrie acel implicit cu `undefined` chiar dacă cheia există
  // doar cu valoarea `undefined` (spread-ul copiază cheia, nu doar valorile "adevărate").
  const textStyle: React.CSSProperties = {
    ...(override?.fontSizeMm ? { fontSize: `${override.fontSizeMm}mm` } : {}),
    ...(override?.bold ? { fontWeight: 700 } : {}),
  };

  if (!editable && !override) {
    return <div style={defaultStyle}>{children({ overridden: false, textStyle })}</div>;
  }

  const base = APA_CANAL_LAYOUT_DEFAULTS[elementKey];
  const ov = {
    xMm: override?.xMm ?? base.xMm,
    yMm: override?.yMm ?? base.yMm,
    widthMm: override?.widthMm ?? base.widthMm,
    heightMm: override?.heightMm ?? base.heightMm,
  };
  const merged: ApaCanalElementOverride = { ...ov, fontSizeMm: override?.fontSizeMm, bold: override?.bold };

  if (!editable) {
    return (
      <div style={{ position: "absolute", left: `${ov.xMm}mm`, top: `${ov.yMm}mm`, width: `${ov.widthMm}mm`, height: `${ov.heightMm}mm` }}>
        {children({ overridden: true, textStyle })}
      </div>
    );
  }

  return (
    <Rnd
      // Necontrolat (`default`, nu `size`/`position`) — cu props controlate, react-rnd
      // "luptă" cu propriul drag intern dacă părintele nu retrimite poziția pe FIECARE
      // `onDrag` (nu doar la `onDragStop`), ceea ce anula practic tragerea cu mouse-ul.
      // `key` forțează un remount (deci resincronizare la valoarea nouă) când utilizatorul
      // schimbă X/Y/lățime/înălțime din câmpurile numerice, nu prin tragere.
      key={`${ov.xMm}-${ov.yMm}-${ov.widthMm}-${ov.heightMm}`}
      default={{
        x: ov.xMm * MM_TO_PX,
        y: ov.yMm * MM_TO_PX,
        width: ov.widthMm * MM_TO_PX,
        height: ov.heightMm * MM_TO_PX,
      }}
      onDragStop={(_e, d) => {
        onChange?.(elementKey, { ...merged, xMm: round1(d.x / MM_TO_PX), yMm: round1(d.y / MM_TO_PX) });
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        onChange?.(elementKey, {
          ...merged,
          widthMm: round1(ref.offsetWidth / MM_TO_PX),
          heightMm: round1(ref.offsetHeight / MM_TO_PX),
          xMm: round1(pos.x / MM_TO_PX),
          yMm: round1(pos.y / MM_TO_PX),
        });
      }}
      scale={scale}
      style={{ outline: `1px dashed ${COLOR_BAR}`, background: "rgba(134,211,234,0.10)" }}
    >
      <div style={{ width: "100%", height: "100%" }}>{children({ overridden: true, textStyle })}</div>
    </Rnd>
  );
}

export default function ApaCanalInvoicePublic({
  invoice,
  company,
  layout,
  editable,
  onLayoutChange,
  previewScale = 1,
}: {
  invoice: ApaCanalInvoiceData;
  company: Company;
  layout?: ApaCanalLayout | null;
  editable?: boolean;
  onLayoutChange?: (key: ApaCanalElementKey, override: ApaCanalElementOverride) => void;
  /** Factorul de scalare CSS aplicat de containerul din editor (vezi ApaCanalLayoutEditor). */
  previewScale?: number;
}) {
  const apaItem = invoice.items.find((it) => /alimentare cu apa/i.test(it.description));
  const canalItem = invoice.items.find((it) => /canalizare/i.test(it.description));
  const sumaCalculata = (apaItem?.lineTotal ?? 0) + (canalItem?.lineTotal ?? 0);
  const points: ConsumPoint[] = Array.isArray(invoice.monthlyConsumption)
    ? (invoice.monthlyConsumption as ConsumPoint[])
    : [];

  const field = (
    elementKey: ApaCanalElementKey,
    defaultStyle: React.CSSProperties,
    children: (state: FieldState) => React.ReactNode,
  ) => (
    <LayoutField elementKey={elementKey} layout={layout} editable={editable} onChange={onLayoutChange} defaultStyle={defaultStyle} scale={previewScale}>
      {children}
    </LayoutField>
  );

  return (
    <>
      <div className="invoice-page">
        {/* ── Titlu, pe toată lățimea ── */}
        <div style={{ gridColumn: "1 / -1", gridRow: 1 }}>
          {field("title", {}, ({ textStyle }) => (
            <h1 style={{ fontSize: "4mm", fontWeight: 600, margin: "0 0 1.5mm", ...textStyle }}>
              Factura pentru serviciul de alimentare cu apă și de canalizare
            </h1>
          ))}
          {field("titleLine", {}, ({ overridden }) =>
            overridden ? (
              <div style={{ width: "100%", height: "100%", background: COLOR_BOX_BLUE }} />
            ) : (
              <div style={{ height: "0.6mm", width: "calc(100% - 65mm)", background: COLOR_BOX_BLUE }} />
            )
          )}
        </div>

        {/* ── Rânduri 2-3, pe toată lățimea: UN SINGUR grid (chart | cont-personal/tabel | logo/text)
             — evită să depindem de repartizarea automată (imprevizibilă) a înălțimii între rândurile
             grid-ului exterior atunci când elementele se întind pe mai multe rânduri; aici tabelul
             contorului și textul companiei sunt literalmente pe același rând de grid, deci sunt
             mereu perfect aliniate, indiferent de ce se schimbă în jur. Fiecare bloc e totuși
             suprascriibil individual prin `field(...)`, care iese din grid dacă e mutat. ── */}
        <div style={{ gridColumn: "1 / -1", gridRow: "2 / 4", display: "grid", gridTemplateColumns: "1fr auto 27%", columnGap: "5mm" }}>
          {field(
            "datesBlock",
            { gridColumn: 1, gridRow: 1, marginTop: "2.5mm", alignSelf: "start" },
            ({ textStyle }) => (
              <div className="shrink-0 whitespace-nowrap" style={{ fontSize: "3mm", lineHeight: 1.7, ...textStyle }}>
                <p>Data emiterii: <b>{fmtDate(invoice.issueDate)}</b></p>
                <p>Data limită de achitare: <b>{fmtDate(invoice.dueDate)}</b></p>
              </div>
            ),
          )}

          {field(
            "contPersonalBlock",
            { gridColumn: 2, gridRow: 1, marginTop: "2.5mm", alignSelf: "start" },
            ({ textStyle }) => (
              <div className="whitespace-nowrap" style={{ fontSize: "3mm", lineHeight: 1.7, ...textStyle }}>
                <p className="font-bold">
                  Cont personal: {invoice.contPersonal || "—"}
                  {invoice.sectorNr && (
                    <span className="ml-2 rounded font-normal" style={{ border: `1.5px solid ${COLOR_TEXT}`, padding: "0 1mm", fontSize: "2.6mm" }}>
                      sector nr. {invoice.sectorNr}
                    </span>
                  )}
                </p>
                <p>Adresa locului de consum:</p>
                <p>{invoice.consumAddress || "—"}</p>
                <p className="font-bold uppercase">{invoice.consumerName || invoice.client?.name || ""}</p>
              </div>
            ),
          )}

          {field(
            "logo",
            { gridColumn: 3, gridRow: 1, display: "flex", justifyContent: "center", alignSelf: "start" },
            ({ overridden }) =>
              company.apaCanalLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.apaCanalLogo}
                  alt={company.apaCanalCompanyLine}
                  className="object-contain"
                  draggable={false}
                  style={overridden ? { width: "100%", height: "100%", pointerEvents: editable ? "none" : undefined } : { width: "100%", height: "auto" }}
                />
              ) : editable ? (
                <div className="flex h-full w-full items-center justify-center text-xs" style={{ color: COLOR_BORDER, border: `1px dashed ${COLOR_BORDER}` }}>Logo</div>
              ) : null,
          )}

          {field(
            "chart",
            { gridColumn: 1, gridRow: 2, marginTop: "3mm", alignSelf: "center" },
            () => (
              <div style={{ width: "100%" }}>
                <ConsumptionChart points={points} />
                <ConsumptionChartLabels points={points} />
              </div>
            ),
          )}

          {field(
            "meterTable",
            { gridColumn: 2, gridRow: 2, marginTop: "3mm", alignSelf: "start" },
            ({ textStyle }) => (
              <table className="text-center" style={{ fontSize: "2.8mm", ...textStyle }}>
                <thead>
                  <tr style={{ color: COLOR_BORDER }}>
                    <th className="whitespace-nowrap font-medium" style={{ padding: "0 2mm 1mm" }}>Numărul<br />contorului</th>
                    <th className="whitespace-nowrap font-medium" style={{ padding: "0 2mm 1mm" }}>Indicii<br />precedenți</th>
                    <th className="whitespace-nowrap font-medium" style={{ padding: "0 2mm 1mm" }}>Indicii<br />actuali</th>
                    <th className="whitespace-nowrap font-medium" style={{ padding: "0 2mm 1mm" }}>Volum<br />estimativ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-semibold">
                    <td className="whitespace-nowrap" style={{ padding: "0 2mm" }}>{invoice.meterNumber || "—"}</td>
                    <td className="whitespace-nowrap" style={{ padding: "0 2mm" }}>{invoice.meterPrevReading || "—"}</td>
                    <td className="whitespace-nowrap" style={{ padding: "0 2mm" }}>{invoice.meterCurrReading || "—"}</td>
                    <td className="whitespace-nowrap" style={{ padding: "0 2mm" }}>{invoice.isEstimatedVolume ? "DA" : ""}</td>
                  </tr>
                </tbody>
              </table>
            ),
          )}

          {field(
            "companyInfoText",
            { gridColumn: 3, gridRow: 2, marginTop: "3mm", alignSelf: "start" },
            ({ textStyle }) => (
              <div className="text-center" style={{ color: COLOR_TEXT, fontSize: "4mm", lineHeight: 1.15, ...textStyle }}>
                <p>{company.apaCanalAddress}</p>
                <p>{company.apaCanalEmail}</p>
                <p className="font-semibold">{company.apaCanalCompanyLine}</p>
                <p>{company.apaCanalCodFiscal}</p>
              </div>
            ),
          )}
        </div>

        {/* ── Rând 4: rest coloană principală | Anunț + contacte, grupate împreună ── */}
        <div className="flex flex-col" style={{ gridColumn: 1, gridRow: 4, marginTop: "3mm", gap: "2.5mm" }}>
          {invoice.billingPeriodLabel &&
            field("billingPeriodText", {}, ({ textStyle }) => (
              <p className="font-semibold" style={{ fontSize: "3mm", ...textStyle }}>Perioada de calcul: {invoice.billingPeriodLabel!.toUpperCase()}</p>
            ))}

          {/* Servicii */}
          {field("servicesTable", {}, () => (
            <table style={{ fontSize: "2.9mm", width: "100%" }}>
              <thead>
                <tr className="text-left" style={{ borderBottom: `1px solid ${COLOR_BOX_BLUE}`, color: COLOR_BORDER }}>
                  <th className="whitespace-nowrap font-medium" style={{ padding: "0.6mm 0" }}>Denumirea serviciului</th>
                  <th className="whitespace-nowrap text-right font-medium" style={{ padding: "0.6mm 0 0.6mm 14mm" }}>Volumul,m3</th>
                  <th className="whitespace-nowrap text-right font-medium" style={{ padding: "0.6mm 0 0.6mm 14mm" }}>Tariful lei/m3</th>
                  <th className="whitespace-nowrap text-right font-medium" style={{ padding: "0.6mm 0 0.6mm 14mm" }}>Suma calculata</th>
                </tr>
              </thead>
              <tbody>
                {apaItem && (
                  <tr style={{ borderBottom: `1px solid ${COLOR_BORDER_LIGHT}` }}>
                    <td className="whitespace-nowrap" style={{ padding: "0.8mm 0" }}>Serviciul de alimentare cu apa</td>
                    <td className="text-right tabular-nums" style={{ padding: "0.8mm 0" }}>{num2(apaItem.quantity)}</td>
                    <td className="text-right tabular-nums" style={{ padding: "0.8mm 0" }}>{num2(apaItem.unitPrice)}</td>
                    <td className="text-right tabular-nums" style={{ padding: "0.8mm 0" }}>{num2(apaItem.lineTotal)}</td>
                  </tr>
                )}
                {canalItem && (
                  <tr>
                    <td className="whitespace-nowrap" style={{ padding: "0.8mm 0" }}>Serviciul de canalizare</td>
                    <td className="text-right tabular-nums" style={{ padding: "0.8mm 0" }}>{num2(canalItem.quantity)}</td>
                    <td className="text-right tabular-nums" style={{ padding: "0.8mm 0" }}>{num2(canalItem.unitPrice)}</td>
                    <td className="text-right tabular-nums" style={{ padding: "0.8mm 0" }}>{num2(canalItem.lineTotal)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          ))}

          {/* Recalculări/Penalitate (text) + linie albastră până la casetă + totaluri (casetă, mai în dreapta) */}
          <div className="flex items-start" style={{ fontSize: "2.9mm", marginTop: "3mm" }}>
            <div className="flex flex-1 items-stretch">
              {field(
                "recalculariText",
                { flex: "0 0 auto" },
                ({ overridden, textStyle }) => (
                  <div
                    style={{
                      lineHeight: 1.3,
                      paddingTop: "2mm",
                      paddingBottom: "0.6mm",
                      borderBottom: overridden ? undefined : `1.5px solid ${COLOR_BOX_BLUE}`,
                      height: overridden ? "100%" : undefined,
                      ...textStyle,
                    }}
                  >
                    <p>Recalculări:{invoice.recalculari ? ` ${num2(invoice.recalculari)}` : ""}</p>
                    <p>Penalitate:{invoice.penalitati ? ` ${num2(invoice.penalitati)}` : ""}</p>
                  </div>
                ),
              )}
              {field(
                "totalsConnectorLine",
                { flex: 1, marginRight: "3mm" },
                ({ overridden }) =>
                  overridden ? (
                    <div style={{ width: "100%", height: "100%", background: COLOR_BOX_BLUE }} />
                  ) : (
                    <div style={{ height: "100%", borderBottom: `1.5px solid ${COLOR_BOX_BLUE}` }} />
                  ),
              )}
            </div>
            {field(
              "totalsBox",
              { flexShrink: 0, width: "58mm" },
              ({ textStyle }) => (
                <div style={{ background: COLOR_BOX_BLUE, borderRadius: "3mm", padding: "2mm 3mm", width: "100%", height: "100%", ...textStyle }}>
                  <div className="flex justify-between whitespace-nowrap">
                    <span>Suma calculată</span>
                    <span className="tabular-nums">{num2(sumaCalculata)}</span>
                  </div>
                  <div className="flex justify-between whitespace-nowrap">
                    <span>Datorii(+)/avans(-)</span>
                    <span className="tabular-nums">{num2(invoice.datoriiAvans)}</span>
                  </div>
                  <div className="flex justify-between whitespace-nowrap font-bold" style={{ borderTop: `1px solid ${COLOR_TEXT}`, marginTop: "1mm", paddingTop: "1mm", fontSize: "3.6mm" }}>
                    <span>Suma spre plată :</span>
                    <span className="tabular-nums">{num2(invoice.grandTotal)}</span>
                  </div>
                </div>
              ),
            )}
          </div>

          {/* ATENȚIE — se mulează pe conținut, nu se întinde până jos */}
          {field("atentieBox", {}, ({ overridden, textStyle }) => (
            <div style={{ background: COLOR_BOX_BLUE, borderRadius: "3.5mm", padding: "2.5mm 3.5mm", width: "100%", height: overridden ? "100%" : undefined }}>
              <p className="font-bold" style={{ color: COLOR_RED, fontSize: "4mm", margin: "0 0 1mm" }}>ATENȚIE !</p>
              <p style={{ color: COLOR_TEXT, fontSize: "2.8mm", lineHeight: 1.5, ...textStyle }}>{company.apaCanalAtentieText}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col self-start" style={{ gridColumn: 2, gridRow: 4, marginTop: "3mm", gap: "3mm" }}>
          {field("anuntBox", {}, ({ overridden, textStyle }) => (
            <div className="text-center" style={{ background: COLOR_BOX_BLUE, borderRadius: "7mm", padding: "2.5mm 3.5mm", width: "100%", height: overridden ? "100%" : undefined }}>
              <p className="font-bold" style={{ color: COLOR_RED, fontSize: "4mm", margin: "0 0 1mm" }}>Anunț !</p>
              <p style={{ color: COLOR_TEXT, fontSize: "2.7mm", lineHeight: 1.4, ...textStyle }}>{company.apaCanalAnuntText}</p>
            </div>
          ))}

          {field("contacteBlock", {}, ({ textStyle }) => (
            <div style={{ fontSize: "2.7mm", width: "100%", ...textStyle }}>
              <p className="font-semibold" style={{ marginBottom: "1mm" }}>Contacte: <span className="font-normal text-brand">{company.apaCanalContactName}</span></p>
              <div className="whitespace-pre-line" style={{ lineHeight: 1.8 }}>{company.apaCanalContactsText}</div>
            </div>
          ))}

          {field("scanQrBlock", {}, () => (
            <div className="text-center" style={{ fontSize: "2.7mm", width: "100%" }}>
              <p className="font-semibold" style={{ marginBottom: "1.5mm" }}>Scanează și achită</p>
              <div className="flex items-center justify-center" style={{ gap: "3mm" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/SpFih6.jpg" alt="Cod QR plată" style={{ width: "20mm", height: "20mm" }} />
                <div className="flex flex-col items-start" style={{ gap: "2mm" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/IMG_3987.PNG" alt="mia" className="object-contain" style={{ height: "5mm", width: "20mm" }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/IMG_3988.PNG" alt="Victoriabank" className="object-contain" style={{ height: "5mm", width: "20mm" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @page { size: A4 landscape; margin: 0; }

        .invoice-page {
          position: relative;
          width: 297mm;
          height: 210mm;
          padding: 5mm 5mm 4mm 5mm;
          box-sizing: border-box;
          background: #ffffff;
          color: ${COLOR_TEXT};
          font-family: Arial, Helvetica, sans-serif;
          display: grid;
          grid-template-columns: 73% 27%;
          grid-template-rows: auto auto auto 1fr;
          column-gap: 5mm;
          overflow: hidden;
        }
        .invoice-page * { box-sizing: border-box; }

        @media screen {
          .invoice-page {
            margin: 0 auto;
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
          }
        }

        @media print {
          html, body { margin: 0; padding: 0; background: white; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .invoice-page { box-shadow: none; }
          .no-print { display: none !important; }
        }

        /* Editor: fiecare element poziționabil (react-rnd) folosește CSS transform, care îi
           creează propriul context de stivuire — fără asta, elementele randate mai târziu în
           JSX acoperă mereu (vizual și la click) elementele randate mai devreme care se
           suprapun, blocând mânerele de redimensionare ale acestora din urmă. La hover, elementul
           de sub cursor trece în față, ca să fie mereu prindabil/redimensionabil. */
        .invoice-page .react-draggable:hover {
          z-index: 50;
        }
      `}</style>
    </>
  );
}
