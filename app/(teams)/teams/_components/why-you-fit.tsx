import "server-only";
import { getMatchingProfiles } from "@/lib/matching";
import { blurbForViewer, type TeamContext } from "../_lib/ai";

const LABEL = { strong: "Strong fit", some: "Some fit", weak: "Not an obvious fit" } as const;

// "Why you'd fit" on a team page, for someone who could join it. Written by Claude in derived
// words only (see _lib/ai.ts). Rendered inside <Suspense>; shows nothing if unavailable.
export async function WhyYouFit({ team, viewerId }: { team: TeamContext; viewerId: string }) {
  const [viewer] = await getMatchingProfiles([viewerId]).catch(() => []);
  if (!viewer) return null;
  const blurb = await blurbForViewer(team, viewer);
  if (!blurb) return null;

  return (
    <section className="space-y-1 rounded-lg border border-accent/60 px-4 py-3" aria-label="Why you'd fit">
      <p className="text-sm font-medium">
        ✦ {LABEL[blurb.fit]} <span className="font-normal text-fg-muted">· from Claude, based on your profile</span>
      </p>
      <p className="text-sm">{blurb.text}</p>
    </section>
  );
}

export function WhyYouFitLoading() {
  return (
    <p className="rounded-lg border border-dashed border-line px-4 py-3 text-sm text-fg-muted" role="status">
      Claude is looking at how you&apos;d fit this team…
    </p>
  );
}
