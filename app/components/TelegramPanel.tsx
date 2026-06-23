"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWebhookAction, unlinkTelegram } from "@/app/actions/telegram";
import { IconSend } from "./icons";

export default function TelegramPanel({
  enabled,
  deepLink,
  startToken,
  botUsername,
  hasAccount,
}: {
  enabled: boolean;
  deepLink: string | null;
  startToken: string;
  botUsername: string | null;
  hasAccount: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>("");

  function doWebhook() {
    start(async () => {
      const res = await setWebhookAction();
      setMsg(res?.ok ? res.message ?? "Webhook setat." : res?.error ?? "Eroare");
      router.refresh();
    });
  }

  function doUnlink() {
    if (!confirm("Deconectezi Telegram?")) return;
    start(async () => {
      await unlinkTelegram();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!enabled && (
        <p className="rounded-xl bg-st-cancelled/10 px-4 py-3 text-sm text-st-cancelled">
          Botul nu este configurat. Setează <code>TELEGRAM_BOT_TOKEN</code> și{" "}
          <code>TELEGRAM_WEBHOOK_SECRET</code> în <code>.env</code>.
        </p>
      )}

      {enabled && !hasAccount && (
        <div className="card p-5">
          <h2 className="mb-1 text-base font-bold">Conectează Telegram</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Deschide botul și apasă Start. Contul tău se va lega automat.
          </p>
          {deepLink ? (
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="tap inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-semibold text-white hover:bg-brand-strong"
            >
              <IconSend className="size-4" /> Deschide @{botUsername}
            </a>
          ) : (
            <p className="rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              Trimite botului: <code>/start {startToken}</code>
            </p>
          )}
        </div>
      )}

      {enabled && hasAccount && (
        <button
          onClick={doUnlink}
          disabled={pending}
          className="tap h-11 rounded-xl border border-st-cancelled/40 font-medium text-st-cancelled hover:bg-st-cancelled/10"
        >
          Deconectează Telegram
        </button>
      )}

      {enabled && (
        <div className="card p-5">
          <h2 className="mb-1 text-base font-bold">Webhook</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Înregistrează webhook-ul ca botul să primească mesajele.
          </p>
          <button
            onClick={doWebhook}
            disabled={pending}
            className="tap h-11 rounded-xl bg-[var(--color-surface-2)] px-4 font-medium hover:bg-brand-soft disabled:opacity-60"
          >
            {pending ? "Se setează…" : "Setează webhook"}
          </button>
          {msg && <p className="mt-2 break-all text-xs text-ink-soft">{msg}</p>}
        </div>
      )}
    </div>
  );
}
