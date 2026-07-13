export type StatusConfig = {
  key: string;
  label: string;
  color: string;        // hex color e.g. "#0ea5e9"
  notifyOnEnter: boolean;  // trimite notificare staff când tichetul intră în acest status
  suppressAll: boolean;    // oprește toate notificările când tichetul e în acest status
  order: number;
};

export const DEFAULT_STATUS_CONFIGS: StatusConfig[] = [
  { key: "NEW",         label: "Nou",           color: "#0ea5e9", notifyOnEnter: true,  suppressAll: false, order: 0 },
  { key: "ASSIGNED",   label: "Asignat",        color: "#8b5cf6", notifyOnEnter: true,  suppressAll: false, order: 1 },
  { key: "READ",       label: "Citit",          color: "#06b6d4", notifyOnEnter: false, suppressAll: false, order: 2 },
  { key: "IN_PROGRESS",label: "În lucru",       color: "#f59e0b", notifyOnEnter: true,  suppressAll: false, order: 3 },
  { key: "ON_HOLD",    label: "În așteptare",   color: "#ef4444", notifyOnEnter: true,  suppressAll: false, order: 4 },
  { key: "REVIEW",     label: "Verificare",     color: "#10b981", notifyOnEnter: false, suppressAll: false, order: 5 },
  { key: "DONE",       label: "Finalizat",      color: "#22c55e", notifyOnEnter: false, suppressAll: true,  order: 6 },
  { key: "CANCELLED",  label: "Anulat",         color: "#6b7280", notifyOnEnter: false, suppressAll: true,  order: 7 },
];

export function parseStatusConfigs(raw: unknown): StatusConfig[] {
  if (!Array.isArray(raw)) return DEFAULT_STATUS_CONFIGS;
  return raw as StatusConfig[];
}

export function getStatusConfig(configs: StatusConfig[], key: string): StatusConfig | undefined {
  return configs.find((c) => c.key === key);
}

/** Returnează config-ul salvat din DB sau default-urile */
export async function loadStatusConfigs(): Promise<StatusConfig[]> {
  const { prisma } = await import("./prisma");
  const settings = await prisma.companySettings.findFirst({
    where: { singleton: "main" },
    select: { ticketStatusConfig: true },
  });
  return parseStatusConfigs(settings?.ticketStatusConfig);
}
