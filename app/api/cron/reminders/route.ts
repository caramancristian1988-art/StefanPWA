import { env } from "@/lib/env";
import { processDueReminders } from "@/lib/services/reminders";
import { checkOverdueTasks, checkTaskReminders } from "@/lib/services/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job periodic (Vercel Cron: fiecare 10 minute).
 * Apelează și manual:  GET /api/cron/reminders?secret=<CRON_SECRET>
 *
 * Procesează:
 *  1. Remindere programări scadente (Appointment)
 *  2. Reamintiri periodice task-uri active cu reminderIntervalMinutes configurat
 *  3. Notificare one-shot pentru task-uri depășite fără interval de reamintire
 */
async function run(req: Request) {
  const auth = req.headers.get("authorization");
  const url = new URL(req.url);
  const tokenOk =
    auth === `Bearer ${env.cronSecret}` ||
    url.searchParams.get("secret") === env.cronSecret;

  if (!env.cronSecret || !tokenOk) {
    return new Response("forbidden", { status: 401 });
  }

  const [reminders, taskReminders, overdueTasks] = await Promise.all([
    processDueReminders(),
    checkTaskReminders(),
    checkOverdueTasks(),
  ]);
  return Response.json({ ok: true, reminders, taskReminders, overdueTasks });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
