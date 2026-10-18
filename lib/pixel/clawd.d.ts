// Types for clawd.js (plain JavaScript, shared with the prototypes in docs/design).
export type ClawdAction =
  | "idle" | "look" | "walk" | "think" | "wave" | "sit" | "nap" | "coffee" | "laptop" | "dance" | "hop" | "trip" | "climb"
  | "throwBall" | "kick" | "rush";
export type ClawdOptions = {
  wanderMode?: "bottom" | "free" | "stage";
  stage?: HTMLElement | string;
  scale?: number;
  walkSpeed?: number;
  spawnChanceJersey?: number;
  zIndex?: number;
  colors?: Partial<Record<"body" | "eye" | "navy" | "green" | "grey" | "ball" | "lace" | "cup" | "umbrella" | "laptop" | "screen" | "shadow", string>>;
  weather?: () => string;
  landmarks?: { needle?: { x: number; top: number } };
  verbs?: string[];
};
export type Clawd = {
  el: HTMLDivElement;
  state: { x: number; y: number; dir: 1 | -1; jersey: boolean; dragging: boolean };
  VERBS: string[];
  GLYPHS: string[];
  say(text: string, ms?: number): void;
  perform(action: ClawdAction): void;
  setJersey(on: boolean): void;
  toggleJersey(): boolean;
  destroy(): void;
};
export const VERBS: string[];
export const FOOTBALL_VERBS: string[];
export const GLYPHS: string[];
export function initClawd(options?: ClawdOptions): Clawd;
