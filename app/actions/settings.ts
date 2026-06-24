"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { settingsSchema, categorySchema } from "@/lib/validation";
import { DEMO } from "@/lib/demo";

export type SettingsState = { ok?: boolean; error?: string } | undefined;

const DEMO_MSG = "Mod demo: conectează o bază de date pentru a salva.";

export async function createCategory(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  if (DEMO) return { error: DEMO_MSG };
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "#6366f1",
    defaultDurationMinutes: formData.get("defaultDurationMinutes") || 30,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  }
  await prisma.category.create({
    data: { userId: user.id, ...parsed.data },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateCategory(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  if (DEMO) return { error: DEMO_MSG };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "ID lipsă." };
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || "#6366f1",
    defaultDurationMinutes: formData.get("defaultDurationMinutes") || 30,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Date invalide." };
  await prisma.category.updateMany({ where: { id, userId: user.id }, data: parsed.data });
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<void> {
  const user = await requireUser();
  if (DEMO) return;
  await prisma.category.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/settings");
}

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  if (DEMO) return { error: DEMO_MSG };

  const leadRaw = String(formData.get("reminderLeadMinutes") ?? "1440,180");
  const leadMinutes = leadRaw
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const parsed = settingsSchema.safeParse({
    timezone: formData.get("timezone") ?? "Europe/Bucharest",
    locale: formData.get("locale") ?? "ro",
    theme: formData.get("theme") ?? "system",
    workdayStart: formData.get("workdayStart") ?? "09:00",
    workdayEnd: formData.get("workdayEnd") ?? "18:00",
    slotMinutes: formData.get("slotMinutes") ?? 30,
    defaultReminderEmail: formData.get("defaultReminderEmail") === "on",
    defaultReminderTelegram: formData.get("defaultReminderTelegram") === "on",
    reminderLeadMinutes: leadMinutes.length ? leadMinutes : [1440, 180],
    emailFromName: formData.get("emailFromName") ?? "",
    emailFromAddr: formData.get("emailFromAddr") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Setări invalide." };
  }
  const d = parsed.data;

  await prisma.appSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      timezone: d.timezone,
      locale: d.locale,
      theme: d.theme,
      workdayStart: d.workdayStart,
      workdayEnd: d.workdayEnd,
      slotMinutes: d.slotMinutes,
      defaultReminderEmail: d.defaultReminderEmail,
      defaultReminderTelegram: d.defaultReminderTelegram,
      reminderLeadMinutes: d.reminderLeadMinutes,
      emailFromName: d.emailFromName || null,
      emailFromAddr: d.emailFromAddr || null,
    },
    update: {
      timezone: d.timezone,
      locale: d.locale,
      theme: d.theme,
      workdayStart: d.workdayStart,
      workdayEnd: d.workdayEnd,
      slotMinutes: d.slotMinutes,
      defaultReminderEmail: d.defaultReminderEmail,
      defaultReminderTelegram: d.defaultReminderTelegram,
      reminderLeadMinutes: d.reminderLeadMinutes,
      emailFromName: d.emailFromName || null,
      emailFromAddr: d.emailFromAddr || null,
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}
