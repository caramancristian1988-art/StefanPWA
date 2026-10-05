"use client";

/**
 * Trimite automat formularul din jur când se schimbă un <select> (sau un <input type="date">) din
 * interior — ca alegerea unei luni/unui sector/unei date etc. să filtreze imediat, fără să mai fie
 * nevoie să apeși separat "Filtrează". Rămâne un formular GET obișnuit (fără JS, tot merge — doar
 * apeși butonul); asta e doar o comoditate. Nu prinde inputurile de text libere (q/stradă), ca să nu
 * trimită formularul la fiecare literă — un <input type="date"> nu are acest risc (onChange se
 * declanșează abia când utilizatorul a ales o dată completă, nu la fiecare tastă).
 */
export default function AutoSubmitOnChange({ children }: { children: React.ReactNode }) {
  return (
    <div
      onChange={(e) => {
        const el = e.target as HTMLInputElement;
        const isDate = el.tagName === "INPUT" && el.type === "date";
        if (el.tagName !== "SELECT" && !isDate) return;
        el.closest("form")?.requestSubmit();
      }}
    >
      {children}
    </div>
  );
}
