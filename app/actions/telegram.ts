"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal";
import { env } from "@/lib/env";
import { setWebhook } from "@/lib/telegram";
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
