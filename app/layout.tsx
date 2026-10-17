import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { AuthLink } from "@/app/auth/auth-link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Claude Impact Lab Hackathon",
  description: "Teams, submissions, and judging for the Claude Impact Lab Hackathon in Seattle.",
};

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/teams", label: "Teams" },
  { href: "/submit", label: "Submit" },
  { href: "/profile", label: "Profile" },
];

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentProfile();
  const isAdmin = profile?.platform_role === "admin";

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <nav className="border-b border-foreground/10">
          <ul className="mx-auto flex max-w-4xl flex-wrap gap-x-5 gap-y-2 px-4 py-3 text-sm font-medium">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
            {isAdmin && (
              <li>
                <Link href="/admin" className="hover:underline">
                  Admin
                </Link>
              </li>
            )}
            <li className="ml-auto">
              <AuthLink initialSignedIn={Boolean(profile)} />
            </li>
          </ul>
        </nav>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
