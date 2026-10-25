import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { FEEDBACK_MAX_LENGTH, getFeedbackSender } from "@/lib/feedback";
import { FeedbackButton } from "@/components/site/feedback-button";
import { TestAccountBanner } from "@/components/site/test-account-banner";
import { TitleBar } from "@/components/site/title-bar";
import { ThemeSync } from "@/components/theme/theme-sync";
import { THEME_BOOT_SCRIPT } from "@/components/theme/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display serif, standing in for the event kit's Anthropic Serif Display Light until it is self-hosted.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Claude Impact Lab Hackathon",
  description: "Teams, submissions, and judging for the Claude Impact Lab Hackathon in Seattle.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // If the profile read fails, render the header signed out; the page's own call throws the same
  // error and app/error.tsx shows "try again" below it.
  const profile = await getCurrentProfile().catch(() => null);
  const isAdmin = profile?.platform_role === "admin";
  const showFeedback = profile ? Boolean(await getFeedbackSender().catch(() => null)) : false;

  return (
    // suppressHydrationWarning: the inline script below sets data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} antialiased`}>
        {profile?.is_test && <TestAccountBanner name={`${profile.first_name} ${profile.last_name}`} />}
        <TitleBar signedIn={Boolean(profile)} isAdmin={isAdmin} isJudge={profile?.platform_role === "judge"} />
        <ThemeSync />
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
        {showFeedback && <FeedbackButton maxLength={FEEDBACK_MAX_LENGTH} />}
      </body>
    </html>
  );
}
