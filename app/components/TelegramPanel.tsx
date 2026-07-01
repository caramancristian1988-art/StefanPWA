"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWebhookAction, unlinkTelegram, createInviteLink, deleteInviteLink } from "@/app/actions/telegram";
import { IconSend } from "./icons";

export default function TelegramPanel({
  enabled,
  deepLink,
  startToken,
  botUsername,
  hasAccount,
  canManageUsers = false,
  inviteToken: initialInviteToken = null,
}: {
  enabled: boolean;
  deepLink: string | null;
  startToken: string;
  botUsername: string | null;
  hasAccount: boolean;
  canManageUsers?: boolean;
  inviteToken?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>("");
  const [inviteToken, setInviteToken] = useState<string | null>(initialInviteToken);
  const [copied, setCopied] = useState(false);

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

  function doCreateInvite() {
    start(async () => {
      const res = await createInviteLink();
      if (res.ok && res.token) {
        setInviteToken(res.token);
      }
    });
  }

  function doDeleteInvite() {
    if (!confirm("Revoci link-ul? Toate link-urile existente vor deveni invalide.")) return;
    start(async () => {
      await deleteInviteLink();
      setInviteToken(null);
    });
  }

  function copyInviteLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const inviteLink = inviteToken && botUsername
    ? `https://t.me/${botUsername}?start=${inviteToken}`
    : null;

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

      {enabled && canManageUsers && (
        <div className="card p-5">
          <h2 className="mb-1 text-base font-bold">Link public de invitație</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Distribuie acest link lucrătorilor. Când îl accesează în Telegram, apar în lista
            „Utilizatori neatribuiți" și îi poți activa de acolo.
          </p>
          {inviteLink ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2.5">
                <span className="min-w-0 flex-1 break-all text-xs font-mono text-ink-soft">{inviteLink}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copyInviteLink}
                  disabled={pending}
                  className="tap h-10 flex-1 rounded-xl bg-brand text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
                >
                  {copied ? "Copiat!" : "Copiază link-ul"}
                </button>
                <button
                  onClick={doCreateInvite}
                  disabled={pending}
                  className="tap h-10 rounded-xl border border-[var(--color-line)] px-4 text-sm font-medium hover:bg-[var(--color-surface-2)] disabled:opacity-60"
                  title="Generează un link nou (revocă cel vechi)"
                >
                  Regenerează
                </button>
                <button
                  onClick={doDeleteInvite}
                  disabled={pending}
                  className="tap h-10 rounded-xl border border-st-cancelled/40 px-4 text-sm font-medium text-st-cancelled hover:bg-st-cancelled/10 disabled:opacity-60"
                  title="Revocă link-ul"
                >
                  Șterge
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={doCreateInvite}
              disabled={pending}
              className="tap h-11 rounded-xl bg-[var(--color-surface-2)] px-4 font-medium hover:bg-brand-soft disabled:opacity-60"
            >
              {pending ? "Se generează…" : "Creează link de invitație"}
            </button>
          )}
        </div>
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
