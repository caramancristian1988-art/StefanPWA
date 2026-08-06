import "server-only";
import { createHash, randomInt } from "node:crypto";
import { prisma } from "../prisma";

const CODE_TTL_MINUTES = 15;
// Peste acest număr de încercări greșite pe codul activ, îl considerăm blocat — chiar dacă
// utilizatorul nimerește ulterior codul corect — ca să nu poată fi ghicit prin brute-force
// (6 cifre = doar 1.000.000 combinații, altfel epuizabile în cele 15 minute de valabilitate).
const MAX_ATTEMPTS = 5;

export type CodePurpose = "PASSWORD_CHANGE" | "PASSWORD_RESET";

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Generează un cod din 6 cifre, îl stochează hash-uit și îl întoarce (o singură dată, în clar). */
export async function createVerificationCode(
  userId: string,
  purpose: CodePurpose,
): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.verificationCode.create({
    data: {
      userId,
      purpose,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      // Explicit null (nu omis): pe MongoDB, un filtru `usedAt: null` nu găsește
      // documente unde câmpul lipsește complet din document, doar unde e null explicit.
      usedAt: null,
    },
  });
  return code;
}

/**
 * Verifică un cod și, dacă e valid, îl marchează folosit (nu poate fi refolosit).
 * Ia mereu cel mai recent cod NEEXPIRAT/nefolosit pentru (userId, purpose) — nu mai caută
 * direct după hash — ca să poată număra și limita încercările greșite pe acel cod anume.
 */
export async function consumeVerificationCode(
  userId: string,
  purpose: CodePurpose,
  code: string,
): Promise<boolean> {
  const found = await prisma.verificationCode.findFirst({
    where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true, attempts: true },
  });
  if (!found) return false;
  if ((found.attempts ?? 0) >= MAX_ATTEMPTS) return false;

  if (found.codeHash !== hashCode(code.trim())) {
    await prisma.verificationCode.update({
      where: { id: found.id },
      data: { attempts: (found.attempts ?? 0) + 1 },
    });
    return false;
  }

  await prisma.verificationCode.update({ where: { id: found.id }, data: { usedAt: new Date() } });
  return true;
}
