"use client";

import { useState, useTransition } from "react";
import { sendEmailReplyAction } from "@/app/actions/email-tickets";

type ThreadMessage = {
  id: string;
  direction: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  body: string;
  sentAt: string;
};

export default function EmailThread({
  taskId,
  messages,
  fromEmail,
  fromName,
  canReply,
}: {
  taskId: string;
  messages: ThreadMessage[];
  fromEmail: string;
  fromName: string | null;
  canReply: boolean;
}) {
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [localMessages, setLocalMessages] = useState<ThreadMessage[]>(messages);
  const [isPending, startTransition] = useTransition();

  function handleSend() {
    if (!reply.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await sendEmailReplyAction(taskId, reply);
      if (res.ok) {
        setLocalMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            direction: "OUTBOUND",
            fromEmail: "",
            fromName: "Tu",
            toEmail: fromEmail,
            body: reply,
            sentAt: new Date().toISOString(),
          },
        ]);
        setReply("");
        setSent(true);
        setTimeout(() => setSent(false), 3000);
      } else {
        setError(res.error ?? "Eroare la trimitere.");
      }
    });
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="card mb-3 p-4">
      <h2 className="mb-4 text-sm font-bold">
        📧 Conversație email
        <span className="ml-2 text-xs font-normal text-ink-soft">
          {fromName ? `${fromName} ` : ""}&lt;{fromEmail}&gt;
        </span>
      </h2>

      {localMessages.length === 0 ? (
        <p className="text-xs text-ink-soft">Niciun mesaj în conversație.</p>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {localMessages.map((m) => {
            const isIn = m.direction === "INBOUND";
            return (
              <div key={m.id} className={`flex ${isIn ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                    isIn
                      ? "bg-[var(--color-surface-2)] text-[var(--color-ink)]"
                      : "bg-[var(--color-accent)] text-white"
                  }`}
                >
                  <p className="font-semibold text-[11px] mb-1 opacity-70">
                    {isIn
                      ? (m.fromName || m.fromEmail)
                      : (m.fromName || "Echipa")}
                    {" · "}{fmtDate(m.sentAt)}
                  </p>
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canReply && (
        <div className="border-t border-[var(--color-line)] pt-3 mt-1">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Scrie un răspuns..."
            rows={3}
            className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
          {sent && <p className="mt-1 text-xs text-green-600">✓ Trimis cu succes.</p>}
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleSend}
              disabled={isPending || !reply.trim()}
              className="btn-primary text-sm px-4 py-1.5 disabled:opacity-50"
            >
              {isPending ? "Se trimite…" : "Trimite"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
