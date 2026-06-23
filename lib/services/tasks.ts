import "server-only";
import { prisma } from "../prisma";
import { DEMO } from "../demo";
import {
  sendMessage,
  editMessageText,
  taskStatusButtons,
  TASK_STATUS_RO,
  TASK_TYPE_RO,
  TASK_PRIORITY_RO,
} from "../telegram";
import { notifyUsers, observerRecipients } from "./notifications";
import type { TaskStatus, TaskType, TaskPriority, CreatedFrom } from "@prisma/client";

export type CreateTaskInput = {
  title: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  dueAt?: Date | null;
  assigneeId?: string | null;
  teamId?: string | null;
  projectId?: string | null;
};

/** Chat Telegram al unui user: întâi cel setat manual, apoi contul linkat prin bot. */
async function telegramChatFor(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true, telegramAccount: { select: { chatId: true } } },
  });
  return u?.telegramChatId || u?.telegramAccount?.chatId || null;
}

/**
 * Creează un task. NU trimite notificări aici (ca o problemă de Telegram să NU
 * pice crearea). Pentru notificări apelează separat `notifyNewTask`.
 */
export async function createTask(
  creatorId: string,
  input: CreateTaskInput,
  source: CreatedFrom = "WEB",
) {
  if (DEMO) return { ok: false as const, error: "Mod demo: conectează o bază de date." };
  if (!input.title?.trim()) return { ok: false as const, error: "Titlul e obligatoriu." };

  let assigneeId = input.assigneeId || null;
  let teamId = input.teamId || null;

  if (!assigneeId && !teamId && input.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { assigneeId: true, teamId: true },
    });
    if (project) {
      assigneeId = project.assigneeId;
      teamId = project.teamId;
    }
  }
  if (!assigneeId && !teamId) assigneeId = creatorId;

  // Asignat cuiva => ASSIGNED; altfel NEW
  const status: TaskStatus = assigneeId || teamId ? "ASSIGNED" : "NEW";

  const task = await prisma.task.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      type: input.type ?? "TASK",
      priority: input.priority ?? "MEDIUM",
      dueAt: input.dueAt ?? null,
      creatorId,
      assigneeId,
      teamId,
      projectId: input.projectId || null,
      createdFrom: source,
      status,
    },
    select: { id: true, title: true },
  });

  return { ok: true as const, id: task.id, title: task.title };
}

/** Trimite notificarea de task nou către asignat / membrii echipei (best-effort). */
export async function notifyNewTask(taskId: string): Promise<void> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        type: true,
        priority: true,
        status: true,
        creatorId: true,
        assigneeId: true,
        teamId: true,
        assignee: { select: { name: true } },
        project: { select: { name: true } },
      },
    });
    if (!task) return;

    const recipients = new Set<string>();
    if (task.assigneeId) recipients.add(task.assigneeId);
    if (task.teamId) {
      const team = await prisma.team.findUnique({
        where: { id: task.teamId },
        select: { memberIds: true },
      });
      team?.memberIds.forEach((id) => recipients.add(id));
    }

    const lines = [
      `🆕 <b>${TASK_TYPE_RO[task.type]} nou</b>`,
      escapeHtml(task.title),
      "",
      `⚑ Prioritate: <b>${TASK_PRIORITY_RO[task.priority]}</b>`,
    ];
    if (task.assignee?.name) lines.push(`👤 Asignat: ${escapeHtml(task.assignee.name)}`);
    if (task.project?.name) lines.push(`📁 Proiect: ${escapeHtml(task.project.name)}`);
    lines.push(`Status: <b>${TASK_STATUS_RO[task.status]}</b>`);
    const text = lines.join("\n");

    let stored = false;
    for (const uid of recipients) {
      try {
        const chatId = await telegramChatFor(uid);
        if (!chatId) continue;
        const res = (await sendMessage(chatId, text, taskStatusButtons(task.id))) as {
          message_id?: number;
        } | null;
        if (res?.message_id && uid === task.assigneeId && !stored) {
          await prisma.task
            .update({
              where: { id: task.id },
              data: { telegramChatId: chatId, telegramMessageId: res.message_id },
            })
            .catch(() => {});
          stored = true;
        }
      } catch {
        // ignoră eșecul per-destinatar
      }
    }

    // In-app + push pentru asignat/echipă (Telegram cu butoane a fost deja trimis mai sus)
    await notifyUsers(
      [...recipients],
      {
        title: `${TASK_TYPE_RO[task.type]} nou: ${task.title}`,
        body: task.project?.name ? `Proiect: ${task.project.name}` : undefined,
        taskId: task.id,
        url: "/tasks",
      },
      { telegram: false },
    );

    // Observatori (cei care au bifat evenimentul): creare + asignare.
    const createdKey = task.type === "TICKET" ? "ticket.created" : "task.created";
    const observerIds = new Set<string>(await observerRecipients(createdKey));
    if (task.assigneeId) {
      for (const id of await observerRecipients("task.assigned")) observerIds.add(id);
    }
    observerIds.delete(task.creatorId); // creatorul știe deja
    for (const id of recipients) observerIds.delete(id); // deja notificați ca direcți
    if (observerIds.size > 0) {
      await notifyUsers(
        [...observerIds],
        {
          title: `${TASK_TYPE_RO[task.type]} nou: ${task.title}`,
          body: task.assignee?.name ? `Asignat: ${task.assignee.name}` : task.project?.name ? `Proiect: ${task.project.name}` : undefined,
          taskId: task.id,
          url: "/tasks",
        },
        { telegram: true },
      );
    }
  } catch {
    // notificarea nu trebuie să afecteze nimic
  }
}

/** Schimbă statusul + jurnal + notificare admin/creator (best-effort). */
export async function changeTaskStatus(
  taskId: string,
  actorId: string,
  newStatus: TaskStatus,
  opts: { fromTelegram?: boolean } = {},
) {
  if (DEMO) return { ok: false as const, error: "Mod demo." };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      creatorId: true,
      assigneeId: true,
      telegramChatId: true,
      telegramMessageId: true,
    },
  });
  if (!task) return { ok: false as const, error: "Task inexistent." };
  if (task.status === newStatus) {
    return { ok: true as const, changed: false, fromStatus: task.status, title: task.title, type: task.type };
  }

  await prisma.task.update({ where: { id: taskId }, data: { status: newStatus } });
  await prisma.taskActivity
    .create({ data: { taskId, userId: actorId, fromStatus: task.status, toStatus: newStatus } })
    .catch(() => {});

  // Notificări best-effort (nu afectează rezultatul)
  try {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
    // Direcți: creatorul + asignatul (lucrătorul care răspunde de task).
    // Observatori: cei care au bifat „Status task schimbat". Fără cel care a modificat.
    const recipients = new Set<string>([task.creatorId, ...(await observerRecipients("task.status"))]);
    if (task.assigneeId) recipients.add(task.assigneeId);
    recipients.delete(actorId);
    await notifyUsers(
      [...recipients],
      {
        title: `${actor?.name ?? "Cineva"} a schimbat „${task.title}"`,
        body: `Status: ${TASK_STATUS_RO[newStatus]}`,
        taskId: task.id,
        url: "/tasks",
      },
      { telegram: true },
    );

    if (opts.fromTelegram && task.telegramChatId && task.telegramMessageId) {
      const closed = newStatus === "DONE" || newStatus === "CANCELLED";
      await editMessageText(
        task.telegramChatId,
        task.telegramMessageId,
        `📋 ${escapeHtml(task.title)}\n\nStatus: <b>${TASK_STATUS_RO[newStatus]}</b>`,
        closed ? undefined : taskStatusButtons(task.id),
      );
    }
  } catch {
    // ignoră
  }

  return { ok: true as const, changed: true, fromStatus: task.status, title: task.title, type: task.type };
}

/** Schimbă progresul (0-100) + jurnal + notificare creator (best-effort). */
export async function changeTaskProgress(taskId: string, actorId: string, progress: number) {
  if (DEMO) return { ok: false as const, error: "Mod demo." };
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, type: true, progress: true, creatorId: true, assigneeId: true },
  });
  if (!task) return { ok: false as const, error: "Task inexistent." };
  if (task.progress === p) {
    return { ok: true as const, changed: false, fromProgress: task.progress, title: task.title, type: task.type };
  }

  await prisma.task.update({ where: { id: taskId }, data: { progress: p } });

  try {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
    const recipients = new Set<string>([task.creatorId, ...(await observerRecipients("task.progress"))]);
    if (task.assigneeId) recipients.add(task.assigneeId);
    recipients.delete(actorId);
    await notifyUsers(
      [...recipients],
      {
        title: `${actor?.name ?? "Cineva"} a actualizat progresul`,
        body: `„${task.title}" → ${p}%`,
        taskId: task.id,
        url: "/tasks",
      },
      { telegram: true },
    );
  } catch {
    // ignoră
  }
  return { ok: true as const, changed: true, fromProgress: task.progress, title: task.title, type: task.type };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
