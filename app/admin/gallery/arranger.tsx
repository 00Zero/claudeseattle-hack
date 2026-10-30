"use client";

import { useRef, useState, useTransition } from "react";
import { gallerySections } from "@/lib/gallery";
import { ConfirmButton } from "../email/confirm-button";
import { SubmitButton } from "../submit-button";
import { removeItem, saveOrder, setHighlighted, setVisible, updateItem } from "./actions";
import { Preview } from "./add-forms";

export type ArrangedItem = {
  id: string;
  kind: "photo" | "video" | "external";
  visible: boolean;
  highlighted: boolean;
  caption: string | null;
  credit: string | null;
  link_url: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  thumb: string;
  who: string;
  deleted: boolean;
};

const small = "rounded border border-foreground/20 px-1.5 py-0.5 text-xs hover:bg-foreground/5";
const input = "w-full rounded border border-foreground/20 bg-transparent px-1.5 py-0.5 text-xs";

function move<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// The gallery as the page shows it: videos, each photographer, then audience photos, as cards.
// Drag a card (or use its arrows) to move it within its section; the new order saves right away
// and also sets the carousel's order. Each card highlights, shows or hides, edits or removes its item.
export function Arranger({ items }: { items: ArrangedItem[] }) {
  const [order, setOrder] = useState(items);
  const [synced, setSynced] = useState(items);
  // Fresh items from the server (after any save or edit) replace the local order.
  if (items !== synced) {
    setSynced(items);
    setOrder(items);
  }
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dragging = useRef<string | null>(null);
  const before = useRef<string>("");
  const sections = gallerySections(order);

  // The full order after moving one item within its section.
  function reorder(key: string, from: number, to: number) {
    return sections.flatMap((s) => (s.key === key ? move(s.items, from, to) : s.items));
  }

  function save(next: ArrangedItem[]) {
    setOrder(next);
    setError(null);
    startSaving(async () => {
      try {
        await saveOrder(next.map((i) => i.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "The order didn't save.");
        setOrder(items);
      }
    });
  }

  if (order.length === 0) return <p className="text-sm text-foreground/70">The gallery is empty. Add uploads or a photographer&apos;s photos below.</p>;
  const highlighted = order.filter((i) => i.highlighted && i.visible && !i.deleted).length;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold">In the gallery</h2>
        <span className="text-sm text-foreground/70">★ {highlighted} in the carousel</span>
        <span role="status" className="text-xs text-foreground/60">
          {saving ? "Saving order…" : error ? <span className="text-red-600">{error}</span> : null}
        </span>
      </div>
      {sections.map((section) => (
        <div key={section.key} className="space-y-2">
          <h3 className="font-medium">
            {section.title} <span className="font-normal text-foreground/60">({section.items.length})</span>
          </h3>
          <ol className={`grid gap-3 ${section.key === "video" ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-5"}`}>
            {section.items.map((item, index) => {
              const last = section.items.length - 1;
              return (
                <li
                  key={item.id}
                  onDragEnter={() => {
                    const from = section.items.findIndex((i) => i.id === dragging.current);
                    if (from >= 0 && from !== index) setOrder(reorder(section.key, from, index));
                  }}
                  onDragOver={(e) => dragging.current && e.preventDefault()}
                  onDrop={(e) => e.preventDefault()}
                  className={`space-y-1.5 rounded border p-1.5 text-xs ${
                    item.visible && !item.deleted ? (item.highlighted ? "border-accent" : "border-foreground/15") : "border-dashed border-foreground/25 opacity-60"
                  }`}
                >
                  {/* The preview is the drag handle, so the fields below stay selectable. */}
                  <div
                    draggable
                    onDragStart={(e) => {
                      dragging.current = item.id;
                      before.current = order.map((i) => i.id).join();
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      dragging.current = null;
                      if (order.map((i) => i.id).join() !== before.current) save(order);
                    }}
                    className={`relative cursor-grab overflow-hidden rounded bg-foreground/5 active:cursor-grabbing ${item.kind === "video" ? "aspect-video" : "aspect-square"}`}
                  >
                    <Preview src={item.thumb} kind={item.kind} />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1 font-mono text-[10px] text-white">
                      {index + 1}
                      {item.highlighted ? " ★" : ""}
                    </span>
                    {(item.deleted || !item.visible) && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">{item.deleted ? "deleted by uploader" : "hidden"}</span>
                    )}
                  </div>
                  <p className="truncate" title={item.who}>
                    {item.who}
                  </p>
                  {item.caption && <p className="truncate text-foreground/70">“{item.caption}”</p>}
                  <div className="flex flex-wrap items-center gap-1">
                    <button type="button" className={small} title="Move to the start" disabled={index === 0} onClick={() => save(reorder(section.key, index, 0))}>
                      ⇤
                    </button>
                    <button type="button" className={small} title="Move earlier" disabled={index === 0} onClick={() => save(reorder(section.key, index, index - 1))}>
                      ←
                    </button>
                    <button type="button" className={small} title="Move later" disabled={index === last} onClick={() => save(reorder(section.key, index, index + 1))}>
                      →
                    </button>
                    <button type="button" className={small} title="Move to the end" disabled={index === last} onClick={() => save(reorder(section.key, index, last))}>
                      ⇥
                    </button>
                  </div>
                  {!item.deleted && (
                    <div className="flex flex-wrap items-center gap-1">
                      <form action={setHighlighted}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="highlighted" value={String(!item.highlighted)} />
                        <SubmitButton className={`${small} ${item.highlighted ? "border-accent text-accent" : ""}`} pendingText="…">
                          {item.highlighted ? "★ Highlighted" : "☆ Highlight"}
                        </SubmitButton>
                      </form>
                      <form action={setVisible}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="visible" value={String(!item.visible)} />
                        <SubmitButton className={small} pendingText="…">
                          {item.visible ? "Hide" : "Show"}
                        </SubmitButton>
                      </form>
                    </div>
                  )}
                  <details className="space-y-1">
                    <summary className="cursor-pointer text-foreground/70">Edit or remove</summary>
                    <form action={updateItem} className="space-y-1 pt-1">
                      <input type="hidden" name="id" value={item.id} />
                      <input name="caption" defaultValue={item.caption ?? ""} maxLength={200} placeholder="Caption (optional)" className={input} />
                      {item.kind === "external" && (
                        <>
                          <input name="credit" defaultValue={item.credit ?? ""} required maxLength={100} placeholder="Photographer" className={input} />
                          <input name="link_url" type="url" defaultValue={item.link_url ?? ""} required placeholder="Link to the photo" className={input} />
                          <input name="thumbnail_url" type="url" defaultValue={item.thumbnail_url ?? ""} required placeholder="Thumbnail" className={input} />
                          <input name="image_url" type="url" defaultValue={item.image_url ?? ""} placeholder="Larger image (optional)" className={input} />
                        </>
                      )}
                      <SubmitButton className={small}>Save</SubmitButton>
                    </form>
                    <form action={removeItem}>
                      <input type="hidden" name="id" value={item.id} />
                      <ConfirmButton
                        className={`${small} text-red-600`}
                        pendingText="Removing…"
                        confirm={item.kind === "external" ? "Remove this photo from the gallery?" : "Remove this from the gallery? Its Drive file goes back to private."}
                      >
                        Remove
                      </ConfirmButton>
                    </form>
                  </details>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
