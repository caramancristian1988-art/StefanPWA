// Constante partajate pentru Audit Logs (folosite și pe server, și pe client).

export const AUDIT_MODULES = [
  "Tasks",
  "Tickets",
  "Projects",
  "Clients",
  "Invoices",
  "Users",
  "Settings",
  "Auth",
  "Notifications",
] as const;
export type AuditModuleName = (typeof AUDIT_MODULES)[number];

export const MODULE_LABELS: Record<string, string> = {
  Tasks: "Task-uri",
  Tickets: "Tichete",
  Projects: "Proiecte",
  Clients: "Clienți",
  Invoices: "Facturi",
  Users: "Utilizatori",
  Settings: "Setări",
  Auth: "Autentificare",
  Notifications: "Notificări",
};

export const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Autentificare",
  "auth.logout": "Delogare",

  "task.create": "Creare task",
  "task.update": "Editare task",
  "task.delete": "Ștergere task",
  "task.status_change": "Schimbare status task",
  "task.progress_change": "Schimbare progres task",
  "task.assign": "Asignare task",

  "ticket.create": "Creare tichet",
  "ticket.update": "Editare tichet",
  "ticket.delete": "Ștergere tichet",
  "ticket.status_change": "Schimbare status tichet",

  "project.create": "Creare proiect",
  "project.update": "Editare proiect",
  "project.delete": "Ștergere proiect",

  "client.create": "Creare client",
  "client.update": "Editare client",
  "client.delete": "Ștergere client",

  "invoice.create": "Creare factură",
  "invoice.update": "Editare factură",
  "invoice.delete": "Ștergere factură",
  "invoice.status_change": "Schimbare status factură",

  "user.create": "Creare utilizator",
  "user.update": "Editare utilizator",
  "user.delete": "Ștergere utilizator",
  "user.activate": "Activare utilizator",
  "user.deactivate": "Dezactivare utilizator",
  "user.permissions_change": "Schimbare permisiuni",
  "user.superadmin_change": "Schimbare super-admin",

  "settings.update": "Modificare setări",
  "notifications.settings_change": "Setări notificări",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function moduleLabel(m: string): string {
  return MODULE_LABELS[m] ?? m;
}

// Listă pentru filtrul „tip acțiune" în UI (cheie + etichetă).
export const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([key, label]) => ({ key, label }));
