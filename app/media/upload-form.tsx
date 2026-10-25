"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recordMediaUpload, startMediaUpload } from "./actions";

type Item = { key: string; name: string; progress: number; status: "waiting" | "uploading" | "done" | "error"; message?: string };

const MAX_MB = 500;

// Sends one file straight to Google Drive with the one-time link from startMediaUpload, with
// progress (fetch can't report upload progress, XMLHttpRequest can). Resolves to the Drive file ID.
function sendToDrive(uploadUrl: string, file: File, onProgress: (fraction: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const id = JSON.parse(xhr.responseText).id;
        if (xhr.status >= 200 && xhr.status < 300 && id) return resolve(id);
      } catch {}
      reject(new Error(`upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("the connection dropped. Try again."));
    xhr.send(file);
  });
}

export function UploadForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((all) => all.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    const batch = files.map((file, i) => ({ file, key: `${Date.now()}-${i}` }));
    setItems((all) => [...batch.map(({ file, key }) => ({ key, name: file.name, progress: 0, status: "waiting" as const })), ...all]);

    // One at a time, so a phone on event wifi isn't splitting its upload across several files.
    for (const { file, key } of batch) {
      if (!/^(image|video)\//.test(file.type)) {
        update(key, { status: "error", message: "Only photos and videos." });
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        update(key, { status: "error", message: `Files must be under ${MAX_MB} MB.` });
        continue;
      }
      update(key, { status: "uploading" });
      try {
        const start = await startMediaUpload({ name: file.name, type: file.type, size: file.size });
        if (!start.ok) throw new Error(start.message);
        const fileId = await sendToDrive(start.uploadUrl, file, (progress) => update(key, { progress }));
        const recorded = await recordMediaUpload(fileId);
        if (!recorded.ok) throw new Error(recorded.message);
        update(key, { status: "done", progress: 1 });
      } catch (error) {
        update(key, { status: "error", message: error instanceof Error ? error.message : "Upload failed." });
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <label className="block cursor-pointer rounded border border-dashed border-line-strong p-6 text-center hover:bg-fg/5">
        <span className="btn">{busy ? "Uploading…" : "Choose photos or videos"}</span>
        <span className="mt-3 block text-sm text-fg-muted">Up to {MAX_MB} MB each. You can pick several at once.</span>
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          multiple
          disabled={busy}
          className="sr-only"
          onChange={(e) => upload(Array.from(e.target.files ?? []))}
        />
      </label>
      {busy && <p className="text-sm text-fg-muted">Keep this page open until your uploads finish.</p>}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="rounded border border-line p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="shrink-0 text-fg-muted">
                  {item.status === "done" ? "Uploaded ✓" : item.status === "error" ? "Failed" : item.status === "waiting" ? "Waiting" : `${Math.round(item.progress * 100)}%`}
                </span>
              </div>
              {item.status === "uploading" && (
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-fg/10">
                  <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                </div>
              )}
              {item.message && <p className="mt-1 text-fg-muted">{item.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
