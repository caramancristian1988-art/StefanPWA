import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/dal";
import { can } from "@/lib/permissions";

// Exportul 1C poate ajunge ca .txt (Windows-1251) sau .json — browserul detectează tipul după
// extensie, nu întotdeauna corect, deci acceptăm toate variantele plauzibile.
const ALLOWED_TYPES = ["text/plain", "application/json", "application/octet-stream"];

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const user = await getCurrentUser();
        if (!user) throw new Error("Autentificare necesară");
        if (!can(user, "invoices.create") || !can(user, "clients.create")) {
          throw new Error("Nu ai permisiunea de a importa date Apă-Canal.");
        }
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: 150 * 1024 * 1024, // 150 MB — exportul lunar are ~50 MB
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(jsonResponse);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
