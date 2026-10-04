/**
 * Permisiuni individuale per utilizator.
 * ADMIN (role) sau cheia "admin" => acces total.
 * Cheile sunt stocate în User.permissions (String[]).
 */

export type PermissionKey =
  // Task-uri / Tichete / Work Orders
  | "tasks.view"
  | "tasks.create"
  | "tasks.edit"
  | "tasks.delete"
  | "tasks.assign"
  | "tasks.close"
  // Proiecte
  | "projects.view"
  | "projects.create"
  | "projects.edit"
  | "projects.delete"
  // Clienți
  | "clients.view"
  | "clients.create"
  | "clients.edit"
  | "clients.delete"
  // Facturi
  | "invoices.view"
  | "invoices.create"
  | "invoices.edit"
  | "invoices.delete"
  // Programări
  | "appointments.view"
  | "appointments.manage"
  // Echipe
  | "teams.view"
  | "teams.manage"
  // Administrare
  | "dashboard.view"
  | "reports.view"
  | "users.manage"
  | "notifications.receive"
  | "admin";

export const PERMISSION_GROUPS: {
  group: string;
  items: { key: PermissionKey; label: string }[];
}[] = [
  {
    group: "Task-uri / Tichete / Work Orders",
    items: [
      { key: "tasks.view", label: "Vizualizare" },
      { key: "tasks.create", label: "Creare" },
      { key: "tasks.edit", label: "Editare" },
      { key: "tasks.delete", label: "Ștergere" },
      { key: "tasks.assign", label: "Asignare" },
      { key: "tasks.close", label: "Închidere / finalizare" },
    ],
  },
  {
    group: "Proiecte",
    items: [
      { key: "projects.view", label: "Vizualizare" },
      { key: "projects.create", label: "Creare" },
      { key: "projects.edit", label: "Editare" },
      { key: "projects.delete", label: "Ștergere" },
    ],
  },
  {
    group: "Clienți",
    items: [
      { key: "clients.view", label: "Vizualizare" },
      { key: "clients.create", label: "Creare" },
      { key: "clients.edit", label: "Editare" },
      { key: "clients.delete", label: "Ștergere" },
    ],
  },
  {
    group: "Facturi",
    items: [
      { key: "invoices.view", label: "Vizualizare" },
      { key: "invoices.create", label: "Creare" },
      { key: "invoices.edit", label: "Editare" },
      { key: "invoices.delete", label: "Ștergere" },
    ],
  },
  {
    group: "Programări",
    items: [
      { key: "appointments.view", label: "Vizualizare" },
      { key: "appointments.manage", label: "Gestionare (creare/editare)" },
    ],
  },
  {
    group: "Echipe",
    items: [
      { key: "teams.view", label: "Vizualizare" },
      { key: "teams.manage", label: "Gestionare" },
    ],
  },
  {
    group: "Administrare",
    items: [
      { key: "dashboard.view", label: "Vizualizare dashboard" },
      { key: "reports.view", label: "Vizualizare rapoarte" },
      { key: "users.manage", label: "Gestionare utilizatori" },
      { key: "admin", label: "Acces administrativ (tot)" },
    ],
  },
];

export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_GROUPS.flatMap(
  (g) => g.items.map((i) => i.key),
);

export type PermissionSubject = {
  role: "ADMIN" | "STAFF";
  permissions: string[];
};

/** Are userul permisiunea cerută? ADMIN sau "admin" => mereu true. */
export function can(user: PermissionSubject, key: PermissionKey): boolean {
  if (user.role === "ADMIN") return true;
  if (user.permissions.includes("admin")) return true;
  return user.permissions.includes(key);
}

export function canAny(user: PermissionSubject, keys: PermissionKey[]): boolean {
  return keys.some((k) => can(user, k));
}

export type TaskOwnership = {
  creatorId: string;
  assigneeId: string | null;
  extraAssigneeIds?: string[];
};

/**
 * Editare task: fie permisiunea generală "tasks.edit"/ADMIN, fie ești creatorul/asignatul
 * task-ului respectiv. Fără fallback-ul de proprietate, un STAFF fără "tasks.edit" nu-și putea
 * edita propriile task-uri (create sau asignate lui) — vedea "Nu ai permisiunea de editare"
 * deși era exact persoana vizată de task.
 */
export function canEditTask(
  user: PermissionSubject & { id: string },
  task: TaskOwnership,
): boolean {
  if (can(user, "tasks.edit")) return true;
  if (task.creatorId === user.id) return true;
  if (task.assigneeId === user.id) return true;
  if (task.extraAssigneeIds?.includes(user.id)) return true;
  return false;
}

export type TaskVisibilitySubject = {
  id: string;
  taskViewScope: string;
  taskViewTeamIds: string[];
  taskViewMemberIds: string[];
};

export type TaskTeamOwnership = TaskOwnership & {
  teamId: string | null;
  extraTeamIds?: string[];
};

/**
 * Vede userul task-ul ăsta? taskViewScope="ALL" (implicit — comportamentul de dinainte de
 * restricție) vede tot. "RESTRICTED" vede doar: propriile task-uri (creator/asignat/co-asignat —
 * mereu vizibile, indiferent de listele de mai jos) + cele din echipele/persoanele alese de admin
 * la crearea contului (taskViewTeamIds/taskViewMemberIds) — vezi lib/queries/tasks.ts (buildWhere)
 * pentru aceeași regulă aplicată la nivel de listă/export, nu doar la deschiderea individuală.
 */
export function canViewTask(user: TaskVisibilitySubject, task: TaskTeamOwnership): boolean {
  if (user.taskViewScope !== "RESTRICTED") return true;
  if (task.creatorId === user.id) return true;
  if (task.assigneeId === user.id) return true;
  if (task.extraAssigneeIds?.includes(user.id)) return true;
  if (task.teamId && user.taskViewTeamIds.includes(task.teamId)) return true;
  if (task.extraTeamIds?.some((id) => user.taskViewTeamIds.includes(id))) return true;
  if (task.assigneeId && user.taskViewMemberIds.includes(task.assigneeId)) return true;
  if (task.extraAssigneeIds?.some((id) => user.taskViewMemberIds.includes(id))) return true;
  if (user.taskViewMemberIds.includes(task.creatorId)) return true;
  return false;
}
