"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  carouselItems,
  driveDownload,
  driveImage,
  drivePlayer,
  galleryHome,
  gallerySections,
  itemHref,
  opensInViewer,
  youtubePlayer,
  youtubeThumbnail,
  type GalleryItem,
} from "@/lib/gallery";
import styles from "./gallery.module.css";

// How long the hand-off animation runs before a photographer's site opens. Browsers let a click
// open a new tab for about a second afterwards (Safari is the strictest), so keep it under that.
const REDIRECT_MS = 800;
// How long each highlight stays up in the carousel.
const ROTATE_MS = 6000;

const ALT = "Claude Impact Lab hackathon, Seattle";

// The carousel of highlights, then the sections: videos (medium 16:9 tiles), each photographer's
// photos and audience photos (small square tiles). Clicking a photo or video opens the viewer; a
// photographer's photo plays the hand-off and opens it on their site in a new tab. Each tile is a
// real link, so a middle-click or a new tab works too. Audience photos always show, with an upload
// button (uploadHref: the uploader on /resources, through /login when signed out).
export function Gallery({ items, uploadHref }: { items: GalleryItem[]; uploadHref: string }) {
  const sections = gallerySections(items);
  if (!sections.some((s) => s.key === "photo")) sections.push({ key: "photo", title: "Audience photos", credit: null, items: [] });
  // The viewer steps through the uploads of one kind, in page order.
  const viewable = sections.flatMap((s) => s.items).filter(opensInViewer);
  const highlights = carouselItems(items);
  const [onClick, overlays] = useOpeners(viewable);

  return (
    <>
      <div className="space-y-12">
        {highlights.length > 0 && <Carousel items={highlights} onClick={onClick} />}
        {sections.map((section) => {
          const home = section.credit ? galleryHome(section.items[0].link_url) : null;
          return (
            <section key={section.key} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h2 className="font-display text-3xl font-light">{section.title}</h2>
                {home && (
                  <a href={home} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm">
                    Download them all at {host(home)} <NewTabIcon className="h-3.5 w-3.5" />
                  </a>
                )}
                {section.key === "photo" && <UploadButton href={uploadHref} />}
              </div>
              {section.items.length === 0 ? (
                <p className="text-fg-muted">No audience photos yet. Were you there? Add yours.</p>
              ) : (
                <ul className={`grid gap-2 ${section.key === "video" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"}`}>
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <Tile item={item} onClick={(e) => onClick(e, item)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {overlays}
    </>
  );
}

// The carousel on its own (the home page, after the event). Clicks do what they do on /gallery;
// the viewer steps through the highlighted uploads.
export function Highlights({ items }: { items: GalleryItem[] }) {
  const [onClick, overlays] = useOpeners(items.filter(opensInViewer));
  return (
    <>
      <Carousel items={items} onClick={onClick} />
      {overlays}
    </>
  );
}

// What a click on a tile or slide does: an upload opens the viewer, stepping through the `viewable`
// items of its kind, and a photographer's photo plays the hand-off. Modified clicks fall through to
// the link.
function useOpeners(viewable: GalleryItem[]) {
  const [open, setOpen] = useState<{ kind: GalleryItem["kind"]; index: number } | null>(null);
  const [leaving, setLeaving] = useState<GalleryItem | null>(null);
  const items = open ? viewable.filter((i) => i.kind === open.kind) : [];

  function onClick(event: React.MouseEvent, item: GalleryItem) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (item.kind === "external") return setLeaving(item);
    setOpen({ kind: item.kind, index: viewable.filter((i) => i.kind === item.kind).indexOf(item) });
  }

  const overlays = (
    <>
      {open && items[open.index] && <Viewer items={items} index={open.index} onIndex={(index) => setOpen({ ...open, index })} onClose={() => setOpen(null)} />}
      {leaving && <Handoff item={leaving} onClose={() => setLeaving(null)} />}
    </>
  );
  return [onClick, overlays] as const;
}

// To the photo and video uploader on /resources (approved attendees; sign-in first if needed).
export function UploadButton({ href }: { href: string }) {
  return (
    <Link href={href} prefetch={false} className="btn">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
      </svg>
      Upload your photos and videos
    </Link>
  );
}

function thumbnailSrc(item: GalleryItem) {
  if (item.youtube_id) return youtubeThumbnail(item.youtube_id);
  if (item.kind === "external") return item.thumbnail_url ?? "";
  return driveImage(item.drive_file_id ?? "", item.kind === "video" ? 960 : 480);
}

function slideSrc(item: GalleryItem) {
  if (item.youtube_id) return youtubeThumbnail(item.youtube_id);
  if (item.kind === "external") return item.image_url ?? item.thumbnail_url ?? "";
  return driveImage(item.drive_file_id ?? "", 1600);
}

function label(item: GalleryItem) {
  return (
    item.caption ??
    (item.kind === "video" ? "Play video" : item.kind === "photo" ? "View photo" : `Photo by ${item.credit ?? "the photographer"} (opens their site in a new tab)`)
  );
}

function PlayButton({ big = false }: { big?: boolean }) {
  return (
    <span className="absolute inset-0 grid place-items-center">
      <span
        className={`grid place-items-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/30 transition group-hover:scale-110 group-hover:bg-accent ${big ? "h-20 w-20" : "h-14 w-14"}`}
      >
        <svg viewBox="0 0 24 24" className={`ml-1 ${big ? "h-9 w-9" : "h-6 w-6"}`} fill="currentColor" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </span>
  );
}

// The highlights, one at a time, crossfading every few seconds with a slow zoom. It pauses while
// the pointer or focus is on it, and doesn't move on its own for people who reduce motion. Only the
// current slide and its neighbours load their image.
function Carousel({ items, onClick }: { items: GalleryItem[]; onClick: (e: React.MouseEvent, item: GalleryItem) => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<number | null>(null);
  const count = items.length;
  const go = useCallback((by: number) => setIndex((i) => (i + by + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => {
      if (!document.hidden) go(1);
    }, ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, count, go]);

  const near = (i: number) => i === index || i === (index + 1) % count || i === (index - 1 + count) % count;
  const control = "grid h-10 w-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/70";

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Highlights"
      className="relative aspect-[4/3] overflow-hidden rounded-xl bg-bg-sunken sm:aspect-video"
      style={{ "--rotate-ms": `${ROTATE_MS}ms` } as React.CSSProperties}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touch.current ?? e.changedTouches[0].clientX);
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touch.current = null;
      }}
    >
      {items.map((item, i) => {
        const current = i === index;
        const caption = item.caption ?? (item.kind === "external" ? `Photo by ${item.credit}` : item.kind === "video" ? "Video" : null);
        return (
          <a
            key={item.id}
            href={itemHref(item)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => onClick(e, item)}
            aria-label={label(item)}
            aria-hidden={!current}
            tabIndex={current ? 0 : -1}
            className={`group absolute inset-0 block no-underline transition-opacity duration-700 ${current ? "z-10 opacity-100" : "pointer-events-none opacity-0"}`}
          >
            {near(i) && (
              // eslint-disable-next-line @next/next/no-img-element -- Google and photographers' sites serve these
              <img
                src={slideSrc(item)}
                alt={item.caption ?? ALT}
                referrerPolicy="no-referrer"
                className={`h-full w-full object-cover ${current ? styles.kenburns : ""}`}
              />
            )}
            {item.kind === "video" && <PlayButton big />}
            {caption && (
              <span className="absolute inset-x-0 bottom-0 flex items-end gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-4 pb-10 pt-12 text-sm text-white sm:text-base">
                {item.kind === "external" && <NewTabIcon className="mb-0.5 h-4 w-4 shrink-0" />}
                <span className="truncate">{caption}</span>
              </span>
            )}
          </a>
        );
      })}
      {count > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="Previous highlight" className={`${control} absolute left-3 top-1/2 z-20 -translate-y-1/2`}>
            ←
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Next highlight" className={`${control} absolute right-3 top-1/2 z-20 -translate-y-1/2`}>
            →
          </button>
          <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center gap-1.5">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Highlight ${i + 1} of ${count}`}
                aria-current={i === index}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ item, onClick }: { item: GalleryItem; onClick: (e: React.MouseEvent) => void }) {
  return (
    <a
      href={itemHref(item)}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      aria-label={label(item)}
      title={item.caption ?? undefined}
      className={`group relative block overflow-hidden rounded-md bg-bg-sunken no-underline ${item.kind === "video" ? "aspect-video" : "aspect-square"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Google and photographers' sites serve these; next/image would proxy them through Vercel. */}
      <img
        src={thumbnailSrc(item)}
        alt={item.caption ?? ALT}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] group-hover:brightness-105"
      />
      {item.kind === "video" && <PlayButton />}
      {item.kind === "external" && (
        <span className="absolute inset-x-1.5 bottom-1.5 flex items-center gap-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
          <NewTabIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{item.credit ?? "Photographer"}</span>
        </span>
      )}
    </a>
  );
}

function NewTabIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

// Locks the page's scroll and closes on Escape while an overlay is open; puts focus back after.
function useOverlay(onClose: () => void, onKey?: (e: KeyboardEvent) => void) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    first.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else onKey?.(e);
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose, onKey]);
  return first;
}

const overlayButton = "rounded-full bg-white/10 px-3 py-1.5 text-sm text-white no-underline hover:bg-white/20";

// The full-size viewer for items of one kind: the photo with a download, or the video. Videos get a
// film strip and a Next button, and when one ends the next plays, until they've all played once.
// A phone on its side gives the height to the video: the strip goes, and the arrows sit beside it.
function Viewer({ items, index, onIndex, onClose }: { items: GalleryItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const item = items[index];
  const fileId = item.drive_file_id ?? "";
  const isVideo = item.kind === "video";
  // Where this run of videos began; choosing a video starts a new run.
  const startedAt = useRef(index);
  const pick = useCallback(
    (i: number) => {
      startedAt.current = i;
      onIndex(i);
    },
    [onIndex],
  );
  const step = useCallback((by: number) => pick((index + by + items.length) % items.length), [index, items.length, pick]);
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    },
    [step],
  );
  const first = useOverlay(onClose, onKey);

  function playNext() {
    const next = (index + 1) % items.length;
    if (next !== startedAt.current) onIndex(next);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isVideo ? "Video" : "Photo"}
      className={`fixed inset-0 z-50 flex flex-col bg-black/90 p-3 text-white backdrop-blur-sm lg:p-6 ${styles.fade}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto font-mono text-xs text-white/70">
          {isVideo ? "Video" : "Photo"} {index + 1} of {items.length}
        </p>
        {!isVideo && (
          <a href={driveDownload(fileId)} className={overlayButton}>
            Download
          </a>
        )}
        <a href={itemHref(item)} target="_blank" rel="noreferrer" className={`${overlayButton} inline-flex items-center gap-1.5`}>
          Original <NewTabIcon className="h-3.5 w-3.5" />
        </a>
        <button ref={first} type="button" onClick={onClose} className={overlayButton} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-2 py-2 lg:py-3" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {items.length > 1 && (
          <button type="button" onClick={() => step(-1)} aria-label="Previous" className={`${overlayButton} hidden shrink-0 landscape:block sm:block`}>
            ←
          </button>
        )}
        <div key={isVideo ? "video" : item.id} className={`mx-auto h-full w-full min-w-0 max-w-6xl ${styles.zoom}`}>
          {isVideo ? <Video item={item} onEnded={playNext} /> : <Photo fileId={fileId} />}
        </div>
        {items.length > 1 && (
          <button type="button" onClick={() => step(1)} aria-label="Next" className={`${overlayButton} hidden shrink-0 landscape:block sm:block`}>
            →
          </button>
        )}
      </div>

      {isVideo ? (
        <FilmStrip items={items} index={index} onIndex={pick} />
      ) : (
        <div className="flex items-center justify-between gap-3">
          {items.length > 1 ? (
            <button type="button" onClick={() => step(-1)} className={`${overlayButton} landscape:hidden sm:hidden`}>
              ← Prev
            </button>
          ) : (
            <span />
          )}
          <p className="min-w-0 truncate text-center text-sm text-white/80">{item.caption}</p>
          {items.length > 1 ? (
            <button type="button" onClick={() => step(1)} className={`${overlayButton} landscape:hidden sm:hidden`}>
              Next →
            </button>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}

// Every video as a small tile, with the current one marked, and a Next button that wraps to the
// first after the last. Tiles have a set width and height: with only an aspect ratio, Safari left
// gaps between them and didn't scroll the current one into view.
function FilmStrip({ items, index, onIndex }: { items: GalleryItem[]; index: number; onIndex: (i: number) => void }) {
  const current = useRef<HTMLLIElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index]);

  return (
    <div className="space-y-2 max-lg:landscape:hidden">
      {items[index].caption && <p className="truncate text-center text-sm text-white/80">{items[index].caption}</p>}
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
        <ol className="flex w-full min-w-0 gap-2 overflow-x-auto p-0.5 sm:w-auto sm:flex-1">
          {items.map((video, i) => (
            <li key={video.id} ref={i === index ? current : null} className="shrink-0">
              <button
                type="button"
                onClick={() => onIndex(i)}
                aria-label={`Video ${i + 1} of ${items.length}${video.caption ? `: ${video.caption}` : ""}`}
                aria-current={i === index}
                className={`relative block h-12 w-20 overflow-hidden rounded ring-2 transition sm:h-16 sm:w-28 ${i === index ? "ring-accent" : "opacity-60 ring-transparent hover:opacity-100"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- served by Google */}
                <img src={video.youtube_id ? youtubeThumbnail(video.youtube_id) : driveImage(video.drive_file_id ?? "", 240)} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 font-mono text-[10px] text-white">{i === index ? "Now" : i + 1}</span>
              </button>
            </li>
          ))}
        </ol>
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => onIndex((index - 1 + items.length) % items.length)} className={`${overlayButton} flex-1 py-2.5 sm:hidden`}>
              ← Previous
            </button>
            <button type="button" onClick={() => onIndex((index + 1) % items.length)} className="btn flex-1 justify-center sm:flex-none">
              Next video →
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// The thumbnail already on the page shows at once; the full-size photo fades in over it (if it
// can't load, the thumbnail stays).
function Photo({ fileId }: { fileId: string }) {
  const [loaded, setLoaded] = useState<boolean | "failed">(false);
  return (
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element -- served by Google */}
      <img src={driveImage(fileId, 480)} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain blur-[2px]" />
      {/* eslint-disable-next-line @next/next/no-img-element -- served by Google */}
      <img
        src={driveImage(fileId, 2000)}
        alt="Event photo"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded("failed")}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${loaded === true ? "opacity-100" : "opacity-0"}`}
      />
      {loaded === false && (
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 font-mono text-xs text-white/80">loading full size…</span>
      )}
    </div>
  );
}

function Video({ item, onEnded }: { item: GalleryItem; onEnded: () => void }) {
  if (item.youtube_id) return <YouTube id={item.youtube_id} title={item.caption ?? "Event video"} onEnded={onEnded} />;
  return <Embed src={drivePlayer(item.drive_file_id ?? "")} title={item.caption ?? "Event video"} />;
}

function Embed({ src, title }: { src: string; title: string }) {
  return <iframe src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="h-full w-full rounded-md bg-black" />;
}

type YouTubeApi = {
  playVideo(): void;
  mute(): void;
  unMute(): void;
  loadVideoById(id: string): void;
  getPlayerState(): number;
  destroy(): void;
};

declare global {
  interface Window {
    YT?: { Player: new (element: HTMLElement, options: object) => YouTubeApi };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApi: Promise<void> | null = null;

function loadYouTubeApi() {
  youtubeApi ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = reject;
    document.head.append(script);
  });
  return youtubeApi;
}

// YouTube's states; 0 is ended.
const STARTED = [1, 3];
// How long a video gets to start with sound before it starts muted.
const START_MS = 1200;

// YouTube's player, driven through its API so the page can start a video and hear when it ends. One
// player plays them all. iPhones won't let a page start a video with sound, so if it hasn't started
// after a moment it plays muted, with a button for the sound.
function YouTube({ id, title, onEnded }: { id: string; title: string; onEnded: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubeApi | null>(null);
  const ended = useRef(onEnded);
  const shown = useRef<string | null>(null);
  const timer = useRef(0);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    ended.current = onEnded;
  }, [onEnded]);

  const start = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const current = player.current;
      if (!current || STARTED.includes(current.getPlayerState())) return;
      current.mute();
      current.playVideo();
      setMuted(true);
    }, START_MS);
  }, []);

  useEffect(() => {
    if (!player.current || shown.current === id) return;
    shown.current = id;
    player.current.loadVideoById(id);
    start();
  }, [id, start]);

  useEffect(() => {
    const host = box.current;
    let gone = false;
    loadYouTubeApi()
      .then(() => {
        if (gone || !host || !window.YT) return;
        shown.current = id;
        player.current = new window.YT.Player(host.appendChild(document.createElement("div")), {
          host: "https://www.youtube-nocookie.com",
          videoId: id,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
          events: {
            onReady: () => {
              player.current?.playVideo();
              start();
            },
            onStateChange: (e: { data: number }) => {
              if (e.data === 0) ended.current();
            },
          },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      gone = true;
      window.clearTimeout(timer.current);
      player.current?.destroy();
      player.current = null;
      host?.replaceChildren();
    };
    // The first video only: later ones load into the same player, above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return <Embed src={youtubePlayer(id)} title={title} />;
  return (
    <div className="relative h-full w-full overflow-hidden rounded-md bg-black">
      <div ref={box} title={title} className="h-full w-full" />
      {muted && (
        <button
          type="button"
          onClick={() => {
            player.current?.unMute();
            setMuted(false);
          }}
          className={`${overlayButton} absolute left-2 top-2 bg-black/70`}
        >
          Tap for sound
        </button>
      )}
    </div>
  );
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// The hand-off to a photographer's site: the thumbnail lifts off toward a new-tab icon while a bar
// fills, then the site opens in a new tab and this says so (with a link if the browser blocked it).
function Handoff({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  const url = item.link_url ?? "";
  const [state, setState] = useState<"opening" | "opened" | "blocked">("opening");
  const first = useOverlay(onClose);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const tab = window.open(url, "_blank");
      if (tab) {
        tab.opener = null;
        setState("opened");
      } else {
        setState("blocked");
      }
    }, REDIRECT_MS);
    return () => window.clearTimeout(timer);
  }, [url]);

  useEffect(() => {
    if (state !== "opened") return;
    const timer = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(timer);
  }, [state, onClose]);

  const who = item.credit ?? "the photographer";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Opening ${who}'s site`}
      className={`fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm ${styles.fade}`}
      style={{ "--redirect-ms": `${REDIRECT_MS}ms` } as React.CSSProperties}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`w-full max-w-sm space-y-4 rounded-xl border border-line bg-bg-raised p-5 text-fg shadow-2xl ${styles.zoom}`}>
        <div className="relative mx-auto h-28 w-40">
          {/* eslint-disable-next-line @next/next/no-img-element -- the photographer's own thumbnail */}
          <img
            src={item.thumbnail_url ?? ""}
            alt=""
            referrerPolicy="no-referrer"
            className={`absolute inset-0 h-full w-full rounded-md object-cover shadow-md ${state === "opening" ? styles.launch : "opacity-0"}`}
          />
          <span className={`absolute -right-4 -top-4 grid h-10 w-10 place-items-center rounded-lg bg-accent text-accent-fg shadow-md ${styles.tab}`}>
            <NewTabIcon className="h-5 w-5" />
          </span>
        </div>
        <div aria-live="polite" className="space-y-1 text-center">
          <p className="font-medium">
            {state === "opening" && <>Taking you to {who}&apos;s photos…</>}
            {state === "opened" && <>Opened in a new tab</>}
            {state === "blocked" && <>Your browser blocked the new tab</>}
          </p>
          <p className="text-sm text-fg-muted">
            {state === "blocked" ? (
              <>Open it yourself:</>
            ) : (
              <>
                {host(url)} opens in a new tab, where you can download the photos. This gallery stays open here.
              </>
            )}
          </p>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-line">
          <div className={`h-full bg-accent ${styles.progress}`} />
        </div>
        <div className="flex flex-wrap justify-center gap-2 text-sm">
          {state !== "opening" && (
            <a href={url} target="_blank" rel="noreferrer" onClick={onClose} className="btn">
              {state === "blocked" ? `Go to ${host(url)}` : "Open it again"} <NewTabIcon className="h-3.5 w-3.5" />
            </a>
          )}
          <button ref={first} type="button" onClick={onClose} className="btn btn-ghost">
            {state === "opening" ? "Cancel" : "Back to the gallery"}
          </button>
        </div>
      </div>
    </div>
  );
}
