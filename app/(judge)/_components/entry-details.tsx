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
};

export type RosterMember = { name: string; detail?: string | null };

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
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">
      {children}
    </a>
  );
}

export function EntryDetails({ entry, roster }: { entry: EntryDetailsData; roster?: RosterMember[] }) {
  const video = entry.video_url ? parseVideo(entry.video_url) : null;
  const videoHref = safeHref(entry.video_url);
  const repoHref = safeHref(entry.repo_url);
  const links = (entry.links ?? []).map((l) => ({ ...l, href: safeHref(l.url) })).filter((l) => l.href);

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

      {entry.tagline && <p className="text-lg">{entry.tagline}</p>}

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {repoHref ? (
          <li>
            <ExternalLink href={repoHref}>GitHub repo</ExternalLink>
          </li>
        ) : (
          <li className="text-fg-muted">No repo link</li>
        )}
        {videoHref && video && (
          <li>
            <ExternalLink href={videoHref}>Video on {video.provider === "drive" ? "Google Drive" : video.provider[0].toUpperCase() + video.provider.slice(1)}</ExternalLink>
          </li>
        )}
        {links.map((l) => (
          <li key={l.href}>
            <ExternalLink href={l.href!}>{l.label}</ExternalLink>
          </li>
        ))}
      </ul>

      {entry.description_short && <p className="whitespace-pre-wrap">{entry.description_short}</p>}
      {entry.description_long && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">More detail</h3>
          <p className="whitespace-pre-wrap text-fg-muted">{entry.description_long}</p>
        </div>
      )}

      {roster && roster.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Team</h3>
          <ul className="text-sm text-fg-muted">
            {roster.map((m, i) => (
              <li key={i}>
                {m.name}
                {m.detail ? `, ${m.detail}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
