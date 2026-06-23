import { env } from "@/lib/env";
import { processDueReminders } from "@/lib/services/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job de remindere. Apelează periodic (Vercel Cron sau orice scheduler):
 *   GET /api/cron/reminders   cu header  Authorization: Bearer <CRON_SECRET>
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

  const result = await processDueReminders();
  return Response.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
