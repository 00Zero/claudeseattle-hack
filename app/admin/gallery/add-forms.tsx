"use client";

import { useActionState, useState } from "react";
import { addPhotographer, addUploads, type FormState } from "./actions";

export type PickableUpload = { id: string; kind: "photo" | "video"; thumb: string; view: string; who: string; when: string };

const input = "w-full rounded border border-foreground/20 bg-transparent px-2 py-1 text-sm";
const button = "rounded border border-foreground/20 px-3 py-1 text-sm hover:bg-foreground/5 disabled:cursor-wait disabled:opacity-40";

function Where() {
  return (
    <label className="flex items-center gap-2 text-sm">
      Put them at the
      <select name="where" defaultValue="end" className="rounded border border-foreground/20 bg-transparent px-1 py-0.5">
        <option value="end">end</option>
        <option value="start">start</option>
      </select>
    </label>
  );
}

function Message({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-evergreen" : "text-red-600"}`}>
      {state.message}
    </p>
  );
}

// Opens an item in a new tab: uploads in Drive (for accounts that can see the folder), a
// photographer's photo on their site.
export function openItem(href: string) {
  window.open(href, "_blank", "noreferrer");
}

export function ViewLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" draggable={false} className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white no-underline hover:bg-black/80">
      View
    </a>
  );
}

// A preview from the admin thumbnail route, or the kind of file if Drive has none yet.
export function Preview({ src, kind }: { src: string; kind: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) {
    return <span className="grid h-full w-full place-items-center text-xs text-foreground/50">{kind === "video" ? "Video" : "Photo"}</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element -- Drive previews, served by Google or the admin route
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />;
}

export function UploadPicker({ uploads }: { uploads: PickableUpload[] }) {
  const [state, action, pending] = useActionState(addUploads, null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  if (uploads.length === 0) return <p className="text-sm text-foreground/70">Every upload is in the gallery.</p>;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={action} onSubmit={() => setChecked(new Set())} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || checked.size === 0} className={button}>
          {pending ? "Sharing and adding…" : `Add ${checked.size || ""} to the gallery`}
        </button>
        <Where />
        <button type="button" onClick={() => setChecked(checked.size === uploads.length ? new Set() : new Set(uploads.map((u) => u.id)))} className="text-sm underline">
          {checked.size === uploads.length ? "Uncheck all" : "Check all"}
        </button>
        <Message state={state} />
      </div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {uploads.map((u) => (
          <li key={u.id}>
            <label className={`block cursor-pointer overflow-hidden rounded border-2 ${checked.has(u.id) ? "border-accent" : "border-transparent"}`}>
              <span className="relative block aspect-square bg-foreground/5" onDoubleClick={() => openItem(u.view)}>
                <Preview src={u.thumb} kind={u.kind} />
                <input type="checkbox" name="upload" value={u.id} checked={checked.has(u.id)} onChange={() => toggle(u.id)} className="absolute left-1.5 top-1.5 h-4 w-4" />
                <ViewLink href={u.view} />
                {u.kind === "video" && <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">▶ video</span>}
              </span>
              <span className="block truncate px-1 pt-1 text-xs" title={u.who}>
                {u.who}
              </span>
              <span className="block truncate px-1 pb-1 text-[11px] text-foreground/60">{u.when}</span>
            </label>
          </li>
        ))}
      </ul>
    </form>
  );
}

export function AddPhotographer({ credits }: { credits: string[] }) {
  const [state, action, pending] = useActionState(addPhotographer, null);
  return (
    <form action={action} className="grid max-w-2xl gap-3">
      <label className="space-y-1 text-sm">
        <span>Photographer&apos;s name (the section is &ldquo;Photos by&rdquo; this name)</span>
        <input name="credit" required maxLength={100} list="gallery-credits" className={input} placeholder="Jane Doe Photography" />
      </label>
      <label className="space-y-1 text-sm">
        <span>Link to their gallery, for lines without their own link (optional)</span>
        <input name="link" type="url" className={input} placeholder="https://janedoe.example.com/claude-impact-lab" />
      </label>
      <label className="space-y-1 text-sm">
        <span>
          One photo per line: the thumbnail image link, then (optional) the link to that photo on their site, then (optional) a larger
          image for the carousel, separated by spaces.
        </span>
        <textarea
          name="thumbnails"
          required
          rows={6}
          className={`${input} font-mono text-xs`}
          placeholder={"https://janedoe.example.com/thumbs/001.jpg https://janedoe.example.com/photo/001 https://janedoe.example.com/large/001.jpg\nhttps://janedoe.example.com/thumbs/002.jpg"}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={button}>
          {pending ? "Adding…" : "Add photos"}
        </button>
        <Where />
        <Message state={state} />
      </div>
      <datalist id="gallery-credits">
        {credits.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </form>
  );
}
