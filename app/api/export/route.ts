import { getCurrentUser } from "@/lib/dal";
import { listTasks } from "@/lib/queries/tasks";
import { listClients } from "@/lib/queries/clients";
import { buildPayerWhere } from "@/lib/queries/payers";
import { INVOICE_STATUS_LIST, INVOICE_STATUS } from "@/app/components/invoice-meta";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { toCSV, toXLSX, csvResponse, xlsxResponse, streamText } from "@/lib/export-utils";
import { formatDate, formatTime, DEFAULT_TZ } from "@/lib/date";
import type { TaskStatus, TaskType, TaskPriority, ProjectStatus, AppointmentStatus, InvoiceStatus } from "@prisma/client";

const TZ = DEFAULT_TZ;

const STATUS_RO: Record<string, string> = {
  NEW: "Nou", ASSIGNED: "Asignat", READ: "Citit", IN_PROGRESS: "În lucru",
  ON_HOLD: "În așteptare", REVIEW: "Review", DONE: "Finalizat", CANCELLED: "Anulat",
  CONFIRMED: "Confirmat", NO_SHOW: "Absent",
  ACTIVE: "Activ", ARCHIVED: "Arhivat",
};
const PRIO_RO: Record<string, string> = { LOW: "Scăzută", MEDIUM: "Medie", HIGH: "Ridicată", URGENT: "Urgentă" };
const TYPE_RO: Record<string, string> = { TASK: "Task", TICKET: "Tichet" };

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return formatDate(d, TZ);
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  return `${formatDate(d, TZ)} ${formatTime(d, TZ)}`;
}

function today(): string {
  return fmtDate(new Date()).replace(/\./g, "-");
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Autentificare necesară.", { status: 401 });

  const sp = new URL(req.url).searchParams;
  const entity = sp.get("entity") ?? "";
  const format = (sp.get("format") ?? "csv") as "csv" | "xlsx" | "json";
  const isXLSX = format === "xlsx";

  const BOM = "﻿";

  function makeResponse(headers: string[], rows: Record<string, string | number | boolean | null | undefined>[], filename: string) {
    if (format === "json") {
      // Cheile sunt aceleași ca antetele din Excel/CSV, deci fișierul se poate reimporta.
      const data = rows.map((r) => Object.fromEntries(headers.map((h) => [h, r[h] ?? ""])));
      return new Response(streamText(JSON.stringify(data, null, 2)), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}-${today()}.json"`,
        },
      });
    }
    if (isXLSX) {
      return xlsxResponse(toXLSX(headers, rows), `${filename}-${today()}.xlsx`);
    }
    return csvResponse(BOM + toCSV(headers, rows), `${filename}-${today()}.csv`);
  }

  // ─── TASKS ────────────────────────────────────────────────────────
  if (entity === "tasks" || entity === "tickets") {
    const type: TaskType[] = entity === "tickets" ? ["TICKET"] : ["TASK"];
    const { items } = await listTasks({
      userId: user.id,
      teamIds: user.teamIds,
      scope: (sp.get("scope") as "all" | "mine" | "created") || "all",
      status: (sp.get("status") as TaskStatus) || undefined,
      types: type,
      priority: (sp.get("prio") as TaskPriority) || undefined,
      projectId: sp.get("proj") || undefined,
      clientId: sp.get("client") || undefined,
      categoryId: sp.get("category") || undefined,
      assigneeId: sp.get("assignee") || undefined,
      teamId: sp.get("team") || undefined,
      dueRange: (sp.get("due") as "overdue" | "today" | "tomorrow" | "week" | "month") || undefined,
      search: sp.get("q") || undefined,
      sort: (sp.get("sort") as "default" | "dueAsc" | "dueDesc") || undefined,
      page: 1,
      pageSize: 5000,
    });

    // Batch-resolve client names (clientId is denormalized on task)
    const clientIds = [...new Set(items.map((t) => t.clientId).filter(Boolean) as string[])];
    const clientUsers = clientIds.length
      ? await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
      : [];
    const clientNameMap = new Map(clientUsers.map((c) => [c.id, c.name]));

    const HEADERS = ["#", "Titlu", "Tip", "Status", "Prioritate", "Asignat", "Echipă", "Proiect", "Client", "Categorie", "Scadent", "Progres (%)", "Creat la", "Creat de", "Descriere"];
    const rows = items.map((t) => ({
      "#": t.seq ?? "",
      "Titlu": t.title,
      "Tip": TYPE_RO[t.type] ?? t.type,
      "Status": STATUS_RO[t.status] ?? t.status,
      "Prioritate": PRIO_RO[t.priority] ?? t.priority,
      "Asignat": t.assigneeName ?? "",
      "Echipă": t.teamName ?? "",
      "Proiect": t.projectName ?? "",
      "Client": t.clientId ? (clientNameMap.get(t.clientId) ?? "") : "",
      "Categorie": t.categoryName ?? "",
      "Scadent": fmtDate(t.dueAt),
      "Progres (%)": t.progress,
      "Creat la": fmtDateTime(t.createdAt),
      "Creat de": t.creatorName,
      "Descriere": t.description ?? "",
    }));

    return makeResponse(HEADERS, rows, entity);
  }

  // ─── PROJECTS ─────────────────────────────────────────────────────
  if (entity === "projects") {
    const where: import("@prisma/client").Prisma.ProjectWhereInput = {};
    const statusParam = sp.get("status") as ProjectStatus | null;
    if (statusParam) where.status = statusParam;
    const q = sp.get("q")?.trim();
    if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }];

    const rows = await prisma.project.findMany({
      where,
      select: {
        name: true,
        description: true,
        status: true,
        address: true,
        assigneeId: true,
        _count: { select: { tasks: true } },
        owner: { select: { name: true } },
        client: { select: { name: true } },
        team: { select: { name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    // Resolve assignee names in one batch query
    const assigneeIds = [...new Set(rows.map((r) => r.assigneeId).filter(Boolean) as string[])];
    const assigneeUsers = assigneeIds.length
      ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
      : [];
    const assigneeName = new Map(assigneeUsers.map((u) => [u.id, u.name]));

    const PROJECT_STATUS_RO: Record<string, string> = { ACTIVE: "Activ", ON_HOLD: "În așteptare", DONE: "Finalizat", ARCHIVED: "Arhivat" };
    const HEADERS = ["Nume", "Descriere", "Status", "Proprietar", "Client", "Echipă", "Asignat", "Adresă", "Nr. task-uri", "Creat la"];
    const exportRows = rows.map((p) => ({
      "Nume": p.name,
      "Descriere": p.description ?? "",
      "Status": PROJECT_STATUS_RO[p.status] ?? p.status,
      "Proprietar": p.owner?.name ?? "",
      "Client": p.client?.name ?? "",
      "Echipă": p.team?.name ?? "",
      "Asignat": p.assigneeId ? (assigneeName.get(p.assigneeId) ?? "") : "",
      "Adresă": p.address ?? "",
      "Nr. task-uri": p._count.tasks,
      "Creat la": fmtDate(p.createdAt),
    }));

    return makeResponse(HEADERS, exportRows, "proiecte");
  }

  // ─── CLIENTS ──────────────────────────────────────────────────────
  if (entity === "clients") {
    const { items } = await listClients(user.id, {
      search: sp.get("q") || undefined,
      page: 1,
      pageSize: 10000,
    });

    const HEADERS = ["Nume", "Telefon", "Email", "Note", "Nr. neprezentări", "Ultima programare"];
    const rows = items.map((c) => ({
      "Nume": c.name,
      "Telefon": c.phone ?? "",
      "Email": c.email ?? "",
      "Note": c.notes ?? "",
      "Nr. neprezentări": c.noShowCount,
      "Ultima programare": fmtDate(c.lastAppointmentAt),
    }));

    return makeResponse(HEADERS, rows, "clienti");
  }

  // ─── PAYERS (plătitori Apă-Canal) ─────────────────────────────────
  if (entity === "payers") {
    if (!can(user, "clients.view")) return new Response("Fără permisiune.", { status: 403 });

    // Aceleași filtre ca pagina /platitori (vezi buildPayerWhere) — altfel un export lansat
    // cu un filtru activ pe ecran (sector, sold, stradă...) ar întoarce toți plătitorii, nu
    // doar cei filtrați, fără nicio indicație vizibilă că sunt mai mulți decât cei afișați.
    const sectorParam = sp.get("sector");
    const debtParam = sp.get("debt");
    const invoiceStatusParam = sp.get("invoiceStatus");
    const where = await buildPayerWhere({
      search: sp.get("q") || undefined,
      status: sp.get("status") === "activated" || sp.get("status") === "pending" ? (sp.get("status") as "activated" | "pending") : undefined,
      sector: sectorParam === "privat" || sectorParam === "comunal" ? sectorParam : undefined,
      invoiceStatus: invoiceStatusParam && INVOICE_STATUS_LIST.includes(invoiceStatusParam as InvoiceStatus)
        ? (invoiceStatusParam as InvoiceStatus)
        : undefined,
      debt: debtParam === "has" || debtParam === "none" ? debtParam : undefined,
      street: sp.get("street") || undefined,
      needsNameFix: sp.get("nameFix") === "1",
    });
    const payers = await prisma.client.findMany({
      where,
      orderBy: { name: "asc" },
      take: 20000,
      select: {
        id: true,
        name: true,
        meterSeries: true,
        phone: true,
        email: true,
        notes: true,
        meterNumber: true,
        meterCurrReading: true,
        consumAddress: true,
        portalPasswordHash: true,
        _count: { select: { invoices: true } },
      },
    });

    // Ultima factură a fiecărui plătitor (sume, sold, perioadă) + datele lui din exportul 1C
    // (nr. contract, IDNO, zonă, sigiliu) — altfel Excelul nu avea nici suma, nici datoria.
    // Fără `clientId: { in: [~19.000 de id-uri] }`: Mongo îl execută în ~150 s (timeout pe Vercel).
    // Citim toate facturile/înregistrările 1C (câteva zeci de mii de rânduri mici) și potrivim aici.
    const [invRows, oneC] = await Promise.all([
      prisma.invoice.findMany({
        where: { clientId: { not: null } },
        orderBy: { issueDate: "desc" },
        select: {
          clientId: true, number: true, issueDate: true, status: true, billingPeriodLabel: true, sectorNr: true,
          meterPrevReading: true, meterCurrReading: true, subtotal: true, datoriiAvans: true, recalculari: true,
          penalitati: true, grandTotal: true, currency: true,
        },
      }),
      prisma.oneCRecord.findMany({
        where: { clientId: { not: null } },
        select: { clientId: true, nrContract: true, inn: true, zonaPresiune: true, sigiliu: true, dataInstalare: true, uid: true },
      }),
    ]);
    const lastInvoice = new Map<string, (typeof invRows)[number]>();
    for (const inv of invRows) if (inv.clientId && !lastInvoice.has(inv.clientId)) lastInvoice.set(inv.clientId, inv);
    const oneCByClient = new Map(oneC.map((r) => [r.clientId, r]));

    // Primele 8 coloane sunt cele acceptate la import; restul sunt informative (ignorate la import).
    const HEADERS = [
      "Serie contor", "Nume", "Telefon", "Email", "Note", "Nr. contor", "Adresa consum", "Indice curent", "Cont portal", "Nr. facturi",
      "Nr. contract", "IDNO / ИНН", "Sector", "Nr. factură", "Data facturii", "Perioadă", "Status factură",
      "Citire anterioară", "Citire curentă (factură)", "Calculat", "Datorii / avans", "Recalculări", "Penalități", "Total de plată", "Valută",
      "Zonă presiune", "Nr. sigiliu", "Data instalării contor", "UID 1C",
    ];
    const rows = payers.map((p) => {
      const inv = lastInvoice.get(p.id);
      const c1 = oneCByClient.get(p.id);
      return {
        "Serie contor": p.meterSeries ?? "",
        "Nume": p.name,
        "Telefon": p.phone ?? "",
        "Email": p.email ?? "",
        "Note": p.notes ?? "",
        "Nr. contor": p.meterNumber ?? "",
        "Adresa consum": p.consumAddress ?? "",
        "Indice curent": p.meterCurrReading ?? "",
        "Cont portal": p.portalPasswordHash ? "Activat" : "Neactivat",
        "Nr. facturi": p._count.invoices,
        "Nr. contract": c1?.nrContract ?? "",
        "IDNO / ИНН": c1?.inn ?? "",
        "Sector": inv?.sectorNr ?? "",
        "Nr. factură": inv?.number ?? "",
        "Data facturii": inv ? fmtDate(inv.issueDate) : "",
        "Perioadă": inv?.billingPeriodLabel ?? "",
        "Status factură": inv ? (INVOICE_STATUS[inv.status as InvoiceStatus]?.label ?? inv.status) : "",
        "Citire anterioară": inv?.meterPrevReading ?? "",
        "Citire curentă (factură)": inv?.meterCurrReading ?? "",
        "Calculat": inv ? inv.subtotal : "",
        "Datorii / avans": inv ? inv.datoriiAvans : "",
        "Recalculări": inv ? inv.recalculari : "",
        "Penalități": inv ? inv.penalitati : "",
        "Total de plată": inv ? inv.grandTotal : "",
        "Valută": inv?.currency ?? "",
        "Zonă presiune": c1?.zonaPresiune ?? "",
        "Nr. sigiliu": c1?.sigiliu ?? "",
        "Data instalării contor": c1?.dataInstalare ?? "",
        "UID 1C": c1?.uid ?? "",
      };
    });

    return makeResponse(HEADERS, rows, "platitori");
  }

  // ─── APPOINTMENTS ─────────────────────────────────────────────────
  if (entity === "appointments") {
    const view = sp.get("view") ?? "lista";
    const q = sp.get("q")?.trim();
    const statusParam = sp.get("status") as AppointmentStatus | null;
    const categoryId = sp.get("category") || undefined;

    const { todayKey, tomorrowKey, weekKeys } = await import("@/lib/date");
    const tz = TZ;
    const tKey = todayKey(tz);

    let dateFilter: import("@prisma/client").Prisma.AppointmentWhereInput;
    if (view === "azi") {
      dateFilter = { dateKey: tKey };
    } else if (view === "maine") {
      dateFilter = { dateKey: tomorrowKey(tz) };
    } else if (view === "saptamana") {
      const keys = weekKeys(tKey, tz);
      dateFilter = { dateKey: { in: keys } };
    } else {
      // lista: export all (up to 2 years) so user gets all data
      const now = new Date();
      const from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const to = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
      dateFilter = { startAt: { gte: from, lte: to } };
    }

    const where: import("@prisma/client").Prisma.AppointmentWhereInput = {
      userId: user.id,
      ...dateFilter,
      ...(statusParam ? { status: statusParam } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(q ? { clientNameSnapshot: { contains: q, mode: "insensitive" } } : {}),
    };

    const appts = await prisma.appointment.findMany({
      where,
      select: {
        startAt: true,
        endAt: true,
        title: true,
        status: true,
        clientNameSnapshot: true,
        categoryNameSnapshot: true,
      },
      orderBy: { startAt: "asc" },
      take: 10000,
    });

    const APPT_STATUS_RO: Record<string, string> = {
      NEW: "Nou", CONFIRMED: "Confirmat", IN_PROGRESS: "În lucru",
      DONE: "Finalizat", CANCELLED: "Anulat", NO_SHOW: "Absent",
    };
    const HEADERS = ["Data", "Ora start", "Ora sfârșit", "Client", "Titlu", "Status", "Categorie"];
    const rows = appts.map((a) => ({
      "Data": fmtDate(a.startAt),
      "Ora start": formatTime(a.startAt, TZ),
      "Ora sfârșit": formatTime(a.endAt, TZ),
      "Client": a.clientNameSnapshot,
      "Titlu": a.title,
      "Status": APPT_STATUS_RO[a.status] ?? a.status,
      "Categorie": a.categoryNameSnapshot ?? "",
    }));

    return makeResponse(HEADERS, rows, "programari");
  }

  return new Response("Entitate necunoscută.", { status: 400 });
}
