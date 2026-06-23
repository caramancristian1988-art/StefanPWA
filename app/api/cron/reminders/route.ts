import { env } from "@/lib/env";
import { processDueReminders } from "@/lib/services/reminders";
import { checkOverdueTasks } from "@/lib/services/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job periodic. Apelează regulat (Vercel Cron sau orice scheduler):
 *   GET /api/cron/reminders   cu header  Authorization: Bearer <CRON_SECRET>
 * Procesează remindere de programări scadente + detectează task-uri întârziate.
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

  const [reminders, overdueTasks] = await Promise.all([
    processDueReminders(),
    checkOverdueTasks(),
  ]);
  return Response.json({ ok: true, reminders, overdueTasks });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
