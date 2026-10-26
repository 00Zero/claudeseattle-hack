import { formatPacific } from "@/lib/time";
import { joinDescription } from "../_lib/description";
import { parseVideo } from "../_lib/video";

// One entry as judges and the public see it: video on top, then tagline, links, descriptions,
// roster. Shared by /judge/[id] and /entries/[id]; callers pass only fields they may show.

export type EntryDetailsData = {
  title: string;
  tagline: string | null;
  description_short: string | null;
  description_long: string | null;
  video_url: string | null;
  repo_url: string | null;
  links: { label: string; url: string }[] | null;
  // The team's shared "who did what" from before each member wrote their own part. Judges only;
  // public pages don't pass it.
  contributions?: string | null;
};

const PROVIDER_NAMES = { youtube: "YouTube", loom: "Loom", vimeo: "Vimeo", drive: "Google Drive" } as const;

// github and contribution ("who did what", one per member): judges only. contributionLateAt: when
// the part was saved, if that was after the deadline.
export type RosterMember = { name: string; detail?: string | null; github?: string | null; contribution?: string | null; contributionLateAt?: string | null };

// Links were checked on save, but render only http(s) anyway.
function safeHref(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-block break-all rounded-full border border-line-strong px-3 py-1 no-underline hover:border-accent">
      {children}
    </a>
  );
}

export function EntryDetails({ entry, roster }: { entry: EntryDetailsData; roster?: RosterMember[] }) {
  const video = entry.video_url ? parseVideo(entry.video_url) : null;
  const videoHref = safeHref(entry.video_url);
  const repoHref = safeHref(entry.repo_url);
  const links = (entry.links ?? []).map((l) => ({ ...l, href: safeHref(l.url) })).filter((l) => l.href);
  const description = joinDescription(entry.description_short, entry.description_long);

  return (
    <div className="space-y-5">
      {video ? (
        <div className="aspect-video w-full overflow-hidden rounded border border-line bg-bg-sunken">
          <iframe
            src={video.embedUrl}
            title={`Demo video: ${entry.title}`}
            className="h-full w-full"
            allow="fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        </div>
      ) : (
        <p className="rounded border border-line px-3 py-2 text-sm text-fg-muted">
          {videoHref ? (
            <>
              Video can&apos;t be embedded: <ExternalLink href={videoHref}>open it</ExternalLink>
            </>
          ) : (
            "No demo video."
          )}
        </p>
      )}

      {entry.tagline && <p className="max-w-[40ch] font-display text-2xl font-light leading-snug">{entry.tagline}</p>}

      <ul className="flex flex-wrap gap-2 font-mono text-xs">
        {repoHref ? (
          <li>
            <ExternalLink href={repoHref}>GitHub repo</ExternalLink>
          </li>
        ) : (
          <li className="rounded-full border border-dashed border-line px-3 py-1 text-fg-faint">No repo link</li>
        )}
        {videoHref && video && (
          <li>
            <ExternalLink href={videoHref}>Video on {PROVIDER_NAMES[video.provider]}</ExternalLink>
          </li>
        )}
        {links.map((l) => (
          <li key={l.href}>
            <ExternalLink href={l.href!}>{l.label}</ExternalLink>
          </li>
        ))}
      </ul>

      {description && <p className="whitespace-pre-wrap">{description}</p>}

      {roster && roster.length > 0 && (
        <div className="space-y-1">
          <h3 className="eyebrow">Team</h3>
          <ul className="space-y-2 text-sm text-fg-muted">
            {roster.map((m, i) => (
              <li key={i}>
                <span className="text-fg">{m.name}</span>
                {m.detail ? `, ${m.detail}` : ""}
                {m.github && (
                  <>
                    {" · "}
                    <a href={`https://github.com/${m.github}`} target="_blank" rel="noopener noreferrer nofollow" className="font-mono underline">
                      @{m.github}
                    </a>
                  </>
                )}
                {m.contribution?.trim() && <span className="block whitespace-pre-wrap">{m.contribution}</span>}
                {m.contributionLateAt && <span className="block text-xs text-clay">Saved after the deadline, {formatPacific(m.contributionLateAt)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.contributions && (
        <div className="space-y-1">
          <h3 className="eyebrow">Who did what</h3>
          <p className="whitespace-pre-wrap text-fg-muted">{entry.contributions}</p>
        </div>
      )}
    </div>
  );
}
