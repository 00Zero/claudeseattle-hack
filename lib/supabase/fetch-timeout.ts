// fetch for the Supabase clients that gives up after `ms`, so a stalled database or Auth server
// fails the request quickly instead of holding it open until Vercel's 300-second limit (Oct 24,
// 5:53-6:01 pm: 342 requests waited the full 300 seconds). Keeps the caller's own abort signal.
export function fetchWithTimeout(ms: number): typeof fetch {
  return (input, init) => {
    // Older browsers (Safari before 16) lack AbortSignal.timeout: no timeout there.
    if (typeof AbortSignal.timeout !== "function") return fetch(input, init);
    const timeout = AbortSignal.timeout(ms);
    const signal =
      init?.signal && typeof AbortSignal.any === "function" ? AbortSignal.any([init.signal, timeout]) : (init?.signal ?? timeout);
    return fetch(input, { ...init, signal });
  };
}
