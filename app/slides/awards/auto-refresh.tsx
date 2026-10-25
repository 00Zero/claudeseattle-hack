"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While a "waiting on judges" slide is up, re-read the results every few seconds, so the slide
// moves on by itself once the scores are in.
export function AutoRefresh({ every = 10_000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), every);
    return () => clearInterval(timer);
  }, [every, router]);
  return null;
}
