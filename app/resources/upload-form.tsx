"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mediaType } from "@/lib/media-types";
import { recordMediaUpload, startMediaUpload } from "./media-actions";

type Item = {
  key: string;
  name: string;
  progress: number;
  timeLeft?: string;
  status: "waiting" | "uploading" | "done" | "error";
  message?: string;
};

// Drive takes resumable uploads in pieces that are multiples of 256 KB. 8 MB pieces keep a
// dropped connection from costing more than a few seconds of upload.
const CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_RETRIES = 8;
// The time-left estimate shows once there's this much upload to go by and this much left.
const ESTIMATE_AFTER_MS = 3_000;
const ESTIMATE_OVER_S = 15;
const SPEED_WINDOW_MS = 10_000;

class UploadFailed extends Error {}

type PutResult = { status: number; range: string | null; body: string };

// One PUT to the upload link, with progress (fetch can't report upload progress, XMLHttpRequest can).
function put(url: string, body: Blob | null, contentRange: string, onProgress?: (loaded: number) => void) {
  return new Promise<PutResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Range", contentRange);
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, range: xhr.getResponseHeader("Range"), body: xhr.responseText });
    xhr.onerror = () => reject(new Error("connection dropped"));
    xhr.send(body);
  });
}

// Drive's "Range: bytes=0-N" says it has the first N+1 bytes.
function receivedBytes(range: string | null) {
  const match = range?.match(/bytes=0-(\d+)/);
  return match ? Number(match[1]) + 1 : 0;
}

function fileId(result: PutResult) {
  try {
    const id = JSON.parse(result.body).id;
    if (id) return id as string;
  } catch {}
  throw new UploadFailed("Drive didn't confirm the upload. Try again.");
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const backOnline = () =>
  navigator.onLine ? Promise.resolve() : new Promise((resolve) => window.addEventListener("online", resolve, { once: true }));

// Sends one file straight to Google Drive with the one-time link from startMediaUpload, piece by
// piece. When the connection drops it waits, asks Drive how much arrived, and carries on from
// there. Resolves to the Drive file ID.
async function sendToDrive(uploadUrl: string, file: File, onProgress: (sentBytes: number) => void) {
  let offset = 0;
  let failures = 0;
  for (;;) {
    const end = Math.min(offset + CHUNK_BYTES, file.size);
    try {
      const result = await put(uploadUrl, file.slice(offset, end), `bytes ${offset}-${end - 1}/${file.size}`, (loaded) =>
        onProgress(offset + loaded),
      );
      if (result.status === 200 || result.status === 201) return fileId(result);
      if (result.status === 308) {
        offset = receivedBytes(result.range);
        failures = 0;
        onProgress(offset);
        continue;
      }
      if (result.status === 404 || result.status === 410) throw new UploadFailed("The upload link expired. Select the file again.");
      if (result.status < 500) throw new UploadFailed(`Drive refused the upload (HTTP ${result.status}).`);
    } catch (error) {
      if (error instanceof UploadFailed) throw error;
    }
    // A dropped connection or a Drive hiccup: wait, then pick up from what Drive has.
    failures += 1;
    if (failures > MAX_RETRIES) throw new UploadFailed("The connection kept dropping. Try again on a steadier connection.");
    await wait(Math.min(1000 * 2 ** (failures - 1), 15_000));
    await backOnline();
    try {
      const status = await put(uploadUrl, null, `bytes */${file.size}`);
      if (status.status === 200 || status.status === 201) return fileId(status);
      if (status.status === 308) offset = receivedBytes(status.range);
      if (status.status === 404 || status.status === 410) throw new UploadFailed("The upload link expired. Select the file again.");
    } catch (error) {
      if (error instanceof UploadFailed) throw error;
    }
  }
}

function formatTimeLeft(seconds: number) {
  if (seconds < 60) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} sec left`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min left`;
  return `about ${Math.floor(minutes / 60)} hr ${minutes % 60} min left`;
}

// Turns progress events into a time-left label, from the upload speed over the last few seconds.
// Blank until the estimate has a few seconds to go by, and when 15 seconds or less are left.
function timeLeftTracker(size: number) {
  const started = Date.now();
  const samples: { at: number; bytes: number }[] = [];
  return (bytes: number) => {
    const now = Date.now();
    samples.push({ at: now, bytes });
    while (samples.length > 2 && now - samples[0].at > SPEED_WINDOW_MS) samples.shift();
    if (now - started < ESTIMATE_AFTER_MS) return undefined;
    const first = samples[0];
    const speed = (bytes - first.bytes) / ((now - first.at) / 1000);
    if (!(speed > 0)) return undefined;
    const seconds = (size - bytes) / speed;
    return seconds > ESTIMATE_OVER_S ? formatTimeLeft(seconds) : undefined;
  };
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
      const type = mediaType(file.name, file.type);
      if (!type) {
        update(key, { status: "error", message: "Only photos and videos." });
        continue;
      }
      update(key, { status: "uploading" });
      try {
        const start = await startMediaUpload({ name: file.name, type, size: file.size });
        if (!start.ok) throw new Error(start.message);
        const timeLeft = timeLeftTracker(file.size);
        const fileId = await sendToDrive(start.uploadUrl, file, (sent) =>
          update(key, { progress: sent / file.size, timeLeft: timeLeft(sent) }),
        );
        // The file is in Drive at this point; a failed log only means it's missing from "Your uploads".
        const recorded = await recordMediaUpload(fileId);
        update(key, { status: "done", progress: 1, timeLeft: undefined, message: recorded.ok ? undefined : "It won't show under Your uploads." });
      } catch (error) {
        update(key, { status: "error", timeLeft: undefined, message: error instanceof Error ? error.message : "Upload failed." });
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
          Tap <b className="text-fg">Select files</b> and pick one photo or video, or several at once.
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
                {item.status === "uploading" && item.timeLeft && <p className="mt-1 text-fg-muted">{item.timeLeft}</p>}
                {item.message && <p className="mt-1 text-fg-muted">{item.message}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
