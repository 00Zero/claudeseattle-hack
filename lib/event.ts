// Event facts from docs/REQUIREMENTS.md, "Event facts the software depends on".
// Deadlines shown to users come from event_settings, not from here.

export const eventName = "Claude Impact Lab Hackathon";
export const eventDate = "Sunday, October 25, 2026";
export const theme = "Build AI tools, workflows, and playbooks that small businesses can adopt.";
export const openSourceNote = "All projects are open-sourced on GitHub, so team and entry pages are public.";
export const venue = { name: "thinkspace Seattle", address: "1700 Westlake Ave N #200, Seattle" };

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

export type ScheduleItem = { time: string; what: string };

export const saturdaySchedule: ScheduleItem[] = [
  { time: "4:30–6:30 pm", what: "Team formation happy hour (optional)" },
];

export const sundaySchedule: ScheduleItem[] = [
  { time: "9:00–9:45 am", what: "Check-in, breakfast, team formation for anyone unmatched" },
  { time: "10:30 am", what: "Start building (team formation closes)" },
  { time: "5:30 pm", what: "Submission deadline" },
  { time: "5:30–6:30 pm", what: "Prelim judging during dinner" },
  { time: "6:30–7:30 pm", what: "Finals on stage: five 5-minute live demos plus Q&A" },
  { time: "7:30 pm", what: "Winners announced" },
];
