import { getCurrentUser } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/services/audit";
import { getApiConfigPublic, saveApiConfig, setAutoSync } from "@/lib/services/apa-canal-api";

export const dynamic = "force-dynamic";

const canUse = (u: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) =>
  can(u, "clients.create") && can(u, "clients.edit") && can(u, "invoices.create");

/** Configurația API-ului (link, login) — fără parolă/token: acelea nu părăsesc niciodată serverul. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Autentificare necesară." }, { status: 401 });
  if (!canUse(user)) return Response.json({ error: "Nu ai permisiunea de a folosi sincronizarea." }, { status: 403 });
  const cfg = await getApiConfigPublic();
  if (user.role === "ADMIN") return Response.json({ ...cfg, canEdit: true });
  // Cine doar rulează sincronizarea nu are de ce să vadă linkul complet (poate conține o cheie în query) sau loginul.
  let shown = "";
  try {
    const u = new URL(cfg.url);
    shown = `${u.origin}${u.pathname}`;
  } catch {
    /* fără link */
  }
  return Response.json({ ...cfg, url: shown, username: cfg.username ? "••••••" : "", canEdit: false });
}

/** Pornește/oprește extragerea automată zilnică (cron). Doar administratorii. */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Autentificare necesară." }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: "Doar un administrator poate porni sincronizarea automată." }, { status: 403 });

  let body: { autoSync?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cerere invalidă." }, { status: 400 });
  }
  if (typeof body.autoSync !== "boolean") return Response.json({ error: "Lipsește autoSync (true/false)." }, { status: 400 });
  const res = await setAutoSync(body.autoSync);
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });

  await logAudit(
    { id: user.id, name: user.name, role: user.role, isSuperAdmin: user.isSuperAdmin },
    { action: "integration.update", module: "Integrations", objectName: "API plătitori Apă-Canal", newValue: body.autoSync ? "Sincronizare automată PORNITĂ" : "Sincronizare automată oprită" },
  );
  return Response.json({ ...(await getApiConfigPublic()), canEdit: true });
}

/** Salvează linkul și credențialele. Doar administratorii — parola dă acces la datele plătitorilor. */
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Autentificare necesară." }, { status: 401 });
  if (user.role !== "ADMIN") return Response.json({ error: "Doar un administrator poate schimba credențialele." }, { status: 403 });

  let body: { url?: unknown; username?: unknown; password?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cerere invalidă." }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const res = await saveApiConfig(
    {
      url: str(body.url) ?? "",
      username: str(body.username) ?? "",
      // undefined (câmp lipsă) = păstrează parola existentă; "" = șterge-o
      password: str(body.password),
      token: str(body.token),
    },
    user.id,
  );
  if (!res.ok) return Response.json({ error: res.error }, { status: 400 });

  await logAudit(
    { id: user.id, name: user.name, role: user.role, isSuperAdmin: user.isSuperAdmin },
    { action: "integration.update", module: "Integrations", objectName: "API plătitori Apă-Canal", newValue: "Link/credențiale actualizate (parola nu se loghează)." },
  );
  return Response.json({ ...(await getApiConfigPublic()), canEdit: true });
}
