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
import { formatTime, DEFAULT_TZ } from "../date";
import { notifyUsers, observerRecipients, filteredAdminRecipients } from "./notifications";
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
    select: { telegramChatId: true, telegramAccounts: { select: { chatId: true }, take: 1 } },
  });
  return u?.telegramChatId || u?.telegramAccounts[0]?.chatId || null;
}

/** Mesaj Telegram dedicat schimbării de status/progres/comentariu (format fix, lizibil). */
function taskUpdateTelegramText(
  actorName: string,
  taskTitle: string,
  statusLabel: string,
  lineLabel: string = "Status",
): string {
  const time = formatTime(new Date(), DEFAULT_TZ);
  return [
    "🔔 <b>Actualizare task</b>",
    "",
    `Lucrător: ${escapeHtml(actorName)}`,
    `Task: ${escapeHtml(taskTitle)}`,
    `${lineLabel}: <b>${escapeHtml(statusLabel)}</b>`,
    `Ora: ${time}`,
  ].join("\n");
}

/** Mesaj Telegram pentru task întârziat (fără actor — notificare automată). */
function taskOverdueTelegramText(taskTitle: string): string {
  const time = formatTime(new Date(), DEFAULT_TZ);
  return [
    "⏰ <b>Task în întârziere</b>",
    "",
    `Task: ${escapeHtml(taskTitle)}`,
    `Ora: ${time}`,
  ].join("\n");
}

/** Trimite mesajul de actualizare pe Telegram către fiecare destinatar cu chat legat (best-effort, logat). */
async function notifyTaskUpdateTelegram(
  userIds: string[],
  info: { actorName: string; taskTitle: string; statusLabel: string; lineLabel?: string },
): Promise<void> {
  const text = taskUpdateTelegramText(info.actorName, info.taskTitle, info.statusLabel, info.lineLabel);
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const chatId = await telegramChatFor(uid);
        if (!chatId) {
          console.log(`[tasks] telegram: user ${uid} nu are chat Telegram legat — sărit`);
          return;
        }
        const res = await sendMessage(chatId, text);
        if (!res) {
          console.error(`[tasks] telegram: sendMessage a eșuat pentru user ${uid}`);
        }
      } catch (e) {
        console.error(`[tasks] telegram: notificare eșuată pentru user ${uid}`, e);
      }
    }),
  );
}

/** Trimite mesajul de „task întârziat" pe Telegram (fără actor — notificare automată). */
async function notifyTaskOverdueTelegram(userIds: string[], taskTitle: string): Promise<void> {
  const text = taskOverdueTelegramText(taskTitle);
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const chatId = await telegramChatFor(uid);
        if (!chatId) return;
        const res = await sendMessage(chatId, text);
        if (!res) console.error(`[tasks] telegram: sendMessage (overdue) a eșuat pentru user ${uid}`);
      } catch (e) {
        console.error(`[tasks] telegram: notificare overdue eșuată pentru user ${uid}`, e);
      }
    }),
  );
}

/** Textul notificării in-app, exact pe tipul de tranziție (cerut de spec). */
function statusChangeTitle(actorName: string, taskTitle: string, status: TaskStatus): string {
  const t = `„${taskTitle}"`;
  switch (status) {
    case "READ":
      return `Lucrătorul ${actorName} a citit task-ul ${t}`;
    case "IN_PROGRESS":
      return `Lucrătorul ${actorName} a început lucrul la task-ul ${t}`;
    case "ON_HOLD":
      return `Lucrătorul ${actorName} a pus în așteptare task-ul ${t}`;
    case "REVIEW":
      return `Lucrătorul ${actorName} a trimis la verificare task-ul ${t}`;
    case "DONE":
      return `Lucrătorul ${actorName} a finalizat task-ul ${t}`;
    case "CANCELLED":
      return `Lucrătorul ${actorName} a anulat task-ul ${t}`;
    default:
      return `Lucrătorul ${actorName} a actualizat task-ul ${t} → ${TASK_STATUS_RO[status]}`;
  }
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
        assignee: { select: { name: true, teamIds: true } },
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

    // Observatori (staff cu evenimentul bifat) + administratori filtrați (echipă/membru/eveniment).
    const createdKey = task.type === "TICKET" ? "ticket.created" : "task.created";
    const eventKeys = task.assigneeId ? [createdKey, "task.assigned"] : [createdKey];
    const admins = await filteredAdminRecipients({
      eventKeys,
      teamIds: [task.teamId, ...(task.assignee?.teamIds ?? [])],
      memberIds: [task.assigneeId, task.creatorId],
    });
    const observerIds = new Set<string>([...admins, ...(await observerRecipients(createdKey))]);
    if (task.assigneeId) {
      for (const id of await observerRecipients("task.assigned")) observerIds.add(id);
    }
    observerIds.delete(task.creatorId); // creatorul știe deja
    for (const id of recipients) observerIds.delete(id); // deja notificați ca direcți
    console.log(`[tasks] notifyNewTask: ${observerIds.size} observatori/admini de notificat pentru task ${task.id}`);
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
  } catch (e) {
    console.error(`[tasks] notifyNewTask: eșuat pentru task ${taskId}`, e);
  }
}

/** Schimbă statusul + jurnal + notificare admin/creator (best-effort, logat). */
export async function changeTaskStatus(
  taskId: string,
  actorId: string,
  newStatus: TaskStatus,
  opts: { fromTelegram?: boolean } = {},
) {
  console.log(`[tasks] changeTaskStatus: task=${taskId} actor=${actorId} -> ${newStatus}`);
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
      teamId: true,
      telegramChatId: true,
      telegramMessageId: true,
      assignee: { select: { teamIds: true } },
    },
  });
  if (!task) {
    console.error(`[tasks] changeTaskStatus: task ${taskId} nu există`);
    return { ok: false as const, error: "Task inexistent." };
  }
  if (task.status === newStatus) {
    console.log(`[tasks] changeTaskStatus: deja ${newStatus}, nimic de făcut`);
    return { ok: true as const, changed: false, fromStatus: task.status, title: task.title, type: task.type };
  }

  await prisma.task.update({ where: { id: taskId }, data: { status: newStatus } });
  await prisma.taskActivity
    .create({ data: { taskId, userId: actorId, fromStatus: task.status, toStatus: newStatus } })
    .catch((e) => console.error(`[tasks] changeTaskStatus: jurnalizare TaskActivity eșuată pentru ${taskId}`, e));
  console.log(`[tasks] changeTaskStatus: salvat în DB — ${task.status} → ${newStatus}`);

  // Notificări best-effort (nu afectează rezultatul scrierii de mai sus)
  try {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true, teamIds: true } });
    const actorName = actor?.name ?? "Cineva";

    // Direcți: creatorul + asignatul. Administratorii: filtrați după echipă/membru/tip eveniment
    // (notifyScope din Settings utilizator). Observatori: cei cu „Status task schimbat" bifat.
    const eventKeys =
      newStatus === "READ" ? ["task.status", "task.read"]
      : newStatus === "DONE" ? ["task.status", "task.done"]
      : ["task.status"];
    const admins = await filteredAdminRecipients({
      eventKeys,
      teamIds: [task.teamId, ...(task.assignee?.teamIds ?? []), ...(actor?.teamIds ?? [])],
      memberIds: [actorId, task.assigneeId],
    });
    const recipients = new Set<string>([
      task.creatorId,
      ...admins,
      ...(await observerRecipients("task.status")),
    ]);
    if (task.assigneeId) recipients.add(task.assigneeId);
    recipients.delete(actorId);
    const recipientIds = [...recipients];
    console.log(`[tasks] changeTaskStatus: ${recipientIds.length} destinatari de notificat`, recipientIds);

    // In-app + push (Telegram trimis separat mai jos, cu format dedicat)
    await notifyUsers(
      recipientIds,
      {
        title: statusChangeTitle(actorName, task.title, newStatus),
        taskId: task.id,
        url: "/tasks",
      },
      { telegram: false },
    );
    await notifyTaskUpdateTelegram(recipientIds, {
      actorName,
      taskTitle: task.title,
      statusLabel: TASK_STATUS_RO[newStatus],
    });

    if (opts.fromTelegram && task.telegramChatId && task.telegramMessageId) {
      const closed = newStatus === "DONE" || newStatus === "CANCELLED";
      await editMessageText(
        task.telegramChatId,
        task.telegramMessageId,
        `📋 ${escapeHtml(task.title)}\n\nStatus: <b>${TASK_STATUS_RO[newStatus]}</b>`,
        closed ? undefined : taskStatusButtons(task.id),
      );
    }
  } catch (e) {
    console.error(`[tasks] changeTaskStatus: pipeline-ul de notificare a eșuat pentru task ${taskId}`, e);
  }

  return { ok: true as const, changed: true, fromStatus: task.status, title: task.title, type: task.type };
}

/** Schimbă progresul (0-100) + jurnal + notificare admin/creator (best-effort, logat). */
export async function changeTaskProgress(taskId: string, actorId: string, progress: number) {
  console.log(`[tasks] changeTaskProgress: task=${taskId} actor=${actorId} -> ${progress}%`);
  if (DEMO) return { ok: false as const, error: "Mod demo." };
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      type: true,
      progress: true,
      creatorId: true,
      assigneeId: true,
      teamId: true,
      assignee: { select: { teamIds: true } },
    },
  });
  if (!task) {
    console.error(`[tasks] changeTaskProgress: task ${taskId} nu există`);
    return { ok: false as const, error: "Task inexistent." };
  }
  if (task.progress === p) {
    console.log(`[tasks] changeTaskProgress: deja ${p}%, nimic de făcut`);
    return { ok: true as const, changed: false, fromProgress: task.progress, title: task.title, type: task.type };
  }

  await prisma.task.update({ where: { id: taskId }, data: { progress: p } });
  console.log(`[tasks] changeTaskProgress: salvat în DB — ${task.progress}% → ${p}%`);

  try {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true, teamIds: true } });
    const actorName = actor?.name ?? "Cineva";

    const admins = await filteredAdminRecipients({
      eventKeys: ["task.progress"],
      teamIds: [task.teamId, ...(task.assignee?.teamIds ?? []), ...(actor?.teamIds ?? [])],
      memberIds: [actorId, task.assigneeId],
    });
    const recipients = new Set<string>([
      task.creatorId,
      ...admins,
      ...(await observerRecipients("task.progress")),
    ]);
    if (task.assigneeId) recipients.add(task.assigneeId);
    recipients.delete(actorId);
    const recipientIds = [...recipients];
    console.log(`[tasks] changeTaskProgress: ${recipientIds.length} destinatari de notificat`, recipientIds);

    await notifyUsers(
      recipientIds,
      {
        title: `Lucrătorul ${actorName} a actualizat task-ul „${task.title}" la ${p}%`,
        taskId: task.id,
        url: "/tasks",
      },
      { telegram: false },
    );
    await notifyTaskUpdateTelegram(recipientIds, {
      actorName,
      taskTitle: task.title,
      statusLabel: `Progres ${p}%`,
    });
  } catch (e) {
    console.error(`[tasks] changeTaskProgress: pipeline-ul de notificare a eșuat pentru task ${taskId}`, e);
  }
  return { ok: true as const, changed: true, fromProgress: task.progress, title: task.title, type: task.type };
}

/** Adaugă un comentariu pe task + notificare (web sau Telegram, best-effort, logat). */
export async function addTaskComment(
  taskId: string,
  actorId: string,
  body: string,
  source: CreatedFrom = "WEB",
) {
  console.log(`[tasks] addTaskComment: task=${taskId} actor=${actorId} source=${source}`);
  if (DEMO) return { ok: false as const, error: "Mod demo." };
  const text = body.trim();
  if (!text) return { ok: false as const, error: "Comentariul e gol." };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      creatorId: true,
      assigneeId: true,
      teamId: true,
      assignee: { select: { teamIds: true } },
    },
  });
  if (!task) {
    console.error(`[tasks] addTaskComment: task ${taskId} nu există`);
    return { ok: false as const, error: "Task inexistent." };
  }

  const comment = await prisma.taskComment.create({
    data: { taskId, userId: actorId, body: text, source },
    select: { id: true, createdAt: true },
  });
  console.log(`[tasks] addTaskComment: salvat comentariu ${comment.id} pe task ${taskId}`);

  try {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true, teamIds: true } });
    const actorName = actor?.name ?? "Cineva";

    const admins = await filteredAdminRecipients({
      eventKeys: ["task.comment"],
      teamIds: [task.teamId, ...(task.assignee?.teamIds ?? []), ...(actor?.teamIds ?? [])],
      memberIds: [actorId, task.assigneeId],
    });
    const recipients = new Set<string>([
      task.creatorId,
      ...admins,
      ...(await observerRecipients("task.comment")),
    ]);
    if (task.assigneeId) recipients.add(task.assigneeId);
    recipients.delete(actorId);
    const recipientIds = [...recipients];
    console.log(`[tasks] addTaskComment: ${recipientIds.length} destinatari de notificat`);

    const preview = text.length > 140 ? `${text.slice(0, 140)}…` : text;
    await notifyUsers(
      recipientIds,
      {
        title: `${actorName} a comentat pe task-ul „${task.title}"`,
        body: preview,
        taskId: task.id,
        url: "/tasks",
      },
      { telegram: false },
    );
    await notifyTaskUpdateTelegram(recipientIds, {
      actorName,
      taskTitle: task.title,
      statusLabel: preview,
      lineLabel: "Comentariu",
    });
  } catch (e) {
    console.error(`[tasks] addTaskComment: pipeline de notificare eșuat pentru task ${taskId}`, e);
  }

  return { ok: true as const, id: comment.id };
}

/** Comentariile unui task, în ordine cronologică. */
export async function listTaskComments(taskId: string) {
  if (DEMO) return [];
  return prisma.taskComment.findMany({
    where: { taskId },
    select: { id: true, body: true, source: true, createdAt: true, user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Verifică task-urile cu termen trecut, nefinalizate, și trimite notificarea de
 * întârziere o singură dată (overdueNotifiedAt). Apelată periodic (cron).
 */
export async function checkOverdueTasks(): Promise<{ checked: number; notified: number }> {
  if (DEMO) return { checked: 0, notified: 0 };
  const now = new Date();
  // Notă: pe MongoDB, filtrul Prisma „overdueNotifiedAt: null" NU se potrivește cu
  // documentele unde câmpul e absent (nescris încă) — doar cu cele unde e explicit
  // null. Ca să prindem și task-urile vechi (fără câmpul scris), filtrăm în JS.
  const candidates = await prisma.task.findMany({
    where: { dueAt: { lt: now }, status: { notIn: ["DONE", "CANCELLED"] } },
    select: {
      id: true,
      title: true,
      creatorId: true,
      assigneeId: true,
      teamId: true,
      overdueNotifiedAt: true,
      assignee: { select: { teamIds: true } },
    },
  });
  const tasks = candidates.filter((t) => !t.overdueNotifiedAt);
  console.log(
    `[tasks] checkOverdueTasks: ${candidates.length} cu termen trecut, ${tasks.length} încă nenotificate`,
  );

  let notified = 0;
  for (const task of tasks) {
    try {
      const admins = await filteredAdminRecipients({
        eventKeys: ["task.overdue"],
        teamIds: [task.teamId, ...(task.assignee?.teamIds ?? [])],
        memberIds: [task.assigneeId, task.creatorId],
      });
      const recipients = new Set<string>([
        task.creatorId,
        ...admins,
        ...(await observerRecipients("task.overdue")),
      ]);
      if (task.assigneeId) recipients.add(task.assigneeId);
      const recipientIds = [...recipients];

      await notifyUsers(
        recipientIds,
        { title: `Task în întârziere: „${task.title}"`, taskId: task.id, url: "/tasks" },
        { telegram: false },
      );
      await notifyTaskOverdueTelegram(recipientIds, task.title);

      await prisma.task.update({ where: { id: task.id }, data: { overdueNotifiedAt: now } });
      notified++;
    } catch (e) {
      console.error(`[tasks] checkOverdueTasks: eșuat pentru task ${task.id}`, e);
    }
  }
  console.log(`[tasks] checkOverdueTasks: ${notified}/${tasks.length} notificate`);
  return { checked: tasks.length, notified };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
