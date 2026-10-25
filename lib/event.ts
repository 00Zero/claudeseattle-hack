// Event facts from docs/REQUIREMENTS.md, "Event facts the software depends on".
// Deadlines shown to users come from event_settings, not from here.

export const eventName = "Claude Impact Lab Hackathon";
export const eventDate = "Sunday, October 25, 2026";
export const theme = "Build AI tools, workflows, and playbooks that small businesses can adopt.";
export const openSourceNote = "All projects are open-sourced on GitHub, so team and entry pages are public.";
export const lumaCalendarUrl = "https://luma.com/AdamBurgh";
export const venue = { name: "thinkspace Seattle", address: "1700 Westlake Ave N #200, Seattle", neighborhood: "South Lake Union", lat: 47.6341, lon: -122.3401 };

// Who the event is for, for the home page.
export const audience =
  "For small-business owners who know the problems, working professionals and students who want to build with Claude, and the technical builders who team up with them. Teams of 3 to 5 ship one thing a real business could put to work the following week, then open-source it.";

// Shown on the home page after the rubric: hosts, then judges, credit sponsors, partners, and
// ambassadors. Each list can mix people and companies, and a section stays hidden while its
// list is empty. Images go in public/ (people in public/people, logos in
// public/partners) and are referenced from the site root, e.g. "/partners/acme.png".
// A person without a photo gets their initials.
export type Person = { name: string; photo?: string; lines: string[]; linkedin?: string };
export type Company = { name: string; logo: string; description: string; website: string };
export type Entry = Person | Company;
// Example entries:
//   { name: "Jane Doe", photo: "/people/jane-doe.jpg", lines: ["Head of AI, Example Co"], linkedin: "https://www.linkedin.com/in/janedoe" }
//   { name: "Example Co", logo: "/partners/example-co.png", description: "Example Co builds tools for small businesses.", website: "https://example.com" }
export const hosts: Entry[] = [
  { name: "Adam Burgh", photo: "/people/adam-burgh.jpg", lines: ["Founder, We Build With AI", "Seattle Claude Ambassador"], linkedin: "https://www.linkedin.com/in/adamburgh" },
];
export const judges: Entry[] = [
  { name: "Shrey Shah", photo: "/people/shrey-shah.jpg", lines: ["AI Engineer, Microsoft", "Claude Ambassador"], linkedin: "https://www.linkedin.com/in/shreyshahh" },
  { name: "Peter Chee", photo: "/people/peter-chee.jpg", lines: ["Founder and CEO, thinkspace", "Entrepreneur and investor"], linkedin: "https://www.linkedin.com/in/pchee" },
  { name: "Amelia Marckworth", photo: "/people/amelia-marckworth.jpg", lines: ["Director of Programs, Innovation & Entrepreneurship, WTIA", "Professor, Seattle University"], linkedin: "https://www.linkedin.com/in/ameliamarckworth" },
  { name: "Darambazar Amgalan", photo: "/people/darambazar-amgalan.jpg", lines: ["Founder, Milaclan"], linkedin: "https://www.linkedin.com/in/darambazar" },
  { name: "Adi Nemmaluri", photo: "/people/adi-nemmaluri.jpg", lines: ["VP, AI & Engineering, Ladder", "Ex-DoorDash, ex-Ethos"], linkedin: "https://www.linkedin.com/in/aditya-nemmaluri" },
  { name: "Nishaanth Reddy", photo: "/people/nishaanth-reddy.jpg", lines: ["Senior Machine Learning Engineer, Apple", "Ex-Amazon"], linkedin: "https://www.linkedin.com/in/nishaanthreddy" },
  { name: "Nishant Revur", photo: "/people/nishant-revur.jpg", lines: ["Software Engineer, Amazon Just Walk Out", "Co-built this platform"], linkedin: "https://www.linkedin.com/in/nishantrevur" },
  { name: "Rajasuba Subramanian", photo: "/people/rajasuba-subramanian.jpg", lines: ["Software Engineer, Amazon", "Co-built this platform"], linkedin: "https://www.linkedin.com/in/rajasuba" },
];
// The companies behind the credits on /resources.
export const sponsors: Entry[] = [
  { name: "Anthropic", logo: "/partners/anthropic.png", description: "$100 in Claude API credits for every participant, plus Claude Max 20x for the winning team.", website: "https://www.anthropic.com" },
  { name: "Tavily", logo: "/partners/tavily.svg", description: "8,000 free API credits for web search and extraction built for AI agents.", website: "https://www.tavily.com" },
  { name: "OpenRouter", logo: "/partners/openrouter.svg", description: "$10 in API credits: one key for hundreds of LLMs.", website: "https://openrouter.ai" },
  { name: "Wispr Flow", logo: "/partners/wispr-flow.svg", description: "Free months of Wispr Flow Pro: AI voice dictation that works in every app.", website: "https://wisprflow.ai" },
];
export const partners: Entry[] = [
  { name: "thinkspace", logo: "/partners/thinkspace.svg", description: "Our venue: offices, coworking, and a startup community in South Lake Union.", website: "https://thinkspace.com" },
  { name: "WTIA", logo: "/partners/wtia.png", description: "Washington Technology Industry Association. A one-year membership for the winners and Seattle AI Week tickets for the top three.", website: "https://www.washingtontechnology.org" },
];
export const ambassadors: Entry[] = [];

export const prizes = {
  everyone: "Every participant gets $100 in Claude API credits.",
  winners: ["One month of Claude Max 20x per person", "A one-year WTIA membership"],
  // Shown under the list: the winning team's prizes in total.
  winnersValue: "The winning team receives up to $1,000 in prizes per person.",
  // The top three places (the winner included).
  topThree: ["Tickets to the Seattle AI Week AI Summit and the AI Week Opening Reception (courtesy of WTIA)", "Anthropic swag"],
};

// Docs/REQUIREMENTS.md, "Rubric". Each criterion is scored 1–8; the entry score is the mean of
// the enabled criteria. `key` is stored with every score (judge_scores.criteria) and in
// event_settings.judging_criteria, so never change or reuse one; names and anchors can change.
// Admins choose the enabled criteria on /admin/judging; `defaultCriteria` is what null means
// there and on scores saved before criteria were configurable.
export type CriterionKey = "works" | "ease" | "impact" | "creativity" | "teamwork";
export type Criterion = { key: CriterionKey; name: string; anchors: string[]; note?: string };

export const rubric: { bands: string[]; criteria: Criterion[]; defaultCriteria: CriterionKey[] } = {
  bands: ["1–2", "3–4", "5–6", "7–8"],
  defaultCriteria: ["works", "ease", "impact", "creativity"],
  criteria: [
    {
      key: "works",
      name: "Does it work",
      anchors: [
        "Didn't run or is slides only",
        "Parts run; core flow incomplete",
        "Core flow works with bugs or rough edges",
        "Works end to end; a business could try it today",
      ],
    },
    {
      key: "ease",
      name: "Ease of implementation for a small business",
      anchors: [
        "Needs a developer and custom setup",
        "Needs technical help to get started",
        "A motivated owner could set it up with the README",
        "Plug-and-play; clear README, no code needed",
      ],
    },
    {
      key: "impact",
      name: "Impact on the business's operations",
      anchors: [
        "Unclear who it helps or how",
        "Helps a narrow task a little",
        "Saves real time or money on a common task",
        "Changes how a core part of the business runs",
      ],
    },
    {
      key: "creativity",
      name: "Creativity of the solution",
      anchors: [
        "Generic chatbot or template",
        "Sensible but predictable",
        "A fresh angle on a known problem",
        "Something judges hadn't thought of",
      ],
    },
    {
      key: "teamwork",
      name: "Teamwork",
      anchors: [
        "One person did essentially everything, or no sign of who did what",
        "One or two people did most of it; other roles unclear",
        "Clear roles; most members visibly contributed (code, design, business, research, or pitch)",
        "Every member had a distinct, visible role, and the team shows how they worked together",
      ],
      note: "Not everyone needs to write code: business, design, research, and pitch roles count.",
    },
  ],
};

// start/end are ISO instants (Pacific wall time with the PDT offset) so the home page can mark
// what is past, happening now, and next. `key` marks the two deadlines.
// `short` is the concise name the home page card uses for "Up next".
export type ScheduleItem = { time: string; what: string; short?: string; start?: string; end?: string; key?: boolean };

// The "context window" countdown on the home page runs from the team formation happy hour, the
// first part of the event (100% remaining until then), to the end of the event (auto-compact).
export const eventOpenAt = "2026-10-24T16:30:00-07:00";
export const eventCloseAt = "2026-10-25T19:30:00-07:00";

export const saturdaySchedule: ScheduleItem[] = [
  { time: "4:30–6:30 pm", what: "Team formation happy hour (optional)", short: "Team formation happy hour", start: "2026-10-24T16:30:00-07:00", end: "2026-10-24T18:30:00-07:00" },
];

export const sundaySchedule: ScheduleItem[] = [
  { time: "9:00–9:45 am", what: "Check-in, breakfast, team formation for anyone unmatched", short: "Check-in and breakfast", start: "2026-10-25T09:00:00-07:00", end: "2026-10-25T09:45:00-07:00" },
  { time: "10:30 am", what: "Start building (team formation closes)", short: "Team formation closes", start: "2026-10-25T10:30:00-07:00", end: "2026-10-25T17:30:00-07:00", key: true },
  { time: "5:30 pm", what: "Submission deadline", short: "Submissions close", start: "2026-10-25T17:30:00-07:00", end: "2026-10-25T17:30:00-07:00", key: true },
  { time: "5:30–6:30 pm", what: "Prelim judging during dinner", short: "Prelim judging and dinner", start: "2026-10-25T17:30:00-07:00", end: "2026-10-25T18:30:00-07:00" },
  { time: "6:30–7:30 pm", what: "Finals on stage: five 5-minute live demos plus Q&A", short: "Finals on stage", start: "2026-10-25T18:30:00-07:00", end: "2026-10-25T19:30:00-07:00" },
  { time: "7:30 pm", what: "Winners announced", short: "Winners announced", start: "2026-10-25T19:30:00-07:00", end: "2026-10-25T20:00:00-07:00" },
];
