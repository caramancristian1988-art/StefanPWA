import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

let cached: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.smtp.enabled) return null;
  if (!cached) {
    cached = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    });
  }
  return cached;
}

export type ReminderEmailData = {
  to: string;
  clientName: string;
  service: string;
  date: string;
  time: string;
  fromName?: string | null;
  fromAddr?: string | null;
};

function template(d: ReminderEmailData): string {
  return `<!doctype html>
<html lang="ro"><body style="margin:0;background:#f5f6f8;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:#0d9488;padding:20px 24px;color:#fff;font-size:18px;font-weight:700">
          Reminder programare
        </td></tr>
        <tr><td style="padding:24px">
          <p style="margin:0 0 14px;font-size:16px">Bună, <b>${d.clientName}</b>.</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.5">
            Ai programare la <b>${d.service}</b> pe <b>${d.date}</b> la <b>${d.time}</b>.
          </p>
          <div style="background:#ccfbf1;border-radius:12px;padding:14px 16px;margin-bottom:18px">
            <div style="font-size:13px;color:#0f766e">📅 ${d.date} &nbsp; 🕐 ${d.time}</div>
          </div>
          <p style="margin:0;font-size:14px;color:#475569">
            Te rugăm să confirmi dacă poți ajunge.
          </p>
        </td></tr>
        <tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
          Mesaj automat — te rugăm să nu răspunzi.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Trimite reminder-ul. Aruncă eroare la eșec (pentru logica de retry). */
export async function sendReminderEmail(d: ReminderEmailData): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) throw new Error("SMTP neconfigurat.");

  const from =
    d.fromName && d.fromAddr
      ? `${d.fromName} <${d.fromAddr}>`
      : env.smtp.from;

  await transporter.sendMail({
    from,
    to: d.to,
    subject: "Reminder programare",
    text: `Bună, ${d.clientName}. Ai programare la ${d.service} pe ${d.date} la ${d.time}. Te rugăm să confirmi dacă poți ajunge.`,
    html: template(d),
  });
}
