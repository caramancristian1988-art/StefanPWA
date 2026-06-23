import "server-only";
import { env } from "../env";
import { voiceParsedSchema, type VoiceParsed } from "../validation";
import { todayKey, tomorrowKey, addDaysToKey } from "../date";

const OPENAI = "https://api.openai.com/v1";

export class VoiceError extends Error {}

/** Transcrie audio cu Whisper (OpenAI-compatibil). */
export async function transcribeAudio(
  buffer: ArrayBuffer,
  filename: string,
  mime: string,
): Promise<string> {
  if (!env.ai.openaiApiKey) {
    throw new VoiceError("AI nu este configurat (lipsește OPENAI_API_KEY).");
  }
  const fd = new FormData();
  fd.append("file", new Blob([buffer], { type: mime || "audio/webm" }), filename);
  fd.append("model", env.ai.transcribeModel);
  fd.append("language", "ro");

  const res = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.ai.openaiApiKey}` },
    body: fd,
  });
  if (!res.ok) {
    throw new VoiceError(`Transcriere eșuată (${res.status}).`);
  }
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

function dateContext(tz: string): string {
  const t = todayKey(tz);
  const rows: string[] = [];
  for (let i = 0; i < 8; i++) {
    const key = addDaysToKey(t, i, tz);
    const [y, m, d] = key.split("-").map(Number);
    const label = new Intl.DateTimeFormat("ro-RO", { timeZone: tz, weekday: "long" }).format(
      new Date(Date.UTC(y, m - 1, d, 12)),
    );
    rows.push(`${label}=${key}`);
  }
  return rows.join(", ");
}

/** Extrage date structurate dintr-o comandă în limbaj natural. */
export async function parseCommand(
  transcript: string,
  tz: string,
): Promise<VoiceParsed> {
  if (!env.ai.openaiApiKey) {
    throw new VoiceError("AI nu este configurat (lipsește OPENAI_API_KEY).");
  }
  if (!transcript) return { intent: "unknown" };

  const system = [
    "Ești un asistent care extrage o programare dintr-o frază în limba română.",
    "Răspunde DOAR cu JSON valid, fără text suplimentar.",
    "Câmpuri: intent('create'|'reschedule'|'unknown'), clientName, phone, email, category, dateKey('YYYY-MM-DD'), time('HH:mm', 24h), durationMinutes(int), message, reminderEmail(bool), reminderTelegram(bool).",
    `Azi=${todayKey(tz)}, Mâine=${tomorrowKey(tz)}.`,
    `Zilele săptămânii: ${dateContext(tz)}.`,
    "Ore ambigue în context de business: 'la 3' => 15:00, 'la 9' dimineața => 09:00.",
    "Dacă lipsește un câmp, omite-l. Nu inventa clienți.",
  ].join("\n");

  const res = await fetch(`${OPENAI}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.ai.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.ai.parseModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: transcript },
      ],
    }),
  });
  if (!res.ok) throw new VoiceError(`Procesare AI eșuată (${res.status}).`);

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new VoiceError("Răspuns AI invalid.");
  }
  const parsed = voiceParsedSchema.safeParse(obj);
  return parsed.success ? parsed.data : { intent: "unknown" };
}

export async function transcribeAndParse(
  buffer: ArrayBuffer,
  filename: string,
  mime: string,
  tz: string,
): Promise<{ transcript: string; parsed: VoiceParsed }> {
  const transcript = await transcribeAudio(buffer, filename, mime);
  const parsed = await parseCommand(transcript, tz);
  return { transcript, parsed };
}
