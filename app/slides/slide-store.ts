// Where the presenter is in each deck, kept in localStorage so leaving and re-entering picks up
// on the same slide. Also where to go back to when the presentation ends.
// Storage can throw (private windows, blocked site data); then the deck starts at the top.

const RETURN_KEY = "slides:return";
const EVENT = "slides:index";

export function readIndex(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function writeIndex(key: string, index: number) {
  try {
    localStorage.setItem(key, String(index));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeIndex(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function rememberReturnPath(path: string) {
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {}
}

export function readReturnPath(): string {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    return path && path.startsWith("/") && !path.startsWith("/slides") ? path : "/";
  } catch {
    return "/";
  }
}

// Full screen, with Safari's prefixed API as a fallback. Entering has to run inside the click
// handler (browsers only allow it from a user gesture); it fails quietly where unsupported (iPhone).
type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void };

export function isFullscreen() {
  const doc = document as FullscreenDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

export function enterFullscreen() {
  const root = document.documentElement as FullscreenElement;
  if (isFullscreen()) return;
  if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
  else root.webkitRequestFullscreen?.();
}

export function exitFullscreen() {
  const doc = document as FullscreenDocument;
  if (!isFullscreen()) return;
  if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
  else doc.webkitExitFullscreen?.();
}

export function subscribeFullscreen(callback: () => void) {
  document.addEventListener("fullscreenchange", callback);
  document.addEventListener("webkitfullscreenchange", callback);
  return () => {
    document.removeEventListener("fullscreenchange", callback);
    document.removeEventListener("webkitfullscreenchange", callback);
  };
}
