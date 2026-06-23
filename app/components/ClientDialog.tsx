"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createClient,
  updateClient,
  type ClientState,
} from "@/app/actions/clients";
import { IconX } from "./icons";

export type ClientEdit = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegramChatId: string | null;
  notes: string | null;
};

const input =
  "h-12 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

export default function ClientDialog({
  client,
  onClose,
}: {
  client: ClientEdit | null; // null = creare
  onClose: () => void;
}) {
  const router = useRouter();
  const action = client ? updateClient : createClient;
  const [state, formAction, pending] = useActionState<ClientState, FormData>(
    action,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card max-h-[92dvh] w-full max-w-md overflow-auto rounded-b-none rounded-t-2xl p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">
            {client ? "Editează client" : "Client nou"}
          </h2>
          <button onClick={onClose} className="tap grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-[var(--color-surface-2)]" aria-label="Închide">
            <IconX className="size-4" />
          </button>
        </div>

        <form action={formAction} className="flex flex-col gap-3">
          {client && <input type="hidden" name="id" value={client.id} />}
          <input name="name" defaultValue={client?.name ?? ""} placeholder="Nume *" required className={input} />
          <input name="phone" defaultValue={client?.phone ?? ""} placeholder="Telefon" inputMode="tel" className={input} />
          <input name="email" type="email" defaultValue={client?.email ?? ""} placeholder="Email" className={input} />
          <input name="telegramChatId" defaultValue={client?.telegramChatId ?? ""} placeholder="Telegram chat ID" className={input} />
          <textarea name="notes" defaultValue={client?.notes ?? ""} placeholder="Notițe" rows={3} className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-3 text-[15px] outline-none focus:border-brand" />

          {state?.error && <p className="text-sm text-st-cancelled">{state.error}</p>}

          <button type="submit" disabled={pending} className="tap h-12 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong disabled:opacity-60">
            {pending ? "Se salvează…" : "Salvează"}
          </button>
        </form>
      </div>
    </div>
  );
}
