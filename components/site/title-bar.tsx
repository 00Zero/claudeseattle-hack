import Link from "next/link";
import { AuthLink } from "@/app/auth/auth-link";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const pages = [
  { href: "/teams", label: "teams" },
  { href: "/submit", label: "submit" },
  { href: "/profile", label: "profile" },
];

// The site header, styled as a Claude Code title bar: traffic lights, a path, slash-command nav.
export function TitleBar({ signedIn, isAdmin }: { signedIn: boolean; isAdmin: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 font-mono text-sm">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="h-2.5 w-2.5 rounded-full bg-accent" />
          <i className="h-2.5 w-2.5 rounded-full bg-fg-faint/60" />
          <i className="h-2.5 w-2.5 rounded-full bg-fg-faint/60" />
        </span>
        <Link href="/" className="text-fg-muted no-underline">
          <b className="font-medium text-fg">claude</b> <span className="hidden sm:inline">~/seattle/impact-lab</span>
        </Link>
        <nav aria-label="Pages" className="ml-auto flex items-center gap-1 sm:gap-2">
          {pages.map((page) => (
            <Link key={page.href} href={page.href} className="hidden rounded px-2 py-1 text-fg-muted hover:bg-fg/5 hover:text-fg sm:inline">
              <span className="text-accent">/</span>
              {page.label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" className="hidden rounded px-2 py-1 text-fg-muted hover:bg-fg/5 hover:text-fg sm:inline">
              <span className="text-accent">/</span>admin
            </Link>
          )}
          <AuthLink initialSignedIn={signedIn} />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
