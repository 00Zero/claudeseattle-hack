// The post-event survey at /survey/<token>: which questions each person sees, and how answers are checked.
// Everyone answers a few required multiple-choice questions ("quick"), then picks whether to say more:
// yes opens the optional questions ("detail"), no leaves one free-text box ("additional").
// Who sees which track comes from their invite's group and role (lib/followup/groups.ts), corrected by
// the first question when the data can't tell whether they came.

export type Question =
  | { id: string; kind: "choice"; label: string; options: string[] }
  // other: adds "Other" with a text box, saved as "Other: <text>". none: an option that clears the rest.
  | { id: string; kind: "multi"; label: string; options: string[]; other?: boolean; none?: string }
  | { id: string; kind: "matrix"; label: string; rows: string[]; options: string[] }
  | { id: string; kind: "text"; label: string; help?: string }
  // Whole dollars per hour, at most 3 digits; saved as a number.
  | { id: string; kind: "dollars"; label: string };

type Choice = Extract<Question, { kind: "choice" }>;

export const GROUPS = ["attended", "unsure", "crew", "no_show", "late_cancel", "standby"] as const;
export type Group = (typeof GROUPS)[number];
export const ROLES = ["participant", "standby", "mentor", "judge", "volunteer", "ambassador"] as const;
export type Role = (typeof ROLES)[number];
export type Track = "attended" | "mentor" | "judge" | "volunteer" | "no_show" | "late_cancel" | "standby_out";

export type Answers = {
  track: Track;
  came?: string;
  quick: Record<string, string | string[] | Record<string, string>>;
  more: boolean;
  detail: Record<string, string | string[] | Record<string, string>>;
  additional?: string;
};

const CREW: Role[] = ["mentor", "judge", "volunteer", "ambassador"];
const crewTrack = (role: Role): Track => (role === "ambassador" ? "volunteer" : (role as Track));

// The first question, for groups where the data can't tell whether someone came.
export function gateFor(group: Group): Choice | null {
  if (group === "unsure" || group === "no_show") {
    return { id: "came", kind: "choice", label: "Did you make it to the hackathon on Sunday, Oct 25?", options: ["Yes", "No"] };
  }
  if (group === "standby") {
    return {
      id: "came",
      kind: "choice",
      label: "Did you come to thinkspace on Sunday morning?",
      options: ["Yes, and I got in", "Yes, but I wasn't placed on a team", "No"],
    };
  }
  return null;
}

// The track for an invite, given the answer to the first question (if it has one).
export function trackFor(group: Group, role: Role, came?: string): Track | null {
  const attendedTrack = CREW.includes(role) ? crewTrack(role) : "attended";
  switch (group) {
    case "attended":
    case "crew":
      return attendedTrack;
    case "unsure":
    case "no_show":
      return came === "Yes" ? attendedTrack : came === "No" ? "no_show" : null;
    case "standby":
      return came === "Yes, and I got in" ? "attended" : came ? "standby_out" : null;
    case "late_cancel":
      return "late_cancel";
  }
}

const AGAIN = ["Yes", "Maybe", "No"];
const OVERALL: Question = { id: "overall", kind: "choice", label: "Overall, how was the hackathon?", options: ["Excellent", "Good", "Okay", "Poor"] };
const TEAMS: Question = {
  id: "team_structure",
  kind: "choice",
  label: "Teams of 3 to 5 with a required mix: a business owner, a student or recent grad, an experienced professional, and a technical person. Should we keep it?",
  options: ["Keep it as is", "Keep it, with changes", "Drop it", "No opinion"],
};
const THEME: Question = {
  id: "theme",
  kind: "choice",
  label: "The theme: AI tools, workflows and playbooks that small businesses can adopt.",
  options: ["Loved it", "Liked it", "It was okay", "Didn't like it"],
};
const WEBSITE: Question = { id: "website", kind: "choice", label: "The hackathon website (hack.claudeseattle.org) was:", options: ["Easy to use", "Mostly easy", "Hard to use", "Didn't use it"] };
const SCHEDULE_OVERALL: Question = { id: "schedule", kind: "choice", label: "The schedule for the day:", options: ["Worked well", "Mostly worked", "Needs work"] };

// What people loved, didn't like, missed and would improve: the top of every attendee's optional part.
const OPEN: Question[] = [
  { id: "loved", kind: "text", label: "What did you love that we should keep doing?" },
  { id: "stop", kind: "text", label: "What did you not like that we should stop doing?" },
  { id: "missing", kind: "text", label: "What was missing that we should add?" },
  { id: "improve", kind: "text", label: "What else could we improve?" },
];
const SCHEDULE_PARTS: Question = {
  id: "schedule_parts",
  kind: "matrix",
  label: "How did each part of the schedule work?",
  rows: [
    "Saturday team formation happy hour",
    "Check-in and breakfast (9:00 am)",
    "Opening kickoff (9:45 am)",
    "Team formation before building (10:30 am)",
    "Lunch and dinner",
    "Submission deadline (5:30 pm)",
    "Prelim judging over dinner (5:30 pm)",
    "Finals on stage (6:30 pm)",
    "Winners announced (7:30 pm)",
  ],
  options: ["Worked well", "Okay", "Needs work", "Didn't attend"],
};
const WEBSITE_PARTS: Question = {
  id: "website_parts",
  kind: "matrix",
  label: "How easy was each part of the website?",
  rows: ["Signing in with the emailed link", "Setting up my profile", "Finding a team or teammates", "Submitting a project", "Resources (credits, Wi-Fi, photo uploads)", "Results and the audience vote"],
  options: ["Easy", "Okay", "Difficult", "Didn't use"],
};
const AGREE = ["Agree", "Neutral", "Disagree", "Not sure"];
const INVOLVE: Question = {
  id: "involve",
  kind: "multi",
  label: "How would you like to be involved next time?",
  options: ["Participant", "Mentor", "Volunteer", "Judge", "Sponsor (credits, food or venue)"],
  none: "I'm good for now",
};

// What mentors helped with, asked of mentors and of participants.
const HELP_TOPICS = ["Small business needs", "Scoping the project", "Getting started with Claude Code", "GitHub", "API credits and keys", "Debugging", "Demo and pitch"];
const TRACKS: Record<Track, { quick: Question[]; detail: Question[] }> = {
  attended: {
    quick: [
      OVERALL,
      TEAMS,
      THEME,
      { id: "build_time", kind: "choice", label: "Building time, 10:30 am to 5:30 pm, was:", options: ["Too short", "About right", "Too long"] },
      WEBSITE,
      { id: "mentors", kind: "choice", label: "How helpful were the mentors?", options: ["Very helpful", "Somewhat helpful", "Not helpful", "Didn't work with a mentor"] },
      {
        id: "agents",
        kind: "multi",
        label: "Which coding agents did you mainly use?",
        options: ["Claude Code", "Codex", "Cursor", "Antigravity", "Gemini CLI", "GitHub Copilot", "Cline"],
        other: true,
        none: "None",
      },
      {
        // Offer clicks show who opened each redeem link; this asks who redeemed it and whether it went into the project.
        id: "credits",
        kind: "matrix",
        label: "Which sponsored credit options did you use?",
        rows: ["Claude API credits ($100)", "OpenRouter credits ($10)", "Tavily credits (8,000)", "Wispr Flow Pro"],
        options: ["Yes, in our project", "Yes, redeemed but didn't use", "Did not redeem"],
      },
      { id: "again", kind: "choice", label: "Would you come to another Claude Seattle hackathon?", options: AGAIN },
    ],
    detail: [
      ...OPEN,
      { id: "mentor_help", kind: "multi", label: "What did mentors help you with?", options: HELP_TOPICS, other: true },
      { id: "mentor_standouts", kind: "text", label: "Were there particular mentors who helped you especially? Who, and how?" },
      {
        id: "team_formed",
        kind: "choice",
        label: "When did your team come together?",
        options: ["At the Saturday happy hour", "Sunday, before the 9:45 am kickoff", "Between the kickoff and 10:30 am", "After building started", "I didn't end up on a team"],
      },
      { id: "team_change", kind: "text", label: "What would you change about how teams are formed?" },
      SCHEDULE_PARTS,
      { id: "day_length", kind: "choice", label: "The length of the day was:", options: ["Too long", "About right", "Too short"] },
      { id: "emails", kind: "choice", label: "The emails before the event were:", options: ["Very useful", "Somewhat useful", "Not useful", "I didn't read them"] },
      WEBSITE_PARTS,
      {
        id: "credits_why",
        kind: "multi",
        label: "If your project didn't use some of the credits, why not?",
        options: ["I didn't know how to claim them", "I already had my own subscription or credits", "Our team used one person's account", "Setting them up took too long", "Our project didn't need them"],
      },
      { id: "services_used", kind: "text", label: "Which other services did your team use?" },
      { id: "services_wanted", kind: "text", label: "Which services would you like to see as credit sponsors at future hackathons?" },
      { id: "keep_building", kind: "choice", label: "Will your team keep working on the project?", options: AGAIN },
      INVOLVE,
    ],
  },
  mentor: {
    quick: [
      OVERALL,
      { id: "mentoring", kind: "choice", label: "How well did mentoring work?", options: ["Very well", "Well", "Okay", "Poorly"] },
      TEAMS,
      SCHEDULE_OVERALL,
      WEBSITE,
      { id: "again", kind: "choice", label: "Would you mentor again?", options: AGAIN },
    ],
    detail: [
      ...OPEN,
      { id: "mode", kind: "choice", label: "How did you work with teams?", options: ["Assigned to teams", "Free agent", "A mix"] },
      { id: "teams_helped", kind: "choice", label: "About how many teams did you help?", options: ["None", "1 to 2", "3 to 5", "6 or more"] },
      {
        id: "help_topics",
        kind: "multi",
        label: "What did teams ask for help with most?",
        options: HELP_TOPICS,
      },
      {
        id: "agree",
        kind: "matrix",
        label: "How much do you agree?",
        rows: ["I knew what was expected of me.", "Arriving by 9:30 am and regrouping at 11:00 am worked.", "Teams knew how and when to ask for help.", "My skills matched what teams needed."],
        options: AGREE,
      },
      THEME,
      SCHEDULE_PARTS,
    ],
  },
  judge: {
    quick: [
      OVERALL,
      { id: "judging", kind: "choice", label: "How well did judging work?", options: ["Very well", "Well", "Okay", "Poorly"] },
      { id: "criteria", kind: "choice", label: "The judging criteria were:", options: ["Clear", "Mostly clear", "Unclear"] },
      SCHEDULE_OVERALL,
      { id: "again", kind: "choice", label: "Would you judge again?", options: AGAIN },
    ],
    detail: [
      ...OPEN,
      {
        id: "agree",
        kind: "matrix",
        label: "How much do you agree?",
        rows: [
          "Scoring 1 to 8 with no middle worked well.",
          "The entry page (video, repo, description) gave me enough to score.",
          "Prelim judging over dinner was enough time.",
          "Judging in a group worked well (if you were in one).",
          "The finals format (5-minute demo, 2 minutes of Q&A) worked well.",
          "Scoring on my phone was easy.",
        ],
        options: AGREE,
      },
      { id: "ai_notes", kind: "choice", label: "Did you read the AI notes on entries?", options: ["Yes, they were useful", "Yes, they weren't useful", "I didn't read them", "I didn't see them"] },
      { id: "projects", kind: "choice", label: "How well did the projects address real small business needs?", options: ["Very well", "Well", "Somewhat", "Not well"] },
      { id: "criteria_change", kind: "text", label: "Should we change, add or drop any criteria?" },
      THEME,
    ],
  },
  volunteer: {
    quick: [
      OVERALL,
      { id: "organized", kind: "choice", label: "How well organized was volunteering?", options: ["Very well", "Well", "Okay", "Poorly"] },
      SCHEDULE_OVERALL,
      { id: "again", kind: "choice", label: "Would you volunteer again?", options: AGAIN },
    ],
    detail: [
      ...OPEN,
      {
        id: "helped",
        kind: "multi",
        label: "What did you help with?",
        options: ["Saturday happy hour", "Sunday setup", "Check-in and name tags", "Standby area", "Meals", "Project submissions", "Judging and finals", "Cleanup"],
      },
      {
        id: "agree",
        kind: "matrix",
        label: "How much do you agree?",
        rows: ["I knew what to do when I arrived.", "The WhatsApp group helped us coordinate.", "Check-in went smoothly.", "The standby process was clear enough to explain.", "The workload was reasonable and I got breaks."],
        options: AGREE,
      },
      { id: "stuck", kind: "text", label: "Where did things get stuck or need more hands?" },
    ],
  },
  no_show: {
    quick: [
      {
        id: "reason",
        kind: "choice",
        label: "What kept you from coming?",
        options: ["My plans changed", "I was sick", "Work came up", "I wasn't sure I was confirmed", "The day was too long", "I didn't have a team", "Transportation or parking", "I forgot", "Something else"],
      },
      { id: "knew_cancel", kind: "choice", label: "Did you know you could cancel on Luma to give your spot to someone on the waitlist?", options: ["Yes", "No"] },
      { id: "future", kind: "choice", label: "Would you like to come to a future Claude Seattle event?", options: AGAIN },
    ],
    detail: [
      { id: "why_not_cancel", kind: "choice", label: "If you didn't cancel, why not?", options: ["I meant to and forgot", "I hoped to make part of the day", "I didn't know how", "Something else"] },
      { id: "easier", kind: "multi", label: "What would make it easier to come next time?", options: ["A shorter day", "A weekday evening", "A different month", "A confirmed team before the day", "More reminders"] },
      { id: "anything", kind: "text", label: "Anything else we should know?" },
    ],
  },
  late_cancel: {
    quick: [
      { id: "reason", kind: "choice", label: "What made you cancel?", options: ["My plans changed", "I was sick", "Work came up", "The day was too long", "I was unsure about teams or the format", "Something else"] },
      { id: "when", kind: "choice", label: "When did you know you couldn't come?", options: ["More than a week before", "A few days before", "The day before", "That morning"] },
      { id: "future", kind: "choice", label: "Would you like to come to a future Claude Seattle event?", options: AGAIN },
    ],
    detail: [
      { id: "would_help", kind: "choice", label: "What would have made it work?", options: ["A shorter day", "A different date", "A part-day option", "Nothing, it was just timing"] },
      { id: "anything", kind: "text", label: "Anything else we should know?" },
    ],
  },
  standby_out: {
    quick: [
      { id: "standby_clear", kind: "choice", label: "How clear was the standby process, from the emails to check-in?", options: ["Very clear", "Mostly clear", "Confusing"] },
      { id: "standby_again", kind: "choice", label: "Would you join a standby list again?", options: AGAIN },
      { id: "future", kind: "choice", label: "Would you like to come to a future Claude Seattle event?", options: AGAIN },
    ],
    detail: [
      { id: "wait", kind: "choice", label: "If you came, how long did you wait?", options: ["Under 30 minutes", "30 to 60 minutes", "Over an hour", "I left before hearing back", "I didn't come"] },
      { id: "why_not", kind: "choice", label: "If you didn't come, why not?", options: ["I didn't think I'd get in", "My plans changed", "The wait sounded too long", "I didn't see the email", "I came"] },
      { id: "standby_better", kind: "text", label: "What would make standby better?" },
    ],
  },
};

// Standby guests who got in answer the attendee survey plus these.
const STANDBY_EXTRAS: Question[] = [
  { id: "standby_clear", kind: "choice", label: "How clear was the standby process before you arrived?", options: ["Very clear", "Mostly clear", "Confusing"] },
  { id: "standby_wait", kind: "choice", label: "About how long did you wait before joining a team?", options: ["Under 30 minutes", "30 to 60 minutes", "Over an hour"] },
  { id: "standby_better", kind: "text", label: "What would make standby better?" },
];

// Participants who checked in at Saturday's happy hour (a separate Luma event) say how useful it was and
// what would have made it more useful; everyone else says why they skipped it. Asked right after when
// their team came together.
const HAPPY_HOUR_CAME: Question = { id: "happy_hour", kind: "choice", label: "How useful was Saturday's team formation happy hour?", options: ["Very useful", "Somewhat useful", "Not useful"] };
const HAPPY_HOUR_BETTER: Question = { id: "happy_hour_better", kind: "text", label: "What would have made the happy hour more useful?" };
const HAPPY_HOUR_SKIPPED: Question = {
  id: "happy_hour_skipped",
  kind: "choice",
  label: "Why didn't you come to Saturday's team formation happy hour?",
  options: ["I didn't know about it", "I couldn't make it", "I didn't think I needed it", "I already had a team", "Something else"],
};

// Luma "professional role" answers that get the business owner version of the contract question.
export const OWNER_ROLES = ["Small business owner", "Small business executive", "Startup founder"];
export const isBusinessOwner = (professionalRole: string | null | undefined) => OWNER_ROLES.includes(professionalRole ?? "");

// For people who came: business owners and founders say whether they'd hire implementers; everyone else
// whether they'd do the implementing. Asked just before "would you come again".
function contractQuestion(track: Track, owner: boolean): Question {
  if (owner) {
    const who = track === "attended" ? "your hackathon teammates" : "the hackathon's participants";
    return {
      id: "hire_interest",
      kind: "choice",
      label: `If it were available, would you be interested in hiring people like ${who} on a short-term contract to build or set up a project like the ones from the hackathon for your business?`,
      options: ["Yes", "Maybe, depending on cost and scope", "Not right now", "No"],
    };
  }
  return {
    id: "contract_interest",
    kind: "choice",
    label: "If it were available, would you be interested in short-term contract work building or setting up projects like the ones from the hackathon for small businesses?",
    options: ["Yes", "Maybe, depending on the project and pay", "Not right now", "No"],
  };
}

// Optional follow-ups to the contract question, right after the open questions, for people who came.
const OWNER_FOLLOWUPS: Question[] = [
  { id: "want_built", kind: "text", label: "If you'd hire someone, what would you most want built or set up for your business?" },
  {
    id: "budget",
    kind: "choice",
    label: "What rough budget would you consider for a project like that?",
    options: ["Under $1,000", "$1,000 to $3,000", "$3,000 to $10,000", "Over $10,000", "Not sure yet"],
  },
  { id: "pay_per_hour", kind: "dollars", label: "How much would you pay per hour, per person?" },
];
const WORKER_FOLLOWUPS: Question[] = [
  {
    id: "hourly_rate",
    kind: "dollars",
    label: "If you'd take on contract work, what hourly rate would you expect?",
  },
  {
    id: "availability",
    kind: "multi",
    label: "When could you do contract work?",
    options: ["Full-time", "Part-time", "Nights", "Weekends"],
    none: "Not available right now",
  },
];

export type Who = { happyHour?: boolean; owner?: boolean };

export function questionsFor(track: Track, role: Role, who: Who = {}) {
  const { quick: base, detail: baseDetail } = TRACKS[track];
  const came = CAME_TRACKS.includes(track);
  // The contract question goes just before the last required question ("would you come again"), and its
  // follow-ups right after the four open questions that start every attendee's optional part.
  const quick = came ? [...base.slice(0, -1), contractQuestion(track, Boolean(who.owner)), ...base.slice(-1)] : base;
  const followups = who.owner ? OWNER_FOLLOWUPS : WORKER_FOLLOWUPS;
  const detail = came ? [...baseDetail.slice(0, OPEN.length), ...followups, ...baseDetail.slice(OPEN.length)] : baseDetail;
  const happyHour = Boolean(who.happyHour);
  if (track !== "attended") return { quick, detail };
  const at = detail.findIndex((q) => q.id === "team_formed") + 1;
  const withHappyHour = [...detail.slice(0, at), ...(happyHour ? [HAPPY_HOUR_CAME, HAPPY_HOUR_BETTER] : [HAPPY_HOUR_SKIPPED]), ...detail.slice(at)];
  return { quick, detail: role === "standby" ? [...withHappyHour, ...STANDBY_EXTRAS] : withHappyHour };
}

// A matrix answer with every row answered, or null.
function fullMatrix(q: Extract<Question, { kind: "matrix" }>, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rows: Record<string, string> = {};
  for (const row of q.rows) {
    const v = (value as Record<string, unknown>)[row];
    if (typeof v !== "string" || !q.options.includes(v)) return null;
    rows[row] = v;
  }
  return rows;
}

export const OTHER = "Other: ";

// The valid picks of a multi answer: listed options, "None", and "Other: <text>" with some text.
export function multiPicks(q: Extract<Question, { kind: "multi" }>, value: unknown) {
  if (!Array.isArray(value)) return [];
  const picks = value.filter(
    (v): v is string =>
      typeof v === "string" && (q.options.includes(v) || v === q.none || (Boolean(q.other) && v.startsWith(OTHER) && v.slice(OTHER.length).trim() !== "")),
  );
  const cleaned = picks.map((v) => (v.startsWith(OTHER) ? `${OTHER}${v.slice(OTHER.length).trim().slice(0, 200)}` : v));
  return q.none && cleaned.includes(q.none) ? [q.none] : cleaned;
}
// Whether a required question has an answer (choice: one option; multi: at least one; matrix: every row).
export function isAnswered(q: Question, value: unknown) {
  if (q.kind === "choice") return typeof value === "string" && q.options.includes(value);
  if (q.kind === "multi") return multiPicks(q, value).length > 0;
  if (q.kind === "matrix") return fullMatrix(q, value) !== null;
  return false;
}

// Tracks whose thank-you page asks for photos and videos (they came).
export const CAME_TRACKS: Track[] = ["attended", "mentor", "judge", "volunteer"];

const MAX_TEXT = 4000;

// Checks a submitted survey against the questions this invite sees. Returns the cleaned answers or an error.
export function checkAnswers(group: Group, role: Role, who: Who, raw: unknown): { ok: true; answers: Answers } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Something went wrong. Try again." };
  const input = raw as Partial<Answers>;
  const gate = gateFor(group);
  const came = gate ? input.came : undefined;
  if (gate && !gate.options.includes(String(came))) return { ok: false, message: "Please answer the first question." };
  const track = trackFor(group, role, came);
  if (!track) return { ok: false, message: "Please answer the first question." };
  const { quick, detail } = questionsFor(track, role, who);

  const quickOut: Answers["quick"] = {};
  for (const q of quick) {
    const value = input.quick?.[q.id];
    if (!isAnswered(q, value)) return { ok: false, message: "Please answer every question in the first part." };
    quickOut[q.id] = q.kind === "matrix" ? fullMatrix(q, value)! : q.kind === "multi" ? multiPicks(q, value) : (value as string);
  }

  const more = input.more === true;
  const detailOut: Answers["detail"] = {};
  if (more) {
    for (const q of detail) {
      const value = input.detail?.[q.id];
      if (value == null) continue;
      if (q.kind === "text" && typeof value === "string" && value.trim()) detailOut[q.id] = value.trim().slice(0, MAX_TEXT);
      if (q.kind === "dollars" && /^\d{1,3}$/.test(String(value)) && Number(value) > 0) detailOut[q.id] = String(Number(value));
      if (q.kind === "choice" && typeof value === "string" && q.options.includes(value)) detailOut[q.id] = value;
      if (q.kind === "multi") {
        const picked = multiPicks(q, value);
        if (picked.length) detailOut[q.id] = picked;
      }
      if (q.kind === "matrix" && typeof value === "object" && !Array.isArray(value)) {
        const rows: Record<string, string> = {};
        for (const row of q.rows) {
          const v = (value as Record<string, unknown>)[row];
          if (typeof v === "string" && q.options.includes(v)) rows[row] = v;
        }
        if (Object.keys(rows).length) detailOut[q.id] = rows;
      }
    }
  }
  const additional = !more && typeof input.additional === "string" && input.additional.trim() ? input.additional.trim().slice(0, MAX_TEXT) : undefined;
  return { ok: true, answers: { track, ...(came ? { came } : {}), quick: quickOut, more, detail: detailOut, ...(additional ? { additional } : {}) } };
}
