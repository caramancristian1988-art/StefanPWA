"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createTaskAction } from "@/app/actions/tasks";
import { quickCreateProject } from "@/app/actions/projects";
import { quickCreateClient } from "@/app/actions/clients";
import { useToast } from "./toast";
import { IconX, IconMic } from "./icons";

type Phase = "idle" | "rec" | "proc" | "err";
type Opt = { id: string; name: string };

type ParsedTask = {
  title?: string;
  type?: "TASK" | "TICKET";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate?: string;
  dueTime?: string;
  assigneeId?: string;
  teamId?: string;
  projectId?: string;
  newProjectName?: string;
  clientId?: string;
  newClientName?: string;
};

type DialogData = {
  transcript: string;
  parsed: ParsedTask;
  context: { users: Opt[]; teams: Opt[]; projects: Opt[]; clients: Opt[] };
};

const dlgInput =
  "h-11 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 text-sm outline-none focus:border-brand";

function TaskVoiceDialog({ data, onClose }: { data: DialogData; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { parsed, context } = data;

  const [title, setTitle] = useState(parsed.title ?? "");
  const [type, setType] = useState<"TASK" | "TICKET">(parsed.type ?? "TASK");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">(parsed.priority ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(parsed.dueDate ?? "");
  const [dueTime, setDueTime] = useState(parsed.dueTime ?? "");
  const [assigneeId, setAssigneeId] = useState(parsed.assigneeId ?? "");
  const [teamId, setTeamId] = useState(parsed.teamId ?? "");
  const [projectId, setProjectId] = useState(parsed.projectId ?? "");
  const [newProjectName, setNewProjectName] = useState(parsed.newProjectName ?? "");
  const [newClientName, setNewClientName] = useState(parsed.newClientName ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast.error("Titlul e obligatoriu."); return; }
    setSubmitting(true);
    try {
      // Create project if new
      let resolvedProjectId = projectId;
      if (!resolvedProjectId && newProjectName.trim()) {
        const res = await quickCreateProject(newProjectName.trim());
        if (!res.ok) { toast.error(`Proiect: ${res.error}`); setSubmitting(false); return; }
        resolvedProjectId = res.id;
        toast.success(`Proiect creat: ${res.name}`);
      }

      // Create client if new (standalone — se poate lega manual la proiect)
      if (newClientName.trim()) {
        const res = await quickCreateClient(newClientName.trim());
        if (res.ok) toast.success(`Client creat: ${res.name}`);
      }

      // Build FormData and submit
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("type", type);
      fd.append("priority", priority);
      if (dueDate) fd.append("dueDate", dueDate);
      if (dueTime) fd.append("dueTime", dueTime);
      if (assigneeId) fd.append("assigneeId", assigneeId);
      if (teamId) fd.append("teamId", teamId);
      if (resolvedProjectId) fd.append("projectId", resolvedProjectId);

      const result = await createTaskAction(undefined, fd);
      if (result?.error) { toast.error(result.error); setSubmitting(false); return; }
      toast.success("Task creat");
      router.refresh();
      onClose();
    } catch {
      toast.error("Eroare la creare. Încearcă din nou.");
      setSubmitting(false);
    }
  }

  const chip = (active: boolean) =>
    `tap rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
      active
        ? "bg-brand text-white border-brand"
        : "border-[var(--color-line)] text-ink-soft hover:border-brand/40"
    }`;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", padding: "16px" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card rounded-2xl p-5 shadow-2xl" style={{ width: "100%", maxWidth: "512px", maxHeight: "85vh", overflowY: "auto" }}>
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold">Confirmare task vocal</h2>
            {data.transcript && (
              <p className="mt-0.5 text-xs text-ink-soft">
                „{data.transcript.length > 90 ? `${data.transcript.slice(0, 90)}…` : data.transcript}"
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap grid size-9 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-[var(--color-surface-2)]"
            aria-label="Închide"
          >
            <IconX className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titlu *"
            required
            autoFocus
            className={dlgInput}
          />

          {/* Type */}
          <div className="flex flex-wrap gap-2">
            {(["TASK", "TICKET"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={chip(type === t)}>
                {t === "TASK" ? "Task" : "Tichet"}
              </button>
            ))}
          </div>

          {/* Priority */}
          <div className="flex flex-wrap gap-2">
            {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPriority(p)} className={chip(priority === p)}>
                {p === "LOW" ? "Scăzută" : p === "MEDIUM" ? "Medie" : p === "HIGH" ? "Ridicată" : "Urgentă"}
              </button>
            ))}
          </div>

          {/* Date + Time */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Scadent (opțional)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={dlgInput}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-soft">Ora</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className={dlgInput}
              />
            </div>
          </div>

          {/* Assignee + Team */}
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={dlgInput}>
              <option value="">Persoană…</option>
              {context.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={dlgInput}>
              <option value="">…sau echipă</option>
              {context.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          {/* Project */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-soft">Proiect</label>
            {newProjectName && !projectId ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate rounded-xl border border-brand/40 bg-brand/5 px-3 py-2.5 text-sm text-brand">
                  + Proiect nou: {newProjectName}
                </span>
                <button
                  type="button"
                  onClick={() => setNewProjectName("")}
                  className="tap h-11 shrink-0 rounded-xl border border-[var(--color-line)] px-3 text-xs text-ink-soft hover:bg-[var(--color-surface-2)]"
                >
                  Anulează
                </button>
              </div>
            ) : (
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={dlgInput}>
                <option value="">Fără proiect</option>
                {context.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>

          {/* New client notice */}
          {newClientName && (
            <div className="flex items-center justify-between rounded-xl border border-amber-300/40 bg-amber-50 px-3 py-2.5 text-xs dark:bg-amber-500/10">
              <span className="text-amber-800 dark:text-amber-300">
                + Client nou va fi creat: <strong>{newClientName}</strong>
              </span>
              <button
                type="button"
                onClick={() => setNewClientName("")}
                className="tap ml-2 shrink-0 text-ink-soft hover:text-ink"
              >
                Anulează
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="tap h-12 rounded-xl bg-brand font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
          >
            {submitting ? "Se creează…" : "Creează task"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function VoiceTaskButton() {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [dialogData, setDialogData] = useState<DialogData | null>(null);

  useEffect(() => setMounted(true), []);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    setErrMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await process(new Blob(chunksRef.current, { type: rec.mimeType }));
      };
      recRef.current = rec;
      rec.start();
      setPhase("rec");
    } catch {
      setPhase("err");
      setErrMsg("Nu am acces la microfon.");
    }
  }

  function stop() {
    recRef.current?.stop();
    setPhase("proc");
  }

  async function process(blob: Blob) {
    try {
      const fd = new FormData();
      fd.append("audio", blob, "voice.webm");
      const res = await fetch("/api/voice/task", { method: "POST", body: fd });
      const data = (await res.json()) as { error?: string } & Partial<DialogData>;
      if (!res.ok) throw new Error(data.error ?? "Eroare AI");
      setPhase("idle");
      setDialogData(data as DialogData);
    } catch (e) {
      setPhase("err");
      setErrMsg(e instanceof Error ? e.message : "Eroare");
    }
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={phase === "rec" ? stop : start}
          disabled={phase === "proc"}
          title={phase === "rec" ? "Oprește înregistrarea" : "Task/tichet prin voce"}
          aria-label="Task prin voce"
          className={`tap grid size-11 place-items-center rounded-xl ${
            phase === "rec"
              ? "animate-pulse bg-st-cancelled text-white"
              : "bg-[var(--color-surface-2)] text-ink hover:bg-brand-soft"
          }`}
        >
          {phase === "proc" ? (
            <span className="text-xs font-medium leading-none">…</span>
          ) : (
            <IconMic className="size-5" />
          )}
        </button>
        {phase === "err" && errMsg && (
          <span className="absolute right-0 top-12 z-30 w-52 rounded-lg bg-st-cancelled px-2.5 py-1.5 text-xs text-white shadow-lg">
            {errMsg}
          </span>
        )}
      </div>

      {dialogData && mounted && createPortal(
        <TaskVoiceDialog
          data={dialogData}
          onClose={() => {
            setDialogData(null);
            setPhase("idle");
          }}
        />,
        document.body
      )}
    </>
  );
}
