// DIAGNOSTIC — temporar. Next.js redactează mesajul erorilor de Server Components trimis către
// client în producție ("The specific message is omitted..."), iar acest deploy nu are acces la
// dashboard-ul Vercel (log-uri de funcție). onRequestError rulează server-side, ÎNAINTE de
// redactare, cu eroarea completă — o scriem în AuditLog (colecție deja existentă) ca să putem
// citi mesajul real direct din baza de date. De șters imediat după diagnosticare.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Prisma nu rulează pe Edge (are nevoie de Node.js) — instrumentation.ts se bundle-uiește
  // pentru AMBELE runtime-uri; fără gardul ăsta, build-ul pică la varianta Edge (wasm lipsă).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { prisma } = await import("./lib/prisma");
    const e = err as Error & { digest?: string };
    await prisma.auditLog.create({
      data: {
        userId: null,
        userName: "SYSTEM-DEBUG",
        userRole: "SYSTEM",
        action: "debug.crash",
        module: "Settings",
        objectId: e.digest ?? null,
        objectName: request.path,
        oldValue: JSON.stringify(context).slice(0, 2000),
        newValue: `${e.name}: ${e.message}\n\n${e.stack ?? "(no stack)"}`.slice(0, 4000),
      },
    });
  } catch {
    // best-effort — nu bloca niciodată cererea din cauza logging-ului de diagnostic
  }
};
