import type { ThemeColor } from "@mariozechner/pi-coding-agent";

// ── ANSI constants ───────────────────────────────────────────────────────────

export const RESET = "\x1b[0m";

// ── Editor chrome ────────────────────────────────────────────────────────────

export const PI_STR = "  pi ";
export const PI_WIDTH = PI_STR.length;
export const PI_SYMBOL_COL = 2;

export const AUTOCOMPLETE_CURSOR = "›";
export const HINT_MARGIN_RIGHT = 3;
export const PAD_X = 1;

// ── Theme plumbing ───────────────────────────────────────────────────────────

const FALLBACK_PANEL_BG = "\x1b[48;2;16;16;16m";
const FALLBACK_PANEL_EDGE = "\x1b[38;2;16;16;16m";
const FALLBACK_FRAME_FG = "\x1b[38;2;74;74;74m";
const FALLBACK_PREFIX_FG = "\x1b[38;2;74;74;74m";
const FALLBACK_TIME_FG = "\x1b[38;2;74;74;74m";
const FALLBACK_HINT_FG = "\x1b[38;2;102;102;102m";

type PaneThemeBg = "selectedBg" | "userMessageBg" | "customMessageBg" | "toolPendingBg" | "toolSuccessBg" | "toolErrorBg";

const PANEL_BG_KEYS: PaneThemeBg[] = ["customMessageBg", "userMessageBg", "toolPendingBg"];
const FRAME_FG_KEYS: ThemeColor[] = ["borderMuted", "border"];
const PREFIX_FG_KEYS: ThemeColor[] = ["accent", "border", "muted"];
const TIME_FG_KEYS: ThemeColor[] = ["muted", "accent", "dim"];
const HINT_FG_KEYS: ThemeColor[] = ["dim", "muted"];

export interface PaneThemeLike {
  fg(colorKey: string, text: string): string;
  getFgAnsi?(color: ThemeColor): string;
  getBgAnsi?(color: PaneThemeBg): string;
}

export interface PiPanePalette {
  panelBgAnsi: string;
  panelEdgeAnsi: string;
  frame(text: string): string;
  prefix(text: string): string;
  time(text: string): string;
  hint(text: string): string;
}

function wrapAnsi(ansi: string, text: string): string {
  return `${ansi}${text}${RESET}`;
}

function tryFg(theme: PaneThemeLike | undefined, key: ThemeColor, text: string): string | undefined {
  if (!theme) return undefined;
  try {
    return theme.fg(key, text);
  } catch {
    return undefined;
  }
}

function tryFgAnsi(theme: PaneThemeLike | undefined, keys: ThemeColor[]): string | undefined {
  if (!theme?.getFgAnsi) return undefined;
  for (const key of keys) {
    try {
      return theme.getFgAnsi(key);
    } catch {
      // try next
    }
  }
  return undefined;
}

function tryBgAnsi(theme: PaneThemeLike | undefined, keys: PaneThemeBg[]): string | undefined {
  if (!theme?.getBgAnsi) return undefined;
  for (const key of keys) {
    try {
      return theme.getBgAnsi(key);
    } catch {
      // try next
    }
  }
  return undefined;
}

function colorize(
  theme: PaneThemeLike | undefined,
  keys: ThemeColor[],
  fallbackAnsi: string,
  text: string,
): string {
  for (const key of keys) {
    const colored = tryFg(theme, key, text);
    if (colored !== undefined) return colored;
  }
  return wrapAnsi(fallbackAnsi, text);
}

export function bgAnsiToFgAnsi(bgAnsi: string): string {
  if (bgAnsi.startsWith("\x1b[48;")) {
    return bgAnsi.replace(/^\x1b\[48;/, "\x1b[38;").replace(/\x1b\[49m$/u, "\x1b[39m");
  }
  return FALLBACK_PANEL_EDGE;
}

export function resolvePanePalette(theme: PaneThemeLike | undefined): PiPanePalette {
  const panelBgAnsi = tryBgAnsi(theme, PANEL_BG_KEYS) ?? FALLBACK_PANEL_BG;

  return {
    panelBgAnsi,
    panelEdgeAnsi: bgAnsiToFgAnsi(panelBgAnsi),
    frame: (text: string) => colorize(theme, FRAME_FG_KEYS, FALLBACK_FRAME_FG, text),
    prefix: (text: string) => colorize(theme, PREFIX_FG_KEYS, FALLBACK_PREFIX_FG, text),
    time: (text: string) => colorize(theme, TIME_FG_KEYS, FALLBACK_TIME_FG, text),
    hint: (text: string) => colorize(theme, HINT_FG_KEYS, FALLBACK_HINT_FG, text),
  };
}

export function setThemeBgColor(
  theme: PaneThemeLike | undefined,
  key: PaneThemeBg,
  ansi: string,
): void {
  (theme as any)?.bgColors?.set(key, ansi);
}
