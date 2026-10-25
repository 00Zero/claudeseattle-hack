"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import styles from "./slides.module.css";
import { enterFullscreen, exitFullscreen, isFullscreen, readIndex, readReturnPath, subscribeFullscreen, subscribeIndex, writeIndex } from "./slide-store";

export type Slide = { title: string; tone: "light" | "dark"; content: ReactNode };

// Slides are laid out on a fixed 1600×900 canvas and scaled to fit the screen, so they look the
// same on a laptop and a projector.
const WIDTH = 1600;
const HEIGHT = 900;

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp", "PageUp", "Backspace"]);

function subscribeResize(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}
const readViewport = () => `${window.innerWidth}x${window.innerHeight}`;

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function Deck({ slides }: { slides: Slide[] }) {
  const router = useRouter();
  const stored = useSyncExternalStore(subscribeIndex, readIndex, () => null);
  const viewport = useSyncExternalStore(subscribeResize, readViewport, () => null);
  const full = useSyncExternalStore(subscribeFullscreen, isFullscreen, () => false);
  const [controls, setControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wasFull = useRef(false);

  const last = slides.length - 1;
  const index = stored == null ? null : Math.min(stored, last);
  const slide = index == null ? null : slides[index];
  const [vw, vh] = viewport ? viewport.split("x").map(Number) : [WIDTH, HEIGHT];
  const scale = Math.min(vw / WIDTH, vh / HEIGHT);

  // Leaving full screen (Esc) ends the presentation; the slide stays saved for next time.
  useEffect(() => {
    if (full) wasFull.current = true;
    else if (wasFull.current) router.push(readReturnPath());
  }, [full, router]);

  useEffect(() => {
    const go = (delta: number) => writeIndex(Math.max(0, Math.min(last, Math.min(readIndex(), last) + delta)));
    function onKey(event: KeyboardEvent) {
      if (isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (NEXT_KEYS.has(event.key)) go(1);
      else if (PREV_KEYS.has(event.key)) go(-1);
      else if (event.key === "Home") writeIndex(0);
      else if (event.key === "End") writeIndex(last);
      else if (event.key === "f") (isFullscreen() ? exitFullscreen : enterFullscreen)();
      else if (event.key === "Escape") {
        if (isFullscreen()) exitFullscreen();
        else router.push(readReturnPath());
      } else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, router]);

  // No page scrollbars behind the deck.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    hideTimer.current = setTimeout(() => setControls(false), 2500);
    return () => {
      root.style.overflow = previous;
      clearTimeout(hideTimer.current);
    };
  }, []);

  function showControls() {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), 2500);
  }

  function go(to: number) {
    writeIndex(Math.max(0, Math.min(last, to)));
  }

  function end() {
    if (isFullscreen()) exitFullscreen();
    else router.push(readReturnPath());
  }

  // A click on the slide moves on (the left quarter goes back), except on links, buttons, and the site preview.
  function onCanvasClick(event: MouseEvent) {
    if (index == null || (event.target as HTMLElement).closest("a, button, iframe, input, [data-no-advance]")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    go(event.clientX - rect.left < rect.width / 4 ? index - 1 : index + 1);
  }

  const tone = slide?.tone === "dark" ? styles.dark : styles.light;

  return (
    <div
      className={`${tone} fixed inset-0 z-[100] overflow-hidden bg-bg text-fg ${controls ? "" : "cursor-none"}`}
      onMouseMove={showControls}
      role="region"
      aria-roledescription="slide deck"
      aria-label="Kickoff slides"
    >
      {slide && index != null && (
        <div
          className="absolute left-1/2 top-1/2 origin-center"
          style={{ width: WIDTH, height: HEIGHT, transform: `translate(-50%, -50%) scale(${scale})` }}
          onClick={onCanvasClick}
        >
          <div className="absolute inset-x-0 top-0 h-1.5 bg-line">
            <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
          </div>
          <div key={index} className={`${styles.enter} absolute inset-0 px-24 pb-24 pt-20`} aria-live="polite">
            {slide.content}
          </div>
          <div className="absolute inset-x-24 bottom-9 flex items-center justify-between font-mono text-lg text-fg-faint">
            <span>
              <span className="text-accent">⏺</span> claude seattle <span className="opacity-70">~/impact-lab</span>
            </span>
            <span className="tabular-nums">
              {index + 1} / {slides.length}
            </span>
          </div>
        </div>
      )}

      {/* Mouse controls; they fade when the mouse rests. Keys: arrows, space, PageUp/PageDown (clickers), F, Esc. */}
      <div
        className={`absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-bg-raised/95 p-1 font-mono text-sm shadow-lg transition-opacity duration-300 ${controls ? "opacity-100" : "pointer-events-none opacity-0"}`}
      >
        <button type="button" onClick={() => index != null && go(index - 1)} disabled={!index} className="rounded-full px-3 py-1.5 hover:bg-fg/5 disabled:opacity-30" aria-label="Previous slide">
          ←
        </button>
        <span className="min-w-28 px-2 text-center text-fg-muted">{slide ? slide.title : ""}</span>
        <button type="button" onClick={() => index != null && go(index + 1)} disabled={index === last} className="rounded-full px-3 py-1.5 hover:bg-fg/5 disabled:opacity-30" aria-label="Next slide">
          →
        </button>
        {!full && (
          <button type="button" onClick={enterFullscreen} className="rounded-full px-3 py-1.5 hover:bg-fg/5" aria-label="Full screen">
            ⛶
          </button>
        )}
        <button type="button" onClick={end} className="rounded-full px-3 py-1.5 hover:bg-fg/5" aria-label="End the presentation">
          ✕
        </button>
      </div>
    </div>
  );
}
