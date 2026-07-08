import "server-only";
import { prisma } from "../prisma";
import { DEMO } from "../demo";
import { env } from "../env";
import { filteredAdminRecipients, notifyUsers } from "./notifications";
import nodemailer from "nodemailer";

// ── Email transport (shared with lib/email.ts logic) ────────────────────────
function getTransport() {
  if (!env.smtp.enabled) return null;
  return nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
}

// ── RFC 2047 word decoding (subiect/fromName din email headers) ──────────────
function decodeRfc2047(str: string): string {
  if (!str || !str.includes("=?")) return str;
  return str.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, _charset, enc, data) => {
    try {
      if (enc.toUpperCase() === "B") {
        return Buffer.from(data, "base64").toString("utf-8");
      }
      // Quoted-printable word (Q encoding)
      const qp = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, "%$1");
      try { return decodeURIComponent(qp); } catch { return data; }
    } catch { return str; }
  });
}

// ── Normalize subject pentru threading ──────────────────────────────────────
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(Re|Fwd?|Fw|Răspuns|Răsp):\s*/gi, "")
    .trim()
    .toLowerCase();
}

export type InboundEmail = {
  fromEmail: string;
  fromName?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;   // space-separated Message-IDs
};

// ── Find existing open ticket for this email thread ────────────────────────
async function findExistingTicket(email: InboundEmail): Promise<string | null> {
  // 1. Match by In-Reply-To header (most reliable)
  if (email.inReplyTo) {
    const t = await prisma.task.findFirst({
      where: {
        emailSource: true,
        status: { notIn: ["DONE", "CANCELLED"] },
        OR: [
          { emailMessageId: email.inReplyTo },
          { emailThreadId: email.inReplyTo },
        ],
      },
      select: { id: true },
    });
    if (t) return t.id;
  }

  // 2. Match by References header
  if (email.references) {
    const ids = email.references.split(/\s+/).filter(Boolean);
    for (const ref of ids) {
      const t = await prisma.task.findFirst({
        where: {
          emailSource: true,
          status: { notIn: ["DONE", "CANCELLED"] },
          OR: [{ emailMessageId: ref }, { emailThreadId: ref }],
        },
        select: { id: true },
      });
      if (t) return t.id;
    }
  }

  // 3. Match by fromEmail + normalized subject (last resort)
  const normSubject = normalizeSubject(email.subject);
  if (normSubject) {
    const candidates = await prisma.task.findMany({
      where: {
        emailSource: true,
        fromEmail: email.fromEmail.toLowerCase(),
        status: { notIn: ["DONE", "CANCELLED"] },
      },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    for (const c of candidates) {
      if (normalizeSubject(c.title) === normSubject) return c.id;
    }
  }

  return null;
}

// ── Process inbound email ────────────────────────────────────────────────────
export async function processInboundEmail(email: InboundEmail): Promise<{
  action: "created" | "updated";
  ticketId: string;
  seq: number | null;
}> {
  if (DEMO) throw new Error("Mod demo.");

  const fromEmail = email.fromEmail.toLowerCase().trim();
  // Decodează RFC 2047 în caz că vine ne-decodat din webhook (IMAP îl decodează deja)
  const subject = decodeRfc2047(email.subject.trim()) || "(fără subiect)";
  const fromName = email.fromName ? decodeRfc2047(email.fromName) : email.fromName;
  const body = email.bodyText.trim() || email.bodyHtml?.replace(/<[^>]+>/g, " ").trim() || "";

  // Idempotency: skip if this exact messageId was already stored
  if (email.messageId) {
    const exists = await prisma.emailMessage.findFirst({
      where: { messageId: email.messageId },
      select: { id: true },
    });
    if (exists) {
      console.log(`[email] mesaj duplicat, ignorat: ${email.messageId}`);
      const task = await prisma.emailMessage.findFirst({
        where: { messageId: email.messageId },
        select: { taskId: true, task: { select: { seq: true } } },
      });
      return { action: "updated", ticketId: task!.taskId, seq: task?.task?.seq ?? null };
    }
  }

  // Find system user for email-sourced tickets (first admin)
  const systemUser = await prisma.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!systemUser) throw new Error("Niciun admin disponibil ca autor sistem.");

  const existingId = await findExistingTicket(email);

  // Fetch company name for auto-ack (best-effort)
  const company = await prisma.companySettings.findFirst({
    where: { singleton: "main" },
    select: { companyName: true },
  }).catch(() => null);
  const companyName = company?.companyName || "Echipa noastră";

  if (existingId) {
    // ── Continue existing ticket ──────────────────────────────────────────
    const ticket = await prisma.task.update({
      where: { id: existingId },
      data: {
        lastClientEmailAt: new Date(),
        autoCloseWarnedAt: null,
        status: "NEW",
      },
      select: { id: true, seq: true, title: true, status: true, assigneeId: true },
    });

    await prisma.emailMessage.create({
      data: {
        taskId: existingId,
        direction: "INBOUND",
        fromEmail,
        fromName: fromName,
        toEmail: env.smtp.from || "info@scada.md",
        subject,
        body,
        messageId: email.messageId,
      },
    });

    await prisma.taskComment.create({
      data: {
        taskId: existingId,
        userId: systemUser.id,
        body: `📧 **${fromName || fromEmail}:** ${body.slice(0, 2000)}`,
        source: "WEB",
      },
    });

    await notifyStaff(existingId, ticket.seq, ticket.title, "reply", fromEmail, fromName, ticket.assigneeId);
    return { action: "updated", ticketId: existingId, seq: ticket.seq ?? null };
  }

  // ── Create new ticket ─────────────────────────────────────────────────
  const counter = await prisma.counter.upsert({
    where: { name: "task-seq" },
    create: { name: "task-seq", value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });

  const ticket = await prisma.task.create({
    data: {
      seq: counter.value,
      type: "TICKET",
      title: subject,
      description: body,
      status: "NEW",
      priority: "MEDIUM",
      creatorId: systemUser.id,
      createdFrom: "WEB",
      emailSource: true,
      fromEmail,
      fromName: fromName,
      emailMessageId: email.messageId,
      emailThreadId: email.messageId,
      lastClientEmailAt: new Date(),
    },
    select: { id: true, seq: true },
  });

  await prisma.emailMessage.create({
    data: {
      taskId: ticket.id,
      direction: "INBOUND",
      fromEmail,
      fromName: fromName,
      toEmail: env.smtp.from || "info@scada.md",
      subject,
      body,
      messageId: email.messageId,
    },
  });

  // Trimite confirmare automată clientului
  await sendAutoAck({
    toEmail: fromEmail,
    toName: fromName,
    subject,
    companyName,
    ticketSeq: ticket.seq,
    emailThreadId: email.messageId,
  });

  await notifyStaff(ticket.id, ticket.seq, subject, "new", fromEmail, fromName, null);
  return { action: "created", ticketId: ticket.id, seq: ticket.seq ?? null };
}

// ── Notifică admini (tichet nou) sau persoana asignată (reply client) ────────
async function notifyStaff(
  taskId: string,
  seq: number | null | undefined,
  title: string,
  type: "new" | "reply",
  fromEmail: string,
  fromName?: string | null,
  assigneeId?: string | null,
) {
  const sender = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const heading = type === "new" ? "📨 Tichet nou din email" : "↩️ Răspuns email pe tichet";
  const url = `/tickets/${taskId}`;

  if (type === "reply" && assigneeId) {
    // Reply client → notifică doar persoana asignată
    await notifyUsers(
      [assigneeId],
      { title: `${heading}: ${title.slice(0, 60)}`, body: `De la: ${sender}`, taskId, seq: seq ?? null, url },
      { telegram: true },
    );
  } else {
    // Tichet nou sau fără assignee → toți adminii
    const admins = await filteredAdminRecipients({ eventKeys: ["ticket.email"] });
    if (!admins.length) return;
    await notifyUsers(
      admins,
      { title: `${heading}: ${title.slice(0, 60)}`, body: `De la: ${sender}`, taskId, seq: seq ?? null, url },
      { telegram: true },
    );
  }
}

// ── Auto-confirmare recepție tichet → client ──────────────────────────────────
async function sendAutoAck(opts: {
  toEmail: string;
  toName: string | null | undefined;
  subject: string;
  companyName: string;
  ticketSeq: number | null;
  emailThreadId: string | null | undefined;
}): Promise<void> {
  const transport = getTransport();
  if (!transport) return;

  const seqLabel = opts.ticketSeq != null ? ` (#${opts.ticketSeq})` : "";
  const clientName = opts.toName || opts.toEmail;
  const msgId = `<ack-${Date.now()}@scada.md>`;

  const bodyText = `Bună, ${clientName},\n\nAm primit mesajul tău${seqLabel}. Un coleg te va contacta în cel mai scurt timp.\n\n— ${opts.companyName}`;
  const bodyHtml = `<!doctype html><html lang="ro"><body style="margin:0;background:#f5f6f8;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:#0d9488;padding:20px 28px;color:#fff;font-size:18px;font-weight:700">${escHtml(opts.companyName)}</td></tr>
        <tr><td style="padding:28px">
          <p style="margin:0 0 14px;font-size:15px">Bună, <b>${escHtml(clientName)}</b>.</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6">Am primit mesajul tău${seqLabel ? ` <b>${escHtml(seqLabel.trim())}</b>` : ""}. Un coleg te va contacta în cel mai scurt timp.</p>
          <p style="margin:0;font-size:13px;color:#64748b">— ${escHtml(opts.companyName)}</p>
        </td></tr>
        <tr><td style="padding:14px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">Mesaj automat de confirmare.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  await transport.sendMail({
    from: env.smtp.from,
    to: opts.toEmail,
    subject: `Re: ${opts.subject}`,
    text: bodyText,
    html: bodyHtml,
    messageId: msgId,
    inReplyTo: opts.emailThreadId ? `<${opts.emailThreadId}>` : undefined,
    references: opts.emailThreadId ? `<${opts.emailThreadId}>` : undefined,
  }).catch((err: Error) => console.error("[email] auto-ack eșuat:", err.message));
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Reply from staff → email to client ──────────────────────────────────────
export async function sendEmailReply(opts: {
  taskId: string;
  staffUserId?: string;
  staffName: string;
  replyBody: string;
  companyName?: string | null;
  fromName?: string | null;
  fromAddr?: string | null;
}): Promise<void> {
  if (DEMO) throw new Error("Mod demo.");

  const ticket = await prisma.task.findUnique({
    where: { id: opts.taskId },
    select: {
      fromEmail: true,
      fromName: true,
      title: true,
      seq: true,
      emailThreadId: true,
      assigneeId: true,
    },
  });
  if (!ticket?.fromEmail) throw new Error("Tichetul nu are email client asociat.");

  const transport = getTransport();
  if (!transport) throw new Error("SMTP neconfigurat.");

  // Auto-asignare: dacă nu e asignat, asignează staff-ul care răspunde
  if (!ticket.assigneeId && opts.staffUserId) {
    await prisma.task.update({
      where: { id: opts.taskId },
      data: { assigneeId: opts.staffUserId, status: "ASSIGNED" },
    });
    await prisma.taskActivity.create({
      data: {
        taskId: opts.taskId,
        userId: opts.staffUserId,
        action: "STATUS_CHANGED",
        fromStatus: "NEW",
        toStatus: "ASSIGNED",
      },
    }).catch(() => {});
  }

  const company = opts.companyName || "Echipa noastră";
  const from = opts.fromName && opts.fromAddr
    ? `${opts.fromName} <${opts.fromAddr}>`
    : env.smtp.from;

  const subject = `Re: ${ticket.title}`;
  const msgId = `<reply-${opts.taskId}-${Date.now()}@scada.md>`;

  const html = replyTemplate({
    clientName: ticket.fromName || ticket.fromEmail,
    body: opts.replyBody,
    companyName: company,
    staffName: opts.staffName,
  });

  await transport.sendMail({
    from,
    to: ticket.fromEmail,
    subject,
    html,
    text: opts.replyBody,
    messageId: msgId,
    inReplyTo: ticket.emailThreadId ? `<${ticket.emailThreadId}>` : undefined,
    references: ticket.emailThreadId ? `<${ticket.emailThreadId}>` : undefined,
  });

  await prisma.emailMessage.create({
    data: {
      taskId: opts.taskId,
      direction: "OUTBOUND",
      fromEmail: opts.fromAddr || (env.smtp.from?.match(/<(.+)>/)?.[1] ?? env.smtp.from ?? ""),
      fromName: opts.fromName,
      toEmail: ticket.fromEmail,
      subject,
      body: opts.replyBody,
      messageId: msgId,
    },
  });
}

function replyTemplate(d: {
  clientName: string;
  body: string;
  companyName: string;
  staffName: string;
}): string {
  const bodyHtml = escHtml(d.body).replace(/\n/g, "<br>");
  return `<!doctype html>
<html lang="ro"><body style="margin:0;background:#f5f6f8;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:#0f172a;padding:20px 28px;color:#fff;font-size:18px;font-weight:700">
          ${escHtml(d.companyName)}
        </td></tr>
        <tr><td style="padding:28px">
          <p style="margin:0 0 16px;font-size:15px">Bună, <b>${escHtml(d.clientName)}</b>.</p>
          <div style="font-size:15px;line-height:1.7;white-space:pre-wrap">${bodyHtml}</div>
          <p style="margin:24px 0 0;font-size:13px;color:#64748b">— ${escHtml(d.staffName)}, ${escHtml(d.companyName)}</p>
        </td></tr>
        <tr><td style="padding:14px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
          Mesaj trimis prin sistemul de suport.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Cron: unanswered tickets (every 3h, respect quiet hours) ─────────────────
export async function checkUnansweredEmailTickets(): Promise<number> {
  if (DEMO) return 0;
  const threshold = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3h ago

  // Tichete din email unde clientul a scris dar nu s-a răspuns (niciun OUTBOUND)
  const tickets = await prisma.task.findMany({
    where: {
      emailSource: true,
      status: { notIn: ["DONE", "CANCELLED"] },
      lastClientEmailAt: { not: null, lte: threshold },
    },
    select: { id: true, seq: true, title: true, lastClientEmailAt: true },
  });

  let count = 0;
  for (const t of tickets) {
    // Check if there's any outbound reply after last client email
    const hasReply = await prisma.emailMessage.findFirst({
      where: {
        taskId: t.id,
        direction: "OUTBOUND",
        sentAt: { gt: t.lastClientEmailAt! },
      },
      select: { id: true },
    });
    if (hasReply) continue; // already replied

    // Check we haven't already sent a notification in the last 3h (dedup via Notification)
    const dedupUrl = `/tickets?open=${t.id}&alert=unanswered`;
    const recent = await prisma.notification.findFirst({
      where: { url: dedupUrl, createdAt: { gt: threshold } },
      select: { id: true },
    });
    if (recent) continue;

    const admins = await filteredAdminRecipients({ eventKeys: ["ticket.email"] });
    if (!admins.length) continue;

    const seqLabel = t.seq != null ? ` #${t.seq}` : "";
    await notifyUsers(
      admins,
      {
        title: `🔕 Tichet nerăspuns${seqLabel}: ${t.title.slice(0, 60)}`,
        body: "Clientul aşteaptă răspuns.",
        taskId: t.id,
        seq: t.seq ?? null,
        url: dedupUrl,
      },
      { telegram: true },
    );
    count++;
  }
  return count;
}

// ── Cron: auto-close after 2 days no client reply ────────────────────────────
export async function checkAutoCloseEmailTickets(): Promise<number> {
  if (DEMO) return 0;
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Phase 1: Send warning (2 days no client activity)
  const toWarn = await prisma.task.findMany({
    where: {
      emailSource: true,
      status: { notIn: ["DONE", "CANCELLED"] },
      lastClientEmailAt: { not: null, lte: twoDaysAgo },
      autoCloseWarnedAt: null,
    },
    select: { id: true, seq: true, title: true, fromEmail: true, fromName: true, emailThreadId: true },
  });

  const transport = getTransport();
  const company = await prisma.companySettings.findFirst({
    where: { singleton: "main" },
    select: { companyName: true },
  }).catch(() => null);
  const fromAddr = env.smtp.from?.match(/<(.+)>/)?.[1] ?? env.smtp.from ?? "";
  const fromName = company?.companyName || "Suport";

  let count = 0;
  for (const t of toWarn) {
    if (!t.fromEmail) continue;

    // Send warning email to client
    if (transport) {
      const msgId = `<autoclose-warn-${t.id}-${Date.now()}@scada.md>`;
      const subject = `Re: ${t.title}`;
      const body = `Bună,\n\nTichetul dumneavoastră de suport va fi închis automat în 24 de ore dacă nu primiți niciun mesaj.\n\nDacă problema nu a fost rezolvată, vă rugăm să ne scrieți și vom continua conversația.\n\n— ${fromName}`;
      await transport.sendMail({
        from: `${fromName} <${fromAddr}>`,
        to: t.fromEmail,
        subject,
        text: body,
        messageId: msgId,
        inReplyTo: t.emailThreadId || undefined,
        references: t.emailThreadId || undefined,
      }).catch(() => {});

      await prisma.emailMessage.create({
        data: {
          taskId: t.id, direction: "OUTBOUND",
          fromEmail: fromAddr, fromName,
          toEmail: t.fromEmail, subject, body, messageId: msgId,
        },
      }).catch(() => {});
    }

    await prisma.task.update({
      where: { id: t.id },
      data: { autoCloseWarnedAt: new Date() },
    });
    count++;
  }

  // Phase 2: Auto-close (warned > 24h ago, still no client reply)
  const toClose = await prisma.task.findMany({
    where: {
      emailSource: true,
      status: { notIn: ["DONE", "CANCELLED"] },
      autoCloseWarnedAt: { not: null, lte: oneDayAgo },
    },
    select: { id: true, seq: true, title: true, fromEmail: true, fromName: true, lastClientEmailAt: true, autoCloseWarnedAt: true },
  });

  for (const t of toClose) {
    // Check if client replied after warning
    if (t.lastClientEmailAt && t.autoCloseWarnedAt && t.lastClientEmailAt > t.autoCloseWarnedAt) continue;

    await prisma.task.update({
      where: { id: t.id },
      data: { status: "DONE", autoCloseWarnedAt: null },
    });

    // Notify client
    if (transport && t.fromEmail) {
      const subject = `Re: ${t.title} — închis`;
      const body = `Bună,\n\nTichetul dumneavoastră a fost închis automat din cauza lipsei de activitate. Dacă mai aveți nevoie de ajutor, scrieți-ne oricând.\n\n— ${fromName}`;
      await transport.sendMail({
        from: `${fromName} <${fromAddr}>`,
        to: t.fromEmail, subject, text: body,
      }).catch(() => {});
    }
    count++;
  }

  return count;
}
