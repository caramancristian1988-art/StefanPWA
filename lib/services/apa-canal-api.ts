import "server-only";
import { prisma } from "../prisma";
import { decryptSecret, encryptSecret } from "../secret-box";

/**
 * Sincronizarea plătitorilor Apă-Canal dintr-un API (exportul 1C expus printr-un serviciu HTTP).
 * Aici: configurarea (link + credențiale, parola criptată în baza de date) și descărcarea răspunsului.
 * Procesarea propriu-zisă (parsare → plan → scriere) e aceeași ca la importul din fișier:
 * vezi importApaCanalBuffer în apa-canal-import.ts.
 */

const KEY = "apa-canal-1c";
const MAX_BYTES = 250 * 1024 * 1024;
const TIMEOUT_MS = 240_000;

export type ApiConfigPublic = {
  url: string;
  username: string;
  hasPassword: boolean;
  hasToken: boolean;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncMessage: string | null;
};

const EMPTY: ApiConfigPublic = { url: "", username: "", hasPassword: false, hasToken: false, lastSyncAt: null, lastSyncOk: null, lastSyncMessage: null };

/** Configurația fără secrete — asta e tot ce ajunge vreodată în browser. */
export async function getApiConfigPublic(): Promise<ApiConfigPublic> {
  const row = await prisma.apiIntegration.findFirst({ where: { key: KEY } });
  if (!row) return EMPTY;
  return {
    url: row.url ?? "",
    username: row.username ?? "",
    hasPassword: !!decryptSecret(row.passwordEnc),
    hasToken: !!decryptSecret(row.tokenEnc),
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastSyncOk: row.lastSyncOk,
    lastSyncMessage: row.lastSyncMessage,
  };
}

export type ApiConfigInput = {
  url: string;
  username: string;
  /** undefined = păstrează parola existentă; "" = șterge-o; altfel = parola nouă. */
  password?: string;
  token?: string;
};

export function validateApiUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Introdu linkul API-ului." };
  if (value.length > 600) return { ok: false, error: "Link prea lung." };
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return { ok: false, error: "Linkul nu e valid (ex: https://server.exemplu.md/api/platitori)." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "Linkul trebuie să înceapă cu http:// sau https://." };
  if (u.username || u.password) return { ok: false, error: "Nu pune login/parola în link — completează-le în câmpurile de mai jos." };
  return { ok: true, url: u.toString() };
}

export async function saveApiConfig(input: ApiConfigInput, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = validateApiUrl(input.url);
  if (!v.ok) return v;
  const username = input.username.trim().slice(0, 200);

  const existing = await prisma.apiIntegration.findFirst({ where: { key: KEY } });
  const data = {
    url: v.url,
    username: username || null,
    passwordEnc: input.password === undefined ? existing?.passwordEnc ?? null : input.password === "" ? null : encryptSecret(input.password),
    tokenEnc: input.token === undefined ? existing?.tokenEnc ?? null : input.token === "" ? null : encryptSecret(input.token),
    updatedById: userId,
  };
  if (existing) await prisma.apiIntegration.update({ where: { id: existing.id }, data });
  else await prisma.apiIntegration.create({ data: { key: KEY, ...data } });
  return { ok: true };
}

export async function recordSync(ok: boolean, message: string) {
  const existing = await prisma.apiIntegration.findFirst({ where: { key: KEY }, select: { id: true } });
  if (!existing) return;
  await prisma.apiIntegration.update({
    where: { id: existing.id },
    data: { lastSyncAt: new Date(), lastSyncOk: ok, lastSyncMessage: message.slice(0, 500) },
  });
}

/**
 * Blocare "o singură sincronizare odată" (valabilă 10 min, ca să nu rămână blocat pe veci după un
 * crash). Întoarce false dacă rulează deja una.
 */
export async function acquireSyncLock(): Promise<boolean> {
  const row = await prisma.apiIntegration.findFirst({ where: { key: KEY }, select: { id: true } });
  if (!row) return false;
  const now = new Date();
  const res = await prisma.apiIntegration.updateMany({
    // câmpul poate lipsi complet din document (nu doar să fie null) — de-aia și isSet:false
    where: { id: row.id, OR: [{ syncLockUntil: null }, { syncLockUntil: { isSet: false } }, { syncLockUntil: { lt: now } }] },
    data: { syncLockUntil: new Date(now.getTime() + 10 * 60_000) },
  });
  return res.count === 1;
}

export async function releaseSyncLock() {
  await prisma.apiIntegration.updateMany({ where: { key: KEY }, data: { syncLockUntil: null } });
}

export class ApiFetchError extends Error {}

/** Descarcă răspunsul API-ului configurat (cu login/parolă Basic sau token Bearer). */
export async function fetchFromConfiguredApi(): Promise<Buffer> {
  const row = await prisma.apiIntegration.findFirst({ where: { key: KEY } });
  if (!row?.url) throw new ApiFetchError("API-ul nu e configurat. Completează linkul și credențialele.");
  const username = row.username ?? "";
  const password = decryptSecret(row.passwordEnc) ?? "";
  const token = decryptSecret(row.tokenEnc) ?? "";
  if (row.passwordEnc && !password) throw new ApiFetchError("Parola salvată nu mai poate fi citită (cheia aplicației s-a schimbat). Introdu-o din nou.");

  const headers: Record<string, string> = { Accept: "application/json, text/plain, */*" };
  if (username) headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  else if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(row.url, { headers, redirect: "manual", signal: ctrl.signal, cache: "no-store" });
  } catch (e) {
    clearTimeout(timer);
    throw new ApiFetchError(describeNetworkError(e));
  }

  try {
    if (res.status >= 300 && res.status < 400) {
      throw new ApiFetchError(`API-ul redirecționează (${res.status}) către ${res.headers.get("location") ?? "altă adresă"}. Pune linkul final în configurare.`);
    }
    if (res.status === 401 || res.status === 403) throw new ApiFetchError(`API-ul a respins autentificarea (${res.status}) — verifică login-ul și parola.`);
    if (res.status === 404) throw new ApiFetchError("Adresa nu există (404) — verifică linkul.");
    if (!res.ok) throw new ApiFetchError(`API-ul a răspuns cu eroarea ${res.status}.`);

    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BYTES) throw new ApiFetchError("Răspunsul API-ului e prea mare (peste 250 MB).");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new ApiFetchError("Răspunsul API-ului e prea mare (peste 250 MB).");
    if (buf.length === 0) throw new ApiFetchError("API-ul a răspuns gol.");
    return buf;
  } catch (e) {
    if (e instanceof ApiFetchError) throw e;
    throw new ApiFetchError(describeNetworkError(e));
  } finally {
    clearTimeout(timer);
  }
}

function describeNetworkError(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = err?.cause?.code ?? "";
  if (err?.name === "AbortError") return "API-ul nu a răspuns în 4 minute (timeout).";
  if (code === "ECONNREFUSED") return "Conexiune refuzată — serverul nu e accesibil de aici. Dacă API-ul e doar în rețeaua locală, aplicația de pe internet nu îl poate atinge (trebuie expus public sau printr-un tunel/VPN).";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Adresa nu a fost găsită (DNS) — verifică numele serverului din link.";
  if (code === "ETIMEDOUT" || code === "EHOSTUNREACH" || code === "ENETUNREACH" || code === "UND_ERR_CONNECT_TIMEOUT") return "Serverul nu răspunde — probabil e doar în rețeaua locală și nu poate fi atins de pe internet.";
  if (/CERT|SSL|TLS|self.signed|unable to verify/i.test(code + " " + (err?.cause?.message ?? "") + " " + (err?.message ?? ""))) return "Certificatul SSL al serverului nu e valid (autosemnat sau expirat).";
  return `Nu m-am putut conecta la API (${code || err?.message || "eroare necunoscută"}).`;
}
