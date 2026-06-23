import "server-only";
import { prisma } from "../prisma";
import { DEMO } from "../demo";
import { sendPushToUser } from "../push";
import { sendMessage } from "../telegram";

export type NotifyPayload = {
  title: string;
  body?: string;
  url?: string;
  taskId?: string;
};

/**
 * Utilizatorii care vor să fie notificați (ca „observatori") pentru un anumit tip de
 * eveniment — adică au cheia evenimentului în notifyEvents. Granular, per utilizator.
 */
export async function observerRecipients(eventKey: string): Promise<string[]> {
  if (DEMO) return [];
  const users = await prisma.user.findMany({
    where: { isActive: true, notifyEvents: { has: eventKey } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Trimite o notificare către mai mulți utilizatori pe toate canalele (best-effort):
 *  - in-app (tabel Notification, cu badge)
 *  - push web (telefon/desktop) dacă userul are abonament
 *  - Telegram dacă userul are chat legat
 */
export async function notifyUsers(
  userIds: string[],
  payload: NotifyPayload,
  opts: { telegram?: boolean } = {},
): Promise<void> {
  if (DEMO) return;
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;

  // 1) In-app
  await prisma.notification
    .createMany({
      data: ids.map((userId) => ({
        userId,
        title: payload.title,
        body: payload.body ?? null,
        url: payload.url ?? null,
        taskId: payload.taskId ?? null,
      })),
    })
    .catch(() => {});

  // 2) Push + Telegram (best-effort, în paralel)
  await Promise.all(
    ids.map(async (uid) => {
      try {
        await sendPushToUser(uid, {
          title: payload.title,
          body: payload.body ?? "",
          url: payload.url ?? "/notificari",
        });
      } catch {
        /* ignore */
      }
      if (opts.telegram) {
        try {
          const u = await prisma.user.findUnique({
            where: { id: uid },
            select: { telegramChatId: true, telegramAccount: { select: { chatId: true } } },
          });
          const chat = u?.telegramChatId || u?.telegramAccount?.chatId;
          if (chat) {
            await sendMessage(
              chat,
              `🔔 <b>${escapeHtml(payload.title)}</b>${payload.body ? `\n${escapeHtml(payload.body)}` : ""}`,
            );
          }
        } catch {
          /* ignore */
        }
      }
    }),
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
