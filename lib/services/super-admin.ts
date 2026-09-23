import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Invariant: în sistem există ÎNTOTDEAUNA cel puțin un super-admin activ.
 *
 * Primul cont creat devine super-admin în `lib/prisma.ts` (extensia pe user.create). Aici acoperim
 * restul cazurilor prin care sistemul poate rămâne fără super-admin — cont șters, dezactivat,
 * retrogradat, bază de date restaurată/editată manual, cont creat înainte să existe regula —
 * situație din care aplicația nu avea nicio cale de ieșire (Audit Logs și gestionarea
 * super-adminilor deveneau inaccesibile pentru toți).
 *
 * Alegere: cel mai vechi administrator activ (dacă nu există niciunul: cel mai vechi cont activ) —
 * deterministă, deci două cereri simultane promovează același cont.
 */

// Verificarea rulează pe calea fierbinte (getCurrentUser), așa că rezultatul pozitiv se ține minte
// puțin. E per instanță de server; cel mult o interogare pe minut în plus.
const OK_TTL_MS = 60_000;
let okUntil = 0;

export type SuperAdminHeal = { promotedId: string; name: string } | null;

export async function ensureSuperAdminExists(): Promise<SuperAdminHeal> {
  if (Date.now() < okUntil) return null;

  const supers = await prisma.user.count({ where: { isSuperAdmin: true, isActive: true } });
  if (supers > 0) {
    okUntil = Date.now() + OK_TTL_MS;
    return null;
  }

  const candidate =
    (await prisma.user.findFirst({
      where: { isActive: true, role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    })) ??
    (await prisma.user.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }));
  if (!candidate) return null; // niciun cont activ — primul cont creat va deveni super-admin (lib/prisma.ts)

  await prisma.user.update({
    where: { id: candidate.id },
    data: { isSuperAdmin: true, role: "ADMIN" },
  });
  console.warn(`[super-admin] Nu exista niciun super-admin activ; promovat automat: ${candidate.name} (${candidate.id})`);
  okUntil = Date.now() + OK_TTL_MS;
  return { promotedId: candidate.id, name: candidate.name };
}

/** Apelat după orice operație care poate elimina un super-admin (șterge/dezactivează/retrogradează). */
export function invalidateSuperAdminCheck() {
  okUntil = 0;
}

/** Câți super-admini activi ar rămâne dacă `exceptId` ar dispărea. */
export async function otherActiveSuperAdmins(exceptId: string): Promise<number> {
  return prisma.user.count({ where: { isSuperAdmin: true, isActive: true, id: { not: exceptId } } });
}
