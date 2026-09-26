import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { getCurrentUser } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/services/audit";
import { importApaCanalBuffer } from "@/lib/services/apa-canal-import";
import { acquireSyncLock, ApiFetchError, fetchFromConfiguredApi, getApiConfigPublic, recordSync, releaseSyncLock } from "@/lib/services/apa-canal-api";

export const dynamic = "force-dynamic";
// Descărcare + procesare (~18.000 de abonați durează sub 2 minute) — marjă generoasă.
export const maxDuration = 300;

/**
 * Extrage plătitorii din API-ul configurat. `{ commit: false }` (implicit) = doar testează conexiunea și
 * arată ce s-ar schimba (statistici, nimic nu se scrie); `{ commit: true }` = scrie efectiv.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Autentificare necesară." }, { status: 401 });
  if (!can(user, "invoices.create") || !can(user, "clients.create") || !can(user, "clients.edit")) {
    return Response.json({ error: "Nu ai permisiunea de a importa date Apă-Canal." }, { status: 403 });
  }

  let commit = false;
  try {
    commit = (await req.json())?.commit === true;
  } catch {
    /* corp lipsă = doar test */
  }

  if (!(await getApiConfigPublic()).url) {
    return Response.json({ error: "API-ul nu e configurat. Completează linkul și credențialele și salvează." }, { status: 400 });
  }
  if (!(await acquireSyncLock())) {
    return Response.json({ error: "O sincronizare rulează deja. Încearcă din nou peste câteva minute." }, { status: 409 });
  }
  try {
    const buf = await fetchFromConfiguredApi();
    const { plan, applied } = await importApaCanalBuffer(buf, { ownerId: user.id, commit });

    if (!commit || !applied) {
      await recordSync(true, `Test reușit: ${plan.stats.documenteTotale} abonați în API, ${plan.stats.clientiNoiDeCreat} clienți noi, ${plan.stats.facturiDeCreat} facturi noi.`);
      return Response.json({ dryRun: true, stats: plan.stats });
    }

    revalidateTag("clients", { expire: 0 });
    const msg = `Sincronizat: ${applied.clientsCreated} clienți noi, ${applied.clientsUpdated} actualizați, ${applied.invoicesCreated} facturi noi.`;
    await recordSync(true, msg, { wrote: true, contentHash: createHash("sha256").update(buf).digest("hex") });
    await logAudit(
      { id: user.id, name: user.name, role: user.role, isSuperAdmin: user.isSuperAdmin },
      { action: "invoice.bulk_import", module: "Invoices", objectName: `Sincronizare API Apă-Canal — ${plan.stats.documenteTotale} documente`, newValue: `${msg} Linii: ${applied.itemsCreated}.` },
    );
    return Response.json({ dryRun: false, stats: plan.stats, applied });
  } catch (e) {
    const message =
      e instanceof ApiFetchError ? e.message : e instanceof Error ? e.message : "Eroare necunoscută la sincronizare.";
    if (!(e instanceof ApiFetchError)) console.error("[apa-canal-api] sincronizare eșuată:", e);
    await recordSync(false, message).catch(() => {});
    // Erorile de conexiune/autentificare sunt ale API-ului, nu ale aplicației — 502 le deosebește de un bug.
    return Response.json({ error: message }, { status: e instanceof ApiFetchError ? 502 : 400 });
  } finally {
    await releaseSyncLock().catch(() => {});
  }
}
