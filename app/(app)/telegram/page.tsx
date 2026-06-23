import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getMe, signLinkToken } from "@/lib/telegram";
import { formatDate } from "@/lib/date";
import { getUserTimezone } from "@/lib/queries/settings";
import { DEMO } from "@/lib/demo";
import TelegramPanel from "@/app/components/TelegramPanel";
import { IconCalendar, IconCheckCircle, IconMic, IconSearch } from "@/app/components/icons";

export const dynamic = "force-dynamic";

export default async function TelegramPage() {
  const user = await requireUser();
  const enabled = env.telegram.enabled;

  const [botInfo, account, tz] = await Promise.all([
    enabled ? getMe() : Promise.resolve(null),
    DEMO
      ? Promise.resolve(null)
      : prisma.telegramAccount.findUnique({
          where: { userId: user.id },
          select: { username: true, firstName: true, linkedAt: true, chatId: true },
        }),
    getUserTimezone(user.id),
  ]);

  const token = DEMO ? "demo" : signLinkToken(user.id);
  const botUsername = botInfo?.username ?? null;
  const deepLink = botUsername ? `https://t.me/${botUsername}?start=${token}` : null;

  return (
    <div className="w-full">
      <div className="card mb-5 flex items-center gap-3 p-5">
        <div className="grid size-12 place-items-center rounded-xl bg-brand text-white">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 3 11 13M22 3l-7 18-4-8-8-4 19-6Z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold">Telegram Bot</h1>
          <p className="text-sm text-ink-soft">
            {account
              ? `Conectat${account.firstName ? ` ca ${account.firstName}` : ""} · din ${formatDate(account.linkedAt, tz)}`
              : enabled
                ? "Neconectat"
                : "Bot neconfigurat"}
          </p>
        </div>
      </div>

      <TelegramPanel
        enabled={enabled}
        deepLink={deepLink}
        startToken={token}
        botUsername={botUsername}
        hasAccount={Boolean(account)}
      />

      <div className="card mt-5 p-5 text-sm text-ink-soft">
        <p className="mb-3 font-semibold text-ink">Comenzi rapide în bot</p>
        <ul className="space-y-2.5">
          <li className="flex items-center gap-2.5">
            <IconCalendar className="size-4 shrink-0 text-brand" />
            Azi / Mâine / Săptămâna — listare programări
          </li>
          <li className="flex items-center gap-2.5">
            <IconCheckCircle className="size-4 shrink-0 text-brand" />
            Confirmă · Finalizat · Anulează — direct din buton
          </li>
          <li className="flex items-center gap-2.5">
            <IconMic className="size-4 shrink-0 text-brand" />
            Trimite un mesaj vocal pentru o programare cu confirmare
          </li>
          <li className="flex items-center gap-2.5">
            <IconSearch className="size-4 shrink-0 text-brand" />
            Scrie un nume pentru a căuta clientul
          </li>
        </ul>
      </div>
    </div>
  );
}
