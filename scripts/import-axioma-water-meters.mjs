// Import one-off: public/device_admin_table_axioma_w1_water_meters_list.xlsx — export de la
// sistemul de contorizare Axioma W1 (1045 contoare, adresă/GPS/indice curent), dar FĂRĂ nume
// proprietar și FĂRĂ număr de contract (acelea vin din 1C, integrare separată, ulterioară).
// Pentru testare: numărul de contract ("Serie contor" pt. portal) devine secvențial (1,2,3...),
// iar numele e un placeholder pe baza ID-ului contorului, până vine integrarea reală cu 1C.
import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SRC = "public/device_admin_table_axioma_w1_water_meters_list.xlsx";
const OWNER_EMAIL = "caramangheorghe7b@gmail.com";

const COL = { entityName: 0, adresa: 6, blocNr: 7, apartmentNr: 8 };

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL }, select: { id: true } });
  if (!owner) throw new Error(`Nu găsesc contul owner: ${OWNER_EMAIL}`);

  const wb = XLSX.readFile(SRC);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });

  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const entityName = String(row[COL.entityName] || "").trim();
    if (!entityName) continue;
    const adresa = String(row[COL.adresa] || "").trim();
    const blocNr = String(row[COL.blocNr] || "").trim();
    const apartmentNr = String(row[COL.apartmentNr] || "").trim();
    const notes = [adresa, blocNr && `bl. ${blocNr}`, apartmentNr && `ap. ${apartmentNr}`]
      .filter(Boolean)
      .join(", ");

    data.push({
      userId: owner.id,
      name: `Contor ${entityName}`, // placeholder — numele real vine din 1C, ulterior
      meterSeries: String(i), // secvențial (1,2,3...), placeholder pt. testare
      notes: notes || null,
    });
  }

  // MongoDB connector-ul Prisma nu suportă `skipDuplicates` la createMany.
  const res = await prisma.client.createMany({ data });
  console.log(`Clienți creați: ${res.count} din ${data.length} rânduri procesate.`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
