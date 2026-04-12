import type { EditorTheme } from "@mariozechner/pi-tui";

// ── ANSI constants ───────────────────────────────────────────────────────────

export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";

// ── Editor chrome ────────────────────────────────────────────────────────────

export const PI_STR = "  π ";
export const PI_WIDTH = PI_STR.length; // prefix column budget: 4
export const PI_SYMBOL_COL = PI_STR.indexOf("π"); // autocomplete indent: 2

export const AUTOCOMPLETE_CURSOR = "›"; // replaces pi-tui's hardcoded "→"
export const HINT_MARGIN_RIGHT = 3; // cols between hint text and right edge

// ── Panel background ────────────────────────────────────────────────────────

export const BG_PANEL = "\x1b[48;2;16;16;16m"; // neutral near-black
export const FG_PANEL = "\x1b[38;2;16;16;16m"; // matching foreground for edge blocks
export const PAD_X = 1; // 1 col padding each side

// ── Theme interface ──────────────────────────────────────────────────────────

// EditorTheme doesn't expose fg() publicly — this local extension grants access
// to the theme's named color resolver without importing internal pi types.
export interface ThemeWithFg extends EditorTheme {
  fg(colorKey: string, text: string): string;
}
