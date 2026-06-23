"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { env } from "@/lib/env";
import { can, ALL_PERMISSION_KEYS } from "@/lib/permissions";
import { hashPassword } from "@/lib/password";
import { setWebhook, sendMessage, mainMenu, workerMenu } from "@/lib/telegram";
import { logAudit } from "@/lib/services/audit";
import { DEMO } from "@/lib/demo";

export type TgState = { ok?: boolean; error?: string; message?: string } | undefined;

export async function setWebhookAction(): Promise<TgState> {
  await requireUser();
  if (!env.telegram.enabled) {
    return { error: "TELEGRAM_BOT_TOKEN nu este configurat." };
  }
  const url = `${env.appUrl}/api/telegram/webhook`;
  const res = await setWebhook(url);
  if (res === null) return { error: "Telegram a respins setarea webhook-ului." };
  revalidatePath("/telegram");
  return { ok: true, message: `Webhook setat: ${url}` };
}

export async function unlinkTelegram(): Promise<void> {
  const user = await requireUser();
  if (DEMO) return;
  await prisma.telegramAccount.deleteMany({ where: { userId: user.id } });
  revalidatePath("/telegram");
}

export type ApproveState = { ok?: boolean; error?: string } | undefined;

/**
 * Atribuie un contact Telegram „pending" (a apăsat /start, fără cont CRM) la un
 * profil nou de utilizator. Lucrătorul nu se loghează niciodată în CRM — primește
 * doar task-uri/notificări prin bot, după ce administratorul completează aici.
 */
export async function approveTelegramContact(
  _prev: ApproveState,
  formData: FormData,
): Promise<ApproveState> {
  const admin = await requireUser();
  if (!can(admin, "users.manage")) return { error: "Fără permisiune." };
  if (DEMO) return { error: "Mod demo: conectează o bază de date." };

  const contactId = String(formData.get("contactId") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();
  const role = formData.get("role") === "ADMIN" ? "ADMIN" : "STAFF";
  const isActive = formData.get("isActive") !== "off";
  const permissions = formData
    .getAll("permissions")
    .map(String)
    .filter((p) => (ALL_PERMISSION_KEYS as string[]).includes(p));

  if (!contactId) return { error: "Cerere Telegram invalidă." };
  if (name.length < 2) return { error: "Numele e prea scurt." };

  const contact = await prisma.telegramAccount.findUnique({ where: { id: contactId } });
  if (!contact) return { error: "Cererea nu mai există." };
  if (contact.userId) return { error: "Acest contact e deja atribuit unui cont." };

  const email = `tg-${contact.telegramUserId}@telegram.local`;
  const generatedPassword = randomBytes(24).toString("base64url");

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone: phone || null,
      passwordHash: await hashPassword(generatedPassword),
      role,
      isActive,
      permissions: role === "ADMIN" ? [] : permissions,
      teamIds: teamId ? [teamId] : [],
      // chat-ul e deja confirmat prin /start — notificările directe funcționează imediat
      telegramChatId: contact.chatId,
    },
    select: { id: true },
  });

  await prisma.telegramAccount.update({
    where: { id: contactId },
    data: {
      userId: user.id,
      firstName: firstName || contact.firstName,
      lastName: lastName || contact.lastName,
    },
  });

  await logAudit(
    { id: admin.id, name: admin.name, role: admin.role, isSuperAdmin: admin.isSuperAdmin },
    {
      action: "user.create",
      module: "Users",
      objectId: user.id,
      objectName: name,
      newValue: "atribuit din contact Telegram",
    },
  );

  try {
    await sendMessage(
      contact.chatId,
      "✅ <b>Contul tău a fost activat de administrator!</b>\nDe acum primești task-uri și notificări direct aici.",
    );
    await sendMessage(contact.chatId, "Alege o opțiune:", role === "ADMIN" ? mainMenu() : workerMenu());
  } catch (e) {
    console.error(`[telegram] approveTelegramContact: mesaj de bun venit eșuat pentru ${contact.chatId}`, e);
  }

  revalidatePath("/telegram");
  revalidatePath("/users");
  return { ok: true };
}

/** Respinge / șterge o cerere de conectare Telegram neatribuită. */
export async function rejectTelegramContact(contactId: string): Promise<void> {
  const admin = await requireUser();
  if (!can(admin, "users.manage")) return;
  if (DEMO) return;
  // Verificare în JS (nu filtru DB pe userId: null — vezi nota din schema.prisma).
  const contact = await prisma.telegramAccount.findUnique({ where: { id: contactId }, select: { userId: true } });
  if (!contact || contact.userId) return;
  await prisma.telegramAccount.delete({ where: { id: contactId } });
  revalidatePath("/telegram");
}
