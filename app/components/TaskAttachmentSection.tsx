"use client";

import { useRef, useState } from "react";
import { addAttachmentAction, deleteAttachmentAction, type AttachmentRow } from "@/app/actions/tasks";
import { useToast } from "./toast";
import { IconTrash } from "./icons";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmt(d: string | Date) {
  return new Date(d).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
}

function fileIcon(mimeType: string | null, name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType?.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "🖼️";
  if (mimeType === "application/pdf" || ext === "pdf") return "📄";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["xls", "xlsx"].includes(ext)) return "📊";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  return "📎";
}

export default function TaskAttachmentSection({
  taskId,
  initialAttachments,
  currentUserId,
  canDelete,
  blobEnabled,
}: {
  taskId: string;
  initialAttachments: AttachmentRow[];
  currentUserId: string;
  canDelete: boolean;
  blobEnabled: boolean;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Fișierul depășește 20 MB");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await addAttachmentAction(taskId, fd);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.attachment) {
        setAttachments((a) => [...a, res.attachment!]);
        toast.success("Fișier încărcat");
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Ștergi atașamentul?")) return;
    const prev = attachments;
    setAttachments((a) => a.filter((x) => x.id !== id));
    const res = await deleteAttachmentAction(id, taskId);
    if (res.error) {
      toast.error(res.error);
      setAttachments(prev);
    } else {
      toast.success("Atașament șters");
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold">📎 Atașamente {attachments.length > 0 && `(${attachments.length})`}</h2>
        {blobEnabled ? (
          <label className="tap cursor-pointer rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-strong">
            {uploading ? "Se încarcă…" : "+ Adaugă"}
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        ) : (
          <span className="text-[11px] text-ink-soft">BLOB_READ_WRITE_TOKEN nedefinit</span>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-ink-soft">Niciun atașament.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] p-2.5">
              <span className="text-xl leading-none">{fileIcon(a.mimeType, a.name)}</span>
              <div className="min-w-0 flex-1">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium text-brand hover:underline"
                >
                  {a.name}
                </a>
                <p className="text-[11px] text-ink-soft">
                  {fmtSize(a.size)} · {a.userName} · {fmt(a.createdAt)}
                </p>
              </div>
              {(canDelete || a.userId === currentUserId) && (
                <button
                  onClick={() => handleDelete(a.id)}
                  className="tap grid size-7 shrink-0 place-items-center rounded-lg text-st-cancelled hover:bg-[var(--color-surface-2)]"
                  title="Șterge"
                >
                  <IconTrash className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
