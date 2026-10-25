"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recordMediaUpload, startMediaUpload } from "./media-actions";

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
        // The file is in Drive at this point; a failed log only means it's missing from "Your uploads".
        const recorded = await recordMediaUpload(fileId);
        update(key, { status: "done", progress: 1, message: recorded.ok ? undefined : "It won't show under Your uploads." });
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
      <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted">
        <li>
          Tap <b className="text-fg">Select files</b> and pick one photo or video, or several at once (up to {MAX_MB} MB each).
        </li>
        <li>They start uploading right away. Each file gets its own progress bar; keep this page open until every file says Uploaded.</li>
      </ol>
      <label className="block cursor-pointer rounded border border-dashed border-line-strong p-6 text-center hover:bg-fg/5">
        <span className={`btn ${busy ? "opacity-60" : ""}`}>{busy ? "Uploading…" : "Select files"}</span>
        <span className="mt-3 block text-sm text-fg-muted">Photos and videos only</span>
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
      {items.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {items.map((item) => {
            const percent = item.status === "done" ? 100 : Math.round(item.progress * 100);
            return (
              <li key={item.key} className="rounded border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{item.name}</span>
                  <span className={`shrink-0 ${item.status === "error" ? "text-accent" : "text-fg-muted"}`}>
                    {item.status === "done" ? "Uploaded ✓" : item.status === "error" ? "Failed" : item.status === "waiting" ? "Waiting" : `${percent}%`}
                  </span>
                </div>
                {item.status !== "error" && (
                  <div
                    role="progressbar"
                    aria-label={`${item.name} upload`}
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="mt-2 h-1.5 overflow-hidden rounded bg-fg/10"
                  >
                    <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
                  </div>
                )}
                {item.message && <p className="mt-1 text-fg-muted">{item.message}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
