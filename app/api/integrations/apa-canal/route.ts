import { getCurrentUser } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/services/audit";
import { getApiConfigPublic, saveApiConfig } from "@/lib/services/apa-canal-api";

export const dynamic = "force-dynamic";

const canUse = (u: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) =>
  can(u, "clients.create") && can(u, "clients.edit") && can(u, "invoices.create");

/** Configurația API-ului (link, login) — fără parolă/token: acelea nu părăsesc niciodată serverul. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Autentificare necesară." }, { status: 401 });
  if (!canUse(user)) return Response.json({ error: "Nu ai permisiunea de a folosi sincronizarea." }, { status: 403 });
  return Response.json({ ...(await getApiConfigPublic()), canEdit: user.role === "ADMIN" });
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
