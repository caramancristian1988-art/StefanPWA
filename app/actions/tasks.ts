"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { can } from "@/lib/permissions";
import { DEMO } from "@/lib/demo";
import {
  createTask,
  changeTaskStatus,
  changeTaskProgress,
  notifyNewTask,
  addTaskComment,
  listTaskComments,
  updateTask,
} from "@/lib/services/tasks";
import { taskHistory, type TaskHistoryRow } from "@/lib/queries/tasks";
import { logAudit } from "@/lib/services/audit";
import { TASK_STATUS_RO } from "@/lib/telegram";
import type { TaskStatus, TaskType, TaskPriority } from "@prisma/client";

export type TaskState = { ok?: boolean; error?: string; id?: string } | undefined;

const moduleForType = (t: TaskType) => (t === "TICKET" ? "Tickets" : "Tasks");
const prefixForType = (t: TaskType) => (t === "TICKET" ? "ticket" : "task");

const TYPES: TaskType[] = ["TASK", "TICKET", "WORK_ORDER"];
const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: TaskStatus[] = [
  "NEW",
  "ASSIGNED",
  "READ",
  "IN_PROGRESS",
  "ON_HOLD",
  "REVIEW",
  "DONE",
  "CANCELLED",
];

function revalidateTasks() {
  for (const p of ["/tasks", "/dashboard", "/projects", "/kanban", "/notificari"]) revalidatePath(p);
}

export async function createTaskAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const user = await requireUser();
  if (!can(user, "tasks.create")) return { error: "Nu ai permisiunea de creare." };
  if (DEMO) return { error: "Mod demo: conectează o bază de date." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Titlul e obligatoriu." };

  const type = TYPES.includes(formData.get("type") as TaskType)
    ? (formData.get("type") as TaskType)
    : "TASK";
  const priority = PRIORITIES.includes(formData.get("priority") as TaskPriority)
    ? (formData.get("priority") as TaskPriority)
    : "MEDIUM";
  const dueRaw = String(formData.get("dueAt") ?? "");
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? new Date(`${dueRaw}T12:00:00`) : null;

  const res = await createTask(
    user.id,
    {
      title,
      description: String(formData.get("description") ?? ""),
      type,
      priority,
      dueAt,
      assigneeId: (formData.get("assigneeId") as string) || null,
      teamId: (formData.get("teamId") as string) || null,
      projectId: (formData.get("projectId") as string) || null,
    },
    "WEB",
  );
  if (!res.ok) return { error: res.error };
  // Notificare Telegram în fundal — nu blochează și nu poate face crearea să eșueze
  after(() => notifyNewTask(res.id));
  await logAudit(
    { id: user.id, name: user.name, role: user.role, isSuperAdmin: user.isSuperAdmin },
    { action: `${prefixForType(type)}.create`, module: moduleForType(type), objectId: res.id, objectName: title },
  );
  revalidateTasks();
  return { ok: true, id: res.id };
}

/** Schimbarea statusului e permisă oricărui utilizator autentificat (acțiune zilnică). */
export async function setTaskStatus(id: string, status: string): Promise<TaskState> {
  const user = await requireUser();
  console.log(`[tasks.action] setTaskStatus: user=${user.id} (${user.name}) task=${id} -> ${status}`);
  if (!STATUSES.includes(status as TaskStatus)) {
    console.error(`[tasks.action] setTaskStatus: status invalid primit din client: "${status}"`);
    return { error: "Status invalid." };
  }
  const res = await changeTaskStatus(id, user.id, status as TaskStatus);
  if (!res.ok) {
    console.error(`[tasks.action] setTaskStatus: eșuat — ${res.error}`);
    return { error: res.error };
  }
  if (res.changed) {
    await logAudit(
      { id: user.id, name: user.name, role: user.role, isSuperAdmin: user.isSuperAdmin },
      {
        action: `${prefixForType(res.type)}.status_change`,
        module: moduleForType(res.type),
        objectId: id,
        objectName: res.title,
        oldValue: TASK_STATUS_RO[res.fromStatus],
        newValue: TASK_STATUS_RO[status as TaskStatus],
      },
    );
  }
  revalidateTasks();
  return { ok: true };
}

/** Actualizare progres (0-100), permisă oricărui utilizator autentificat. */
export async function setTaskProgress(id: string, progress: number): Promise<TaskState> {
  const user = await requireUser();
  console.log(`[tasks.action] setTaskProgress: user=${user.id} (${user.name}) task=${id} -> ${progress}%`);
  const res = await changeTaskProgress(id, user.id, progress);
  if (!res.ok) {
    console.error(`[tasks.action] setTaskProgress: eșuat — ${res.error}`);
    return { error: res.error };
  }
  if (res.changed) {
    await logAudit(
      { id: user.id, name: user.name, role: user.role, isSuperAdmin: user.isSuperAdmin },
      {
        action: "task.progress_change",
        module: moduleForType(res.type),
        objectId: id,
        objectName: res.title,
        oldValue: `${res.fromProgress}%`,
        newValue: `${progress}%`,
      },
    );
  }
  revalidateTasks();
  return { ok: true };
}

/** Istoricul de status (timeline) — lazy, la expandarea unui task. */
export async function getTaskHistory(id: string): Promise<TaskHistoryRow[]> {
  const user = await requireUser();
  if (!can(user, "tasks.view")) return [];
  return taskHistory(id);
}

export type TaskCommentRow = {
  id: string;
  body: string;
  source: "WEB" | "TELEGRAM" | "VOICE";
  createdAt: Date;
  userName: string;
};

/** Comentariile unui task — lazy, la expandarea unui task. */
export async function getTaskComments(id: string): Promise<TaskCommentRow[]> {
  const user = await requireUser();
  if (!can(user, "tasks.view")) return [];
  const rows = await listTaskComments(id);
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    source: r.source,
    createdAt: r.createdAt,
    userName: r.user?.name ?? "—",
  }));
}

/** Adaugă un comentariu pe task, permis oricărui utilizator autentificat. */
export async function addTaskCommentAction(id: string, body: string): Promise<TaskState> {
  const user = await requireUser();
  console.log(`[tasks.action] addTaskCommentAction: user=${user.id} (${user.name}) task=${id}`);
  const res = await addTaskComment(id, user.id, body, "WEB");
  if (!res.ok) {
    console.error(`[tasks.action] addTaskCommentAction: eșuat — ${res.error}`);
    return { error: res.error };
  }
  revalidateTasks();
  return { ok: true, id: res.id };
}

export async function updateTaskAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const user = await requireUser();
  if (!can(user, "tasks.edit")) return { error: "Nu ai permisiunea de editare." };
  if (DEMO) return { error: "Mod demo: conectează o bază de date." };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "ID task lipsă." };

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  const dueRaw = String(formData.get("dueAt") ?? "");
  const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? new Date(`${dueRaw}T12:00:00`) : null;
  const priority = PRIORITIES.includes(formData.get("priority") as TaskPriority)
    ? (formData.get("priority") as TaskPriority)
    : "MEDIUM";

  const res = await updateTask(id, user.id, {
    title,
    description,
    assigneeId: (formData.get("assigneeId") as string) || null,
    teamId: (formData.get("teamId") as string) || null,
    projectId: (formData.get("projectId") as string) || null,
    priority,
    dueAt,
  });
  if (!res.ok) return { error: res.error };

  await logAudit(
    { id: user.id, name: user.name, role: user.role, isSuperAdmin: user.isSuperAdmin },
    { action: `${prefixForType(res.type)}.edit`, module: moduleForType(res.type), objectId: id, objectName: res.title },
  );
  revalidateTasks();
  return { ok: true, id };
}

export async function deleteTask(id: string): Promise<void> {
  const user = await requireUser();
  if (!can(user, "tasks.delete")) return;
  if (DEMO) return;
  const task = await prisma.task.findUnique({ where: { id }, select: { title: true, type: true } });
  await prisma.taskActivity.deleteMany({ where: { taskId: id } });
  await prisma.taskComment.deleteMany({ where: { taskId: id } });
  await prisma.task.delete({ where: { id } }).catch(() => {});
  if (task) {
    await logAudit(
      { id: user.id, name: user.name, role: user.role, isSuperAdmin: user.isSuperAdmin },
      { action: `${prefixForType(task.type)}.delete`, module: moduleForType(task.type), objectId: id, objectName: task.title },
    );
  }
  revalidateTasks();
}
