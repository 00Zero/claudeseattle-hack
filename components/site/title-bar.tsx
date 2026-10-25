import Link from "next/link";
import { AuthLink } from "@/app/auth/auth-link";
import { MobileMenu } from "@/components/site/mobile-menu";
import { ThinkingDots } from "@/components/site/thinking-dots";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const pages = [
  { href: "/teams", label: "teams" },
  { href: "/submit", label: "submit" },
  { href: "/profile", label: "profile" },
];

// Signed-in people only; /resources itself checks approval.
const signedInPages = [{ href: "/resources", label: "resources" }];

// Judges and admins: where they score. /judge itself checks the role.
const judgePages = [{ href: "/judge", label: "judge" }];

// Everyone: /results shows only what the admin has published.
const publicPages = [{ href: "/results", label: "results" }];

// The site header, styled as a Claude Code title bar: thinking dots, a path, slash-command nav.
// Its links don't prefetch: every page view would otherwise render all of them on the server at
// once, and when the session's hour-long access token had expired those requests all tried to
// refresh it together (Supabase rejects the extras, so the header rendered signed out).
export function TitleBar({ signedIn, isAdmin, isJudge = false }: { signedIn: boolean; isAdmin: boolean; isJudge?: boolean }) {
  const visible = [...pages, ...(signedIn ? signedInPages : []), ...(isJudge || isAdmin ? judgePages : []), ...publicPages];
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 font-mono text-sm">
        <Link href="/" prefetch={false} className="flex shrink-0 items-center gap-2.5 whitespace-nowrap text-fg-muted no-underline">
          <ThinkingDots />
          <span>
            {/* The path only on wide screens: judges and admins have more links in the nav. */}
            <b className="font-medium text-fg">claude seattle</b> <span className="hidden xl:inline">~/impact-lab</span>
          </span>
        </Link>
        <nav aria-label="Pages" className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-1 gap-y-1 sm:gap-x-2">
          {visible.map((page) => (
            <Link key={page.href} href={page.href} prefetch={false} className="hidden rounded px-2 py-1 text-fg-muted hover:bg-fg/5 hover:text-fg sm:inline">
              <span className="text-accent">/</span>
              {page.label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" prefetch={false} className="hidden rounded px-2 py-1 text-fg-muted hover:bg-fg/5 hover:text-fg sm:inline">
              <span className="text-accent">/</span>admin
            </Link>
          )}
          <AuthLink initialSignedIn={signedIn} />
          {/* Phones: the page links above are hidden, so signed-in people get them (and /logout) in a menu. */}
          {signedIn && <MobileMenu pages={isAdmin ? [...visible, { href: "/admin", label: "admin" }] : visible} />}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
