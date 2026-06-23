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
  for (const p of ["/tasks", "/dashboard", "/projects"]) revalidatePath(p);
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
  if (!STATUSES.includes(status as TaskStatus)) return { error: "Status invalid." };
  const res = await changeTaskStatus(id, user.id, status as TaskStatus);
  if (!res.ok) return { error: res.error };
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
  const res = await changeTaskProgress(id, user.id, progress);
  if (!res.ok) return { error: res.error };
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

export async function deleteTask(id: string): Promise<void> {
  const user = await requireUser();
  if (!can(user, "tasks.delete")) return;
  if (DEMO) return;
  const task = await prisma.task.findUnique({ where: { id }, select: { title: true, type: true } });
  await prisma.taskActivity.deleteMany({ where: { taskId: id } });
  await prisma.task.delete({ where: { id } }).catch(() => {});
  if (task) {
    await logAudit(
      { id: user.id, name: user.name, role: user.role, isSuperAdmin: user.isSuperAdmin },
      { action: `${prefixForType(task.type)}.delete`, module: moduleForType(task.type), objectId: id, objectName: task.title },
    );
  }
  revalidateTasks();
}
