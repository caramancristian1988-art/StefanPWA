"use client";

/**
 * Trimite automat formularul din jur când se schimbă un <select> din interior — ca alegerea unei
 * luni/unui sector etc. să filtreze imediat, fără să mai fie nevoie să apeși separat "Filtrează".
 * Rămâne un formular GET obișnuit (fără JS, tot merge — doar apeși butonul); asta e doar o
 * comoditate. Nu prinde inputurile de text (q/stradă), ca să nu trimită formularul la fiecare literă.
 */
export default function AutoSubmitOnChange({ children }: { children: React.ReactNode }) {
  return (
    <div
      onChange={(e) => {
        const el = e.target as HTMLElement;
        if (el.tagName !== "SELECT") return;
        el.closest("form")?.requestSubmit();
      }}
    >
      {children}
    </div>
  );
}
