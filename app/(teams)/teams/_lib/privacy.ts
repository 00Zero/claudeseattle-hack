// Leak check for AI-written text (see ai.ts). Pure, so it can be tested on its own.
//
// Private signals (LinkedIn summaries, survey and registration answers) are long and full of
// everyday words, so "any word that only appears privately" would flag almost every reason.
// What actually identifies a private answer is narrower:
//   1. proper nouns and tool names found only in private text (companies, schools, places,
//      products: "Starbucks", "Ballard", "Tableau"), and
//   2. phrases copied from it (any run of three words with at least two content words).

const COMMON = new Set(
  "the a an and or but of to in on at for with by from as is are was were be been it its this that these those i my me we our you your they their he she his her not no yes so if than then".split(
    " ",
  ),
);

// Capitalized words that say nothing private: the event's own vocabulary, job-title
// abbreviations, and generic tech terms everyone at a Claude hackathon uses.
const EVENT_NOUNS = new Set(
  "Claude Code Anthropic AI ML LLM LLMs API APIs MCP Seattle Washington CTO CEO COO CFO CPO VP UX UI PM MVP SaaS B2B B2C GPT ChatGPT OpenAI GitHub LinkedIn".split(
    " ",
  ),
);

const words = (text: string) => text.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) ?? [];

// Capitalized or all-caps tokens (Starbucks, SQL, iOS-like names are rare enough to ignore).
function properNouns(text: string) {
  return new Set(text.match(/\b[A-Z][A-Za-z0-9+#.-]{1,}\b/g) ?? []);
}

function phrases(text: string) {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) {
    const tri = w.slice(i, i + 3);
    if (tri.filter((x) => !COMMON.has(x) && x.length > 3).length >= 2) out.add(tri.join(" "));
  }
  return out;
}

// True if the reason names something that appears only in the private text, or copies a
// phrase from it. allowedText is what the reader can already see (the team's text and the
// person's public profile); anything also there is fine to mention.
export function leaks(reason: string, privateText: string, allowedText: string) {
  return leakKind(reason, privateText, allowedText) !== null;
}

// Which check a reason fails ("name" or "phrase"), or null. For logging counts, not content.
export function leakKind(reason: string, privateText: string, allowedText: string): "name" | "phrase" | null {
  const allowedLower = new Set(words(allowedText));
  const reasonNouns = properNouns(reason);
  const privateNouns = [...properNouns(privateText)].filter(
    (noun) => !EVENT_NOUNS.has(noun) && !allowedLower.has(noun.toLowerCase()) && !COMMON.has(noun.toLowerCase()),
  );
  // Ignore the reason's first word: it's capitalized because it starts the sentence.
  const firstWord = reason.trim().match(/^[A-Za-z0-9+#.-]+/)?.[0];
  if (privateNouns.some((noun) => noun !== firstWord && reasonNouns.has(noun))) return "name";

  const allowedPhrases = phrases(allowedText);
  const reasonPhrases = phrases(reason);
  return [...phrases(privateText)].some((p) => !allowedPhrases.has(p) && reasonPhrases.has(p)) ? "phrase" : null;
}
