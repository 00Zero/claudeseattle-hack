import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getProjectStream } from "@/lib/small-business";
import { showcaseRepoUrl } from "@/lib/showcase";
import { getSubmissionDeadline } from "@/app/(judge)/submit/_lib/entry";
import { formatPacific } from "@/lib/time";
import { indexed } from "@/lib/site";
import { eventDate, eventName, lumaCalendarUrl } from "@/lib/event";
import { createClient } from "@/lib/supabase/server";
import { AREAS, areaSlug, CLAUDE_PLUGIN, type Project } from "@/lib/small-business-options";
import { JsonLd, projectListLd } from "@/components/site/json-ld";
import { PageHeader, Sig } from "@/app/(judge)/_components/ui";
import { Finder } from "./finder";
import { ProjectBrowser } from "./project-browser";

type Question = { q: string; a: string; link?: { text: string; href: string } };

// Plain answers for owners, shown on the page and given to search engines as an FAQ. link: turns
// that part of the answer into a link on the page.
function questions(lumaUrl: string): Question[] {
  return [
    {
      q: "Are these AI tools free?",
      a: "Yes. Every tool from the hackathon is open source on GitHub, so the code is free to use. Some call Claude or other paid services, which you pay for directly; each README says what the tool needs.",
    },
    {
      q: "Are these tools ready to use?",
      a: "Some are. Each was built in a single day, so some are working tools and others are early versions to build on. Read the README and try a tool on test data before you rely on it.",
    },
    {
      q: "Do I need a developer to use them?",
      a: "Not always. Each tool says how much setup it takes for an owner without a technical background: no code, some technical help (installing software, API keys, or a terminal), or a developer (hosting or custom code).",
    },
    {
      q: "Do I need a Claude account?",
      a: "For most of them, yes. Most of the tools use Claude, so you need a Claude plan or a Claude API key; each README says which, and whether the tool uses other paid services too.",
    },
    {
      q: "Is my business data safe with these tools?",
      a: "It depends on the tool. Some read your email, accounting, or bank data, and they run with your own accounts and keys. The organizers haven't reviewed them for security, so check what each README says the tool can access before you connect real business data.",
    },
    {
      q: "Can I get help setting one up?",
      a: "Start with the tool's README. If you get stuck, email support@claudeseattle.org.",
      link: { text: "support@claudeseattle.org", href: "mailto:support@claudeseattle.org" },
    },
    {
      q: "Which tool should I start with?",
      a: "Use the finder on this page: describe your business and the challenges you want help with, and Claude suggests the tools that fit best, with the reason for each. Or browse the tools by area.",
    },
    {
      q: "Who built these tools?",
      a: `Teams of small-business owners, working professionals, students, and engineers at the ${eventName}, a one-day event in Seattle on ${eventDate}, run by Claude Community Seattle. Each team built something a small business could put to work the following week.`,
    },
    {
      q: "Are they only for businesses in Seattle or Washington?",
      a: "No. They were built in Seattle, and most work for a small business anywhere. Each tool's summary says which businesses it suits.",
    },
    {
      q: "Can my business take part in a future hackathon?",
      a: "Yes. Small-business owners join the teams and bring the problems they want solved. Follow the Claude Community Seattle calendar on Luma to hear about the next one.",
      link: { text: "Claude Community Seattle calendar on Luma", href: lumaUrl },
    },
  ];
}

function Answer({ a, link }: Question) {
  if (!link || !a.includes(link.text)) return a;
  const [before, after] = a.split(link.text);
  const external = link.href.startsWith("http");
  return (
    <>
      {before}
      <a href={link.href} {...(external && { target: "_blank", rel: "noopener noreferrer" })}>
        {link.text}
      </a>
      {after}
    </>
  );
}

export const metadata: Metadata = {
  title: "Free AI tools for small businesses",
  description:
    "Free, open-source AI tools, workflows, and playbooks for small businesses, built with Claude at a Seattle hackathon. Describe your business and find the tools that fit.",
  robots: indexed,
  alternates: { canonical: "/small-businesses" },
};

// /small-businesses: public. A small business describes itself and its challenges and gets the
// hackathon projects that fit (the finder), or browses every project's plain-language summary.
// Data and AI in lib/small-business.ts. Linked from the home page once winners are published and
// from /resources.
export default async function SmallBusinessesPage() {
  const supabase = await createClient();
  const [{ closesAt, isPast }, { data: settings }] = await Promise.all([
    getSubmissionDeadline(),
    supabase.from("event_settings").select("luma_calendar_url").eq("id", 1).maybeSingle(),
  ]);
  const faq = questions(settings?.luma_calendar_url ?? lumaCalendarUrl);

  const faqSection = (
    <section id="questions" className="scroll-mt-20 space-y-4">
      <JsonLd data={{ "@type": "FAQPage", mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }} />
      <Sig call="Read(faq.md)" title="Questions" />
      <dl className="max-w-[65ch] space-y-4">
        {faq.map((question) => (
          <div key={question.q} className="space-y-1">
            <dt className="font-medium">{question.q}</dt>
            <dd className="text-fg-muted">
              <Answer {...question} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );

  return (
    <div className="space-y-12">
      <PageHeader eyebrow="Claude Impact Lab · for small businesses" title="Put AI to work in" italic="your business">
        <p>
          At the Claude Impact Lab Hackathon in Seattle, teams of owners, professionals, students, and engineers built AI tools, workflows, and playbooks for small
          businesses. Every tool is free and open source on GitHub.
        </p>
        <p>Tell us about your business and we&apos;ll point you to the tools that fit, or browse them all.</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <a href="#find" className="btn">
            Find tools for my business
          </a>
          <a href="#projects" className="btn btn-ghost">
            Browse all tools
          </a>
        </div>
        <p className="text-sm text-fg-muted">
          <a href="#questions">Questions: Is it free? Do I need a developer? ↓</a>
        </p>
      </PageHeader>

      {!isPast ? (
        <>
          <p className="text-fg-muted">The tools are published here after submissions close, {formatPacific(closesAt)}.</p>
          {faqSection}
        </>
      ) : (
        <>
          <section id="find" className="scroll-mt-20 space-y-4">
            <Sig call="Ask(your business)" title="Find tools for your business" />
            <Finder />
          </section>

          {/* Before the list: the list grows as summaries stream in, which would push a link to #questions off target. */}
          {faqSection}

          <section id="projects" className="scroll-mt-20 space-y-4">
            <Sig call="Read(projects.md)" title="Every tool" />
            <p className="max-w-[60ch] text-fg-muted">
              Every hackathon project is also copied into one GitHub repo, so you can browse or download them all in one place:{" "}
              <a href={showcaseRepoUrl} target="_blank" rel="noopener noreferrer">
                the project showcase ↗
              </a>
              .
            </p>
            <p className="max-w-[60ch] text-fg-muted">
              Summaries are written by Claude from each team&apos;s submission and README. Open the GitHub repo for setup instructions, or the submission for the demo
              video.
            </p>
            <p className="max-w-[60ch] text-fg-muted">
              By area:{" "}
              {AREAS.map((area, i) => (
                <span key={area}>
                  {i > 0 && " · "}
                  <Link href={`/small-businesses/${areaSlug(area)}`}>{area}</Link>
                </span>
              ))}
            </p>
            <Suspense fallback={<p className="font-mono text-sm text-fg-muted">Reading the tools…</p>}>
              <Projects />
            </Suspense>
          </section>
        </>
      )}

    </div>
  );
}

// The list shows as soon as the entries load; each card's summary streams in on its own (a summary
// is written the first time it's needed, e.g. after a team edits its entry).
async function Projects() {
  const projects = await getProjectStream();
  const all = Promise.all(projects.map((p) => p.full));
  return (
    <>
      <ProjectBrowser projects={projects} all={all} />
      <Suspense fallback={null}>
        <ProjectListLd all={all} />
      </Suspense>
    </>
  );
}

// Every tool as structured data, once every summary is in (the end of the stream).
async function ProjectListLd({ all }: { all: Promise<Project[]> }) {
  return <JsonLd data={projectListLd([CLAUDE_PLUGIN, ...(await all)], "Free AI tools for small businesses")} />;
}
