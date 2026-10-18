import { useSyncExternalStore } from "react";

// The current time, refreshed every 30 seconds, and null during server rendering and hydration
// so the server HTML never disagrees with the browser clock.
let snapshot = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (!timer) {
    timer = setInterval(() => {
      snapshot = Date.now();
      listeners.forEach((listener) => listener());
    }, 30_000);
  }
  return () => {
    listeners.delete(callback);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => snapshot || (snapshot = Date.now());
const getServerSnapshot = () => null;

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
