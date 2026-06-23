import "server-only";
import { prisma } from "../prisma";
import {
  sendMessage,
  answerCallback,
  mainMenu,
  apptButtons,
  getFileBuffer,
  verifyLinkToken,
  type InlineButton,
} from "../telegram";
import { getUserTimezone } from "../queries/settings";
import { listByDateKey, listByDateKeys } from "../queries/appointments";
import { searchClients } from "../queries/clients";
import { listCategories } from "../queries/categories";
import { createAppointment, changeStatus } from "./appointments";
import { createTask, changeTaskStatus, changeTaskProgress, notifyNewTask } from "./tasks";
import { transcribeAudio } from "./voice";
import { todayKey, tomorrowKey, weekKeys, formatTime, humanDay } from "../date";
import type { AppointmentStatus, TaskStatus } from "@prisma/client";

const STATUS_RO: Record<AppointmentStatus, string> = {
  NEW: "Nou",
  CONFIRMED: "Confirmat",
  IN_PROGRESS: "În lucru",
  DONE: "Finalizat",
  CANCELLED: "Anulat",
  NO_SHOW: "Absent",
};

type LinkedUser = { userId: string; chatId: string };

async function resolveUser(telegramUserId: number | string): Promise<LinkedUser | null> {
  const acc = await prisma.telegramAccount.findUnique({
    where: { telegramUserId: String(telegramUserId) },
    select: { userId: true, chatId: true },
  });
  return acc;
}

async function renderDay(chatId: string | number, userId: string, dateKey: string, tz: string) {
  const appts = await listByDateKey(userId, dateKey);
  const header = `📅 <b>${humanDay(dateKey, tz)}</b> — ${appts.length} programări`;
  await sendMessage(chatId, header, appts.length ? undefined : mainMenu());
  for (const a of appts.slice(0, 12)) {
    const line =
      `🕐 <b>${formatTime(a.startAt, tz)}</b> · ${a.clientNameSnapshot}` +
      (a.categoryNameSnapshot ? ` · ${a.categoryNameSnapshot}` : "") +
      ` · ${STATUS_RO[a.status]}`;
    await sendMessage(chatId, line, apptButtons(a.id));
  }
}

async function renderWeek(chatId: string | number, userId: string, tz: string) {
  const keys = weekKeys(todayKey(tz), tz);
  const appts = await listByDateKeys(userId, keys);
  if (appts.length === 0) {
    await sendMessage(chatId, "🗓 Nicio programare săptămâna aceasta.", mainMenu());
    return;
  }
  const lines: string[] = ["🗓 <b>Săptămâna aceasta</b>", ""];
  let lastDay = "";
  for (const a of appts) {
    if (a.dateKey !== lastDay) {
      lines.push(`\n<b>${humanDay(a.dateKey, tz)}</b>`);
      lastDay = a.dateKey;
    }
    lines.push(
      `${formatTime(a.startAt, tz)} · ${a.clientNameSnapshot}` +
        (a.categoryNameSnapshot ? ` · ${a.categoryNameSnapshot}` : ""),
    );
  }
  await sendMessage(chatId, lines.join("\n"), mainMenu());
}

// ---------- Update entrypoint ----------

export async function handleUpdate(update: Record<string, unknown>): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query as Cb);
  } else if (update.message) {
    await handleMessage(update.message as Msg);
  }
}

type Msg = {
  chat: { id: number };
  from: { id: number; username?: string; first_name?: string };
  text?: string;
  voice?: { file_id: string };
};

type Cb = {
  id: string;
  data?: string;
  from: { id: number };
  message?: { chat: { id: number } };
};

async function handleMessage(msg: Msg) {
  const chatId = msg.chat.id;
  const text = (msg.text ?? "").trim();

  // /start [token] — linkare cont
  if (text.startsWith("/start")) {
    const token = text.split(/\s+/)[1];
    if (token) {
      const userId = verifyLinkToken(token);
      if (userId) {
        await prisma.telegramAccount.upsert({
          where: { telegramUserId: String(msg.from.id) },
          create: {
            userId,
            telegramUserId: String(msg.from.id),
            chatId: String(chatId),
            username: msg.from.username ?? null,
            firstName: msg.from.first_name ?? null,
          },
          update: { chatId: String(chatId), userId },
        }).catch(() => {});
        await sendMessage(chatId, "✅ Cont conectat! Alege o opțiune:", mainMenu());
        return;
      }
      await sendMessage(chatId, "❌ Cod de conectare invalid sau expirat.");
      return;
    }
    await sendMessage(
      chatId,
      "👋 Salut! Conectează-te din aplicație: <b>Telegram → Conectează</b>.",
    );
    return;
  }

  const user = await resolveUser(msg.from.id);

  // Mesaj vocal → programare
  if (msg.voice) {
    if (!user) return void sendMessage(chatId, "Conectează-te mai întâi din aplicație.");
    await handleVoice(chatId, user.userId, msg.voice.file_id);
    return;
  }

  if (!user) {
    await sendMessage(chatId, "Conectează-te din aplicație pentru a folosi botul.");
    return;
  }

  if (text === "/menu" || text === "/start") {
    await sendMessage(chatId, "Meniu:", mainMenu());
    return;
  }

  // Orice alt text = căutare client
  const matches = await searchClients(user.userId, text, 8);
  if (matches.length === 0) {
    await sendMessage(chatId, `Niciun client pentru „${text}".`, mainMenu());
    return;
  }
  const lines = ["🔍 <b>Clienți găsiți</b>", ""];
  for (const m of matches) lines.push(`• ${m.name}${m.phone ? ` · ${m.phone}` : ""}`);
  await sendMessage(chatId, lines.join("\n"), mainMenu());
}

async function handleCallback(cb: Cb) {
  // Răspunde instant (botul nu pare lent)
  await answerCallback(cb.id);
  const chatId = cb.message?.chat.id;
  const data = cb.data ?? "";
  if (!chatId) return;

  const user = await resolveUser(cb.from.id);
  if (!user) {
    await sendMessage(chatId, "Conectează-te din aplicație.");
    return;
  }
  const tz = await getUserTimezone(user.userId);

  if (data === "TODAY") return void renderDay(chatId, user.userId, todayKey(tz), tz);
  if (data === "TOMORROW") return void renderDay(chatId, user.userId, tomorrowKey(tz), tz);
  if (data === "WEEK") return void renderWeek(chatId, user.userId, tz);
  if (data === "ADD")
    return void sendMessage(chatId, "➕ Trimite un <b>mesaj vocal</b> cu programarea, ex: „Ion mâine la 3 la tuns”.");
  if (data === "VOICE")
    return void sendMessage(chatId, "🎤 Trimite un mesaj vocal cu programarea dorită.");
  if (data === "SEARCH")
    return void sendMessage(chatId, "🔍 Scrie numele clientului pentru căutare.");
  if (data === "SETTINGS")
    return void sendMessage(chatId, "⚙️ Setările se gestionează din aplicație.", mainMenu());

  // Schimbare status TASK (din butoanele de notificare)
  const taskMatch = data.match(/^TST:(\w+):(.+)$/);
  if (taskMatch) {
    const res = await changeTaskStatus(
      taskMatch[2],
      user.userId,
      taskMatch[1] as TaskStatus,
      { fromTelegram: true },
    );
    if (!res.ok) await sendMessage(chatId, `❌ ${res.error}`);
    return;
  }

  // Progres TASK din butoane
  const prMatch = data.match(/^TPR:(\d+):(.+)$/);
  if (prMatch) {
    const res = await changeTaskProgress(prMatch[2], user.userId, Number(prMatch[1]));
    await sendMessage(chatId, res.ok ? `📊 Progres: ${prMatch[1]}%` : `❌ ${res.error}`);
    return;
  }

  // Schimbare status programare
  const stMatch = data.match(/^ST_(CONFIRM|DONE|CANCEL|NOSHOW):(.+)$/);
  if (stMatch) {
    const map: Record<string, AppointmentStatus> = {
      CONFIRM: "CONFIRMED",
      DONE: "DONE",
      CANCEL: "CANCELLED",
      NOSHOW: "NO_SHOW",
    };
    const status = map[stMatch[1]];
    const res = await changeStatus(user.userId, stMatch[2], status);
    await sendMessage(chatId, res.ok ? `✅ Status: ${STATUS_RO[status]}` : `❌ ${res.error}`);
    return;
  }

  // Confirmare programare din voce
  const vMatch = data.match(/^V(CREATE|CANCEL):(.+)$/);
  if (vMatch) {
    if (vMatch[1] === "CANCEL") {
      await prisma.voiceCommandLog.updateMany({
        where: { id: vMatch[2], userId: user.userId },
        data: { status: "DISCARDED" },
      });
      await sendMessage(chatId, "Am renunțat la programare.", mainMenu());
      return;
    }
    await confirmVoiceAppointment(chatId, user.userId, vMatch[2], tz);
    return;
  }
}

async function handleVoice(chatId: number, userId: string, fileId: string) {
  await sendMessage(chatId, "🎧 Procesez mesajul vocal…");
  const buf = await getFileBuffer(fileId);
  if (!buf) return void sendMessage(chatId, "Nu am putut descărca audio-ul.");

  try {
    const transcript = (await transcribeAudio(buf, "voice.ogg", "audio/ogg")).trim();
    if (!transcript) return void sendMessage(chatId, "Nu am înțeles mesajul vocal.");

    await prisma.voiceCommandLog
      .create({ data: { userId, source: "TELEGRAM", transcript, status: "CONFIRMED" } })
      .catch(() => {});

    const title = transcript.length > 140 ? `${transcript.slice(0, 140)}…` : transcript;
    const res = await createTask(
      userId,
      { title, description: transcript !== title ? transcript : undefined },
      "VOICE",
    );

    if (res.ok) {
      await notifyNewTask(res.id);
      await sendMessage(chatId, `✅ <b>Task creat din voce</b>\n«${res.title}»`);
    } else {
      await sendMessage(chatId, `❌ ${res.error}`);
    }
  } catch (e) {
    await sendMessage(chatId, `❌ ${e instanceof Error ? e.message : "Eroare procesare voce."}`);
  }
}

async function confirmVoiceAppointment(
  chatId: number,
  userId: string,
  logId: string,
  tz: string,
) {
  const log = await prisma.voiceCommandLog.findFirst({
    where: { id: logId, userId },
    select: { parsedJson: true },
  });
  if (!log?.parsedJson) return void sendMessage(chatId, "Comandă inexistentă.");
  const p = log.parsedJson as Record<string, unknown>;

  // Mapează categoria (nume) la id
  let categoryId: string | undefined;
  if (typeof p.category === "string" && p.category) {
    const cats = await listCategories(userId);
    categoryId = cats.find((c) => c.name.toLowerCase() === String(p.category).toLowerCase())?.id;
  }

  const res = await createAppointment(
    userId,
    {
      clientName: p.clientName as string,
      clientPhone: typeof p.phone === "string" ? p.phone : undefined,
      clientEmail: typeof p.email === "string" ? p.email : undefined,
      categoryId,
      dateKey: p.dateKey as string,
      time: p.time as string,
      durationMinutes: typeof p.durationMinutes === "number" ? p.durationMinutes : undefined,
      message: typeof p.message === "string" ? p.message : undefined,
      reminderEmail: p.reminderEmail === true,
      reminderTelegram: p.reminderTelegram !== false,
      status: "CONFIRMED",
    },
    "VOICE",
  );

  if (res.ok) {
    await prisma.voiceCommandLog.update({
      where: { id: logId },
      data: { status: "CONFIRMED", appointmentId: res.id },
    });
    await sendMessage(chatId, `✅ Programare creată: ${res.clientName} la ${formatTime(res.startAt, tz)}.`, mainMenu());
  } else {
    await sendMessage(chatId, `❌ ${res.error}`, mainMenu());
  }
}
