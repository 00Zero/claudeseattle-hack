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

// Shown on the home page after the rubric. The judges list stays hidden while it is empty.
export type Person = { name: string; photo: string; lines: string[]; linkedin?: string };
export const hosts: Person[] = [
  { name: "Adam Burgh", photo: "/people/adam-burgh.jpg", lines: ["Founder, We Build With AI", "Seattle Claude Ambassador"], linkedin: "https://www.linkedin.com/in/adamburgh" },
];
export const judges: Person[] = [];

export const prizes = {
  everyone: "Every participant gets $100 in Claude API credits.",
  winners: [
    "One month of Claude Max 20x per person",
    "Tickets to the Seattle AI Week AI Summit (courtesy of WTIA)",
    "A one-year WTIA membership",
  ],
};

// Docs/REQUIREMENTS.md, "Rubric". Each criterion is scored 1–8; the entry score is the mean.
export const rubric = {
  bands: ["1–2", "3–4", "5–6", "7–8"],
  criteria: [
    {
      name: "Does it work",
      anchors: [
        "Didn't run or is slides only",
        "Parts run; core flow incomplete",
        "Core flow works with bugs or rough edges",
        "Works end to end; a business could try it today",
      ],
    },
    {
      name: "Ease of implementation for a small business",
      anchors: [
        "Needs a developer and custom setup",
        "Needs technical help to get started",
        "A motivated owner could set it up with the README",
        "Plug-and-play; clear README, no code needed",
      ],
    },
    {
      name: "Impact on the business's operations",
      anchors: [
        "Unclear who it helps or how",
        "Helps a narrow task a little",
        "Saves real time or money on a common task",
        "Changes how a core part of the business runs",
      ],
    },
    {
      name: "Creativity of the solution",
      anchors: [
        "Generic chatbot or template",
        "Sensible but predictable",
        "A fresh angle on a known problem",
        "Something judges hadn't thought of",
      ],
    },
  ],
};

// start/end are ISO instants (Pacific wall time with the PDT offset) so the home page can mark
// what is past, happening now, and next. `key` marks the two deadlines.
export type ScheduleItem = { time: string; what: string; start?: string; end?: string; key?: boolean };

// The "context window" countdown on the home page runs from the team formation happy hour, the
// first part of the event (100% remaining until then), to the end of the event (auto-compact).
export const eventOpenAt = "2026-10-24T16:30:00-07:00";
export const eventCloseAt = "2026-10-25T19:30:00-07:00";

export const saturdaySchedule: ScheduleItem[] = [
  { time: "4:30–6:30 pm", what: "Team formation happy hour (optional)", start: "2026-10-24T16:30:00-07:00", end: "2026-10-24T18:30:00-07:00" },
];

export const sundaySchedule: ScheduleItem[] = [
  { time: "9:00–9:45 am", what: "Check-in, breakfast, team formation for anyone unmatched", start: "2026-10-25T09:00:00-07:00", end: "2026-10-25T09:45:00-07:00" },
  { time: "10:30 am", what: "Start building (team formation closes)", start: "2026-10-25T10:30:00-07:00", end: "2026-10-25T17:30:00-07:00", key: true },
  { time: "5:30 pm", what: "Submission deadline", start: "2026-10-25T17:30:00-07:00", end: "2026-10-25T17:30:00-07:00", key: true },
  { time: "5:30–6:30 pm", what: "Prelim judging during dinner", start: "2026-10-25T17:30:00-07:00", end: "2026-10-25T18:30:00-07:00" },
  { time: "6:30–7:30 pm", what: "Finals on stage: five 5-minute live demos plus Q&A", start: "2026-10-25T18:30:00-07:00", end: "2026-10-25T19:30:00-07:00" },
  { time: "7:30 pm", what: "Winners announced", start: "2026-10-25T19:30:00-07:00", end: "2026-10-25T20:00:00-07:00" },
];
