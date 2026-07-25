// Suprascrieri poziție/mărime pentru editorul vizual al facturii Apă-Canal.
// "Elementele poziționabile" (logo, cele două linii) se pot muta/redimensiona liber (px<->mm, Rnd).
// "Elementele de text" (companyInfoText, anuntText, atentieText) au doar mărime font + bold.

export type ApaCanalPositionalKey = "logo" | "titleLine" | "totalsConnectorLine";
export type ApaCanalTextKey = "companyInfoText" | "anuntText" | "atentieText";
export type ApaCanalElementKey = ApaCanalPositionalKey | ApaCanalTextKey;

export type ApaCanalElementOverride = {
  xMm?: number;
  yMm?: number;
  widthMm?: number;
  heightMm?: number;
  fontSizeMm?: number;
  bold?: boolean;
};

export type ApaCanalLayout = Partial<Record<ApaCanalElementKey, ApaCanalElementOverride>>;

export const APA_CANAL_POSITIONAL_LABELS: Record<ApaCanalPositionalKey, string> = {
  logo: "Logo",
  titleLine: "Linia de sub titlu",
  totalsConnectorLine: "Linia spre caseta de total",
};

export const APA_CANAL_TEXT_LABELS: Record<ApaCanalTextKey, string> = {
  companyInfoText: "Text companie (adresă/email/nume/cod fiscal)",
  anuntText: "Text „Anunț”",
  atentieText: "Text „Atenție”",
};

/** Poziții/mărimi implicite (mm), folosite doar ca punct de plecare în editor înainte de prima ajustare. */
export const APA_CANAL_LAYOUT_DEFAULTS: Record<ApaCanalPositionalKey, Required<Pick<ApaCanalElementOverride, "xMm" | "yMm" | "widthMm" | "heightMm">>> = {
  logo: { xMm: 215, yMm: 5, widthMm: 77, heightMm: 42 },
  titleLine: { xMm: 5, yMm: 12, widthMm: 222, heightMm: 0.6 },
  totalsConnectorLine: { xMm: 175, yMm: 148, widthMm: 40, heightMm: 1.5 },
};

export const MM_TO_PX = 96 / 25.4;

export const round1 = (n: number) => Math.round(n * 10) / 10;
