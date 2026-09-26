import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";

/**
 * Criptare pentru secretele păstrate în baza de date (parole/token-uri de integrare) — AES-256-GCM,
 * cheia derivată din SESSION_SECRET. Un dump al bazei de date nu dezvăluie parolele; cine are și
 * variabilele de mediu ale aplicației le poate citi (inevitabil: aplicația trebuie să le folosească).
 * Dacă SESSION_SECRET se schimbă, secretele vechi nu se mai pot decripta și trebuie reintroduse.
 */
const key = () => createHash("sha256").update(`integration-secrets:${env.sessionSecret}`).digest();

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

/** Întoarce null dacă valoarea lipsește, e coruptă sau cheia s-a schimbat. */
export function decryptSecret(box: string | null | undefined): string | null {
  if (!box) return null;
  try {
    const [v, iv, tag, enc] = box.split(".");
    if (v !== "v1" || !iv || !tag || !enc) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
