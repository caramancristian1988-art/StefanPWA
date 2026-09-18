import { getCurrentUser } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/services/audit";
import { buildTariffUpdatePlan, applyTariffUpdatePlan } from "@/lib/services/apa-canal-tariff";

// Poate atinge mii de facturi (fiecare cu propriile linii) — vezi și /api/import/apa-canal-json
// pentru aceeași motivație a duratei extinse.
export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Autentificare necesară." }, { status: 401 });
  if (!can(user, "admin")) {
    return Response.json({ error: "Doar administratorul poate aplica tariful la facturile existente." }, { status: 403 });
  }

  let body: { commit?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cerere invalidă." }, { status: 400 });
  }
  const commit = body.commit === true;

  const company = await prisma.companySettings.findUnique({
    where: { singleton: "main" },
    select: { apaCanalTarifApa: true, apaCanalTarifCanal: true },
  });
  const tarifApa = company?.apaCanalTarifApa ?? 0;
  const tarifCanal = company?.apaCanalTarifCanal ?? 0;
  if (tarifApa <= 0 && tarifCanal <= 0) {
    return Response.json({ error: "Setează întâi un tarif (apă și/sau canalizare) mai mare ca 0 și salvează-l." }, { status: 400 });
  }

  const plan = await buildTariffUpdatePlan(prisma, tarifApa, tarifCanal);

  if (!commit) {
    return Response.json({ dryRun: true, tarifApa, tarifCanal, stats: plan.stats });
  }

  const applied = await applyTariffUpdatePlan(prisma, plan);

  await logAudit(
    { id: user.id, name: user.name, role: user.role, isSuperAdmin: user.isSuperAdmin },
    {
      action: "invoice.bulk_tariff_update",
      module: "Invoices",
      objectName: `Aplicare tarif nou (apă ${tarifApa}, canal ${tarifCanal}) la facturi existente`,
      newValue: `Facturi actualizate: ${applied.invoicesUpdated}, linii: ${applied.itemsUpdated}. Total datorat: ${plan.stats.oldTotalDue} → ${plan.stats.newTotalDue} MDL.`,
    },
  );

  return Response.json({ dryRun: false, tarifApa, tarifCanal, stats: plan.stats, applied });
}
