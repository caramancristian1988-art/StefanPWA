// Backfill one-off: populează Client.lastInvoiceStatus/GrandTotal/SectorNr/IssueDate pentru
// clienții existenți la momentul adăugării acestor câmpuri (importul Apă-Canal + orice facturi
// create manual înainte). Rulabil în siguranță de mai multe ori (idempotent — recalculează
// mereu din ultima factură reală). Citește toate facturile o singură dată (dataset mic, ~18k
// rânduri) în loc de un query per client — mult mai rapid decât 19k findFirst separate.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CHUNK = 200;

async function main() {
  console.log("Citesc toate facturile...");
  const invoices = await prisma.invoice.findMany({
    where: { clientId: { not: null } },
    orderBy: { issueDate: "desc" },
    select: { clientId: true, status: true, grandTotal: true, sectorNr: true, issueDate: true },
  });
  console.log(`Facturi citite: ${invoices.length}`);

  // Prima apariție per clientId = cea mai recentă (deja sortat desc).
  const latestByClient = new Map();
  for (const inv of invoices) {
    if (!latestByClient.has(inv.clientId)) latestByClient.set(inv.clientId, inv);
  }
  console.log(`Clienți cu cel puțin o factură: ${latestByClient.size}`);

  const clients = await prisma.client.findMany({ select: { id: true } });
  console.log(`Total clienți: ${clients.length}`);

  let withInvoice = 0;
  let withoutInvoice = 0;
  for (let i = 0; i < clients.length; i += CHUNK) {
    const slice = clients.slice(i, i + CHUNK);
    await Promise.all(
      slice.map((c) => {
        const latest = latestByClient.get(c.id);
        if (latest) withInvoice++;
        else withoutInvoice++;
        return prisma.client.update({
          where: { id: c.id },
          data: {
            lastInvoiceStatus: latest?.status ?? null,
            lastInvoiceGrandTotal: latest?.grandTotal ?? null,
            lastInvoiceSectorNr: latest?.sectorNr ?? null,
            lastInvoiceIssueDate: latest?.issueDate ?? null,
          },
        });
      }),
    );
    process.stdout.write(`\r  ${Math.min(i + CHUNK, clients.length)}/${clients.length}`);
  }
  console.log(`\nGata. Cu instantaneu populat: ${withInvoice}, fără nicio factură: ${withoutInvoice}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
