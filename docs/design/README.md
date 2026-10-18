# Homepage design prototypes

Option D is implemented as the real home page: `app/page.tsx`, `components/home/*`, `components/theme/*`, `components/site/title-bar.tsx`, `lib/pixel/*` (the same scripts as here, as ES modules with `.d.ts` types), `lib/weather.ts`, and `app/api/weather/route.ts`. Tokens live in `app/globals.css`. The files below are the prototypes that led there and stay as the visual reference.

Standalone HTML prototypes for the hack.claudeseattle.org homepage, built from the Claude Community event kit. Open them with the `design` preview (`.claude/launch.json`, port 5055) or any static server from this folder. They are prototypes: not wired to Next.js, Supabase, or auth.

| File | Direction | Status |
| --- | --- | --- |
| `d-pixel.html` | **Option D.** Claude Code title bar, editorial hero with a live context-window card, one full-bleed pixel Seattle band with live weather and time of day, Clawd on the waterfront, single-column sections | Current direction |
| `a-skyline.html` | Editorial page on ivory with a drawn line-art skyline | Superseded by D |
| `b-terminal.html` | The page as a Claude Code session | Superseded by D |
| `c-poster.html` | Gig poster | Rejected |

Demo flags for D go in the URL hash, comma-separated: theme `light` / `dark` / `auto`, daylight `day` / `night` / `dusk`, weather `clear` / `partly` / `overcast` / `fog` / `drizzle` / `rain` / `showers` / `snow` / `thunder`. Example: `d-pixel.html#dark,night,snow`. Without flags the page follows the real clock and the real weather at the venue.

## Shared pieces (carry these into the real site)

- `tokens.css`: brand colors from the kit's SVGs (clay `#D97757`, ink `#141413`, ivory `#FAF9F5`), Seattle secondaries (sound, evergreen), type scale, spacing, radii, motion. Three theme sets: light on `:root`, `data-theme="dark"`, and `data-theme="dusk"` (the grey step around sunset).
- `clawd-pixel.js`: the drop-in Clawd widget. One script, no images; Clawd is drawn on a 16x13 pixel grid onto a canvas with `image-rendering: pixelated`. Classic orange and a Seahawks "12" jersey (College Navy, Action Green, Wolf Grey). Behaviours: walk, look around, think (spinner verb bubble), wave, sit, nap, coffee, laptop, dance, trip, climb the Space Needle; in the jersey also throw, kick, and rush with a football. Click: hop and a spinner verb. Double-click: toggle the jersey. Drag: pick him up and drop him (he falls to the ground). `initClawd({ wanderMode: 'bottom' | 'free' | 'stage', stage, scale, walkSpeed, spawnChanceJersey, zIndex, weather, landmarks })`. Exposes `initClawd.VERBS` and `initClawd.GLYPHS`. Scoped `clawdw-` classes, overlay is `pointer-events: none`, honors reduced motion.
- `skyline.js`: the pixel Seattle renderer. Looking east from Elliott Bay: Space Needle, downtown (Rainier Square, 1201 Third, Columbia Center, Municipal Tower), the Great Wheel, Smith Tower, Lumen Field, hills, Mount Rainier. Water, ferry, gulls. Weather from Open-Meteo WMO codes: clouds, overcast deck, drizzle, rain, showers, snow, fog, thunder, sun and moon. Day and night palettes interpolate from the venue's sunrise and sunset; lit windows and reflections at night. `initSkyline({ canvas, theme })` returns `setWeather`, `setTheme`, `forceDaylight`, `landmarks()`, `groundY`, `scale`.
- `clawd.js`: the first SVG Clawd from variants A to C. Superseded by `clawd-pixel.js`.

## Production notes

- Weather: the prototype calls Open-Meteo from the browser. In Next.js, proxy it through a route handler with a 10-minute cache so visitors make no third-party calls.
- Theme: `auto` follows the sun at the venue (dark after sunset, a dusk step 45 minutes either side) and the system preference; the choice is remembered in `localStorage` as `hack-theme`.
- Context window: the hero card and agenda compute against the event clock (deadlines from `event_settings` in production, hard-coded here).
- Fonts: the kit's Anthropic Sans Display Semibold and Anthropic Serif Display Light (OTF in the Drive folder) are stand-in'd by Newsreader and Geist from Google Fonts until self-hosted.

## Brand rules that apply

Ambassador Handbook, sections 6 and 14: the lockup is "Claude Community Seattle" and the city is the only variable; do not use the standalone Claude logo, the Anthropic name or logo, or the "Keep Thinking" tagline; use the kit's colors and fonts. The Clawd drawing is a pixel reconstruction, not an extracted asset.
