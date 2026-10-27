import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eventDate } from "@/lib/event";

// The link preview card for every page (LinkedIn, Slack, iMessage, X). Generated once at build
// time in the home page's style: ivory paper, clay accent, pixel Clawd, Newsreader Light title.
// Fonts are committed in assets/fonts (OFL) so the build doesn't fetch them.

export const alt = "Claude Impact Lab Hackathon, Seattle: open-source AI tools for small businesses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#141413";
const MUTED = "#3b3a36";
const CLAY = "#d97757";
const IVORY = "#faf9f5";

export default async function Image() {
  const [light, lightItalic, clawd] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Newsreader-Light.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Newsreader-LightItalic.ttf")),
    readFile(join(process.cwd(), "app/icon.svg")),
  ]);
  // "Sunday, October 25, 2026" -> "October 25, 2026"
  const date = eventDate.replace(/^\w+, /, "");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: IVORY, color: INK, padding: "64px 80px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={`data:image/svg+xml;base64,${clawd.toString("base64")}`} width={96} height={90} alt="" />
          <div style={{ fontSize: 28, letterSpacing: 3, textTransform: "uppercase", color: CLAY }}>{`Claude Community Seattle · ${date}`}</div>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", marginTop: 48, fontFamily: "Newsreader", fontSize: 112, lineHeight: 1, letterSpacing: -1 }}>
          <span style={{ whiteSpace: "pre" }}>Impact Lab </span>
          <span style={{ fontStyle: "italic", color: MUTED }}>Hackathon</span>
        </div>

        <div style={{ marginTop: 32, maxWidth: 940, fontFamily: "Newsreader", fontSize: 40, lineHeight: 1.25 }}>
          Free, open-source AI tools, workflows, and playbooks for small businesses.
        </div>

        <div style={{ display: "flex", marginTop: "auto", marginLeft: -80, marginRight: -80, padding: "26px 80px", background: CLAY, color: IVORY, fontSize: 30, justifyContent: "space-between" }}>
          <span>hack.claudeseattle.org</span>
          <span>Built with Claude in Seattle</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Newsreader", data: light, style: "normal", weight: 300 },
        { name: "Newsreader", data: lightItalic, style: "italic", weight: 300 },
      ],
    },
  );
}
