// DIAGNOSTIC TEMPORAR — de șters imediat după găsirea cauzei crash-ului live. Nu necesită
// autentificare intenționat (avem nevoie să-l lovim din exterior, fără sesiune, exact ca /login).
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export async function GET() {
  const info: Record<string, unknown> = {
    nodeVersion: process.version,
    nextRuntime: process.env.NEXT_RUNTIME ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelRegion: process.env.VERCEL_REGION ?? null,
    isConfigured: env.isConfigured,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasSessionSecret: Boolean(process.env.SESSION_SECRET),
  };

  try {
    const count = await prisma.user.count();
    info.dbOk = true;
    info.userCount = count;
  } catch (e) {
    info.dbOk = false;
    info.dbError = {
      name: e instanceof Error ? e.name : typeof e,
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : null,
    };
  }

  return Response.json(info);
}
