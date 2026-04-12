import {
  CustomEditor,
  type KeybindingsManager,
} from "@mariozechner/pi-coding-agent";
import {
  type TUI,
  type EditorTheme,
  truncateToWidth,
  isKeyRelease,
  visibleWidth,
} from "@mariozechner/pi-tui";

import {
  RESET,
  BOLD,
  BG_PANEL,
  FG_PANEL,
  PAD_X,
  PI_STR,
  PI_WIDTH,
  PI_SYMBOL_COL,
  AUTOCOMPLETE_CURSOR,
  HINT_MARGIN_RIGHT,
  type ThemeWithFg,
} from "./visual.js";
import { isParentBorder, formatKey } from "./utils.js";

const DOUBLE_PRESS_WINDOW_MS = 500;

export class PiPaneEditor extends CustomEditor {
  private readonly piTheme: ThemeWithFg;
  private readonly piKeybindings: KeybindingsManager;
  private readonly isIdle: () => boolean;
  private readonly shutdown: () => void;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;
  private hintMessage: string | undefined;
  private pendingQuitUntil = 0;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    { isIdle, shutdown }: { isIdle: () => boolean; shutdown: () => void },
  ) {
    super(tui, theme, keybindings);
    this.piTheme = theme as ThemeWithFg;
    this.piKeybindings = keybindings;
    this.isIdle = isIdle;
    this.shutdown = shutdown;
  }

  private fg(key: string, text: string): string {
    try {
      return this.piTheme.fg(key, text);
    } catch {
      return text;
    }
  }

  // ── Quit hint ─────────────────────────────────────────────────────

  private clearHint(resetWindow = true): void {
    clearTimeout(this.hintTimer);
    this.hintTimer = undefined;
    this.hintMessage = undefined;
    if (resetWindow) this.pendingQuitUntil = 0;
    this.tui.requestRender();
  }

  private showHint(message: string): void {
    this.clearHint(false);
    this.hintMessage = message;
    this.tui.requestRender();
    this.hintTimer = setTimeout(() => {
      this.hintMessage = undefined;
      this.hintTimer = undefined;
      this.pendingQuitUntil = 0;
      this.tui.requestRender();
    }, DOUBLE_PRESS_WINDOW_MS);
  }

  // ── Input ─────────────────────────────────────────────────────────

  override handleInput(data: string): void {
    if (isKeyRelease(data)) {
      super.handleInput(data);
      return;
    }

    if (!this.piKeybindings.matches(data, "app.clear")) {
      this.clearHint();
      super.handleInput(data);
      return;
    }

    const now = Date.now();

    if (this.getText().length > 0) {
      this.clearHint();
      this.pendingQuitUntil = now + DOUBLE_PRESS_WINDOW_MS;
      this.setText("");
      return;
    }

    if (!this.isIdle()) {
      this.clearHint();
      super.handleInput(data);
      return;
    }

    if (this.pendingQuitUntil > 0 && now <= this.pendingQuitUntil) {
      this.clearHint();
      this.shutdown();
      return;
    }

    this.pendingQuitUntil = now + DOUBLE_PRESS_WINDOW_MS;
    this.showHint(
      `${formatKey(this.piKeybindings.getKeys("app.clear")[0])} to quit`,
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  override render(width: number): string[] {
    try {
      const cw = width - PAD_X * 2; // content width inside padding
      const inner = cw - 2;
      const superLines = super.render(cw);

      let bottomIdx = superLines.length - 1;
      for (let i = superLines.length - 1; i >= 1; i--) {
        if (isParentBorder(superLines[i]!)) {
          bottomIdx = i;
        }
      }
      const contentLines = superLines.slice(1, bottomIdx);
      const autoLines = superLines.slice(bottomIdx + 1).map(
        (line) =>
          " ".repeat(PI_SYMBOL_COL) +
          truncateToWidth(
            line.replace("→", AUTOCOMPLETE_CURSOR),
            cw - PI_SYMBOL_COL,
            "",
            true,
          ),
      );

      const border = (ch: string) => this.fg("borderMuted", ch);
      const topLine =
        border("┌") + border("─".repeat(inner)) + border("┐") + RESET;
      const botLine =
        border("└") + border("─".repeat(inner)) + border("┘") + RESET;

      const piPrefix = BOLD + this.fg("borderMuted", PI_STR) + RESET;

      const midLines = contentLines.map((line, i) => {
        if (i !== 0)
          return (
            " ".repeat(PI_WIDTH) +
            truncateToWidth(line, cw - PI_WIDTH, "", true)
          );

        if (this.hintMessage) {
          const hint =
            this.fg("dim", this.hintMessage) + " ".repeat(HINT_MARGIN_RIGHT);
          return (
            piPrefix +
            truncateToWidth(
              line,
              cw - PI_WIDTH - visibleWidth(hint),
              "",
              true,
            ) +
            hint
          );
        }
        return piPrefix + truncateToWidth(line, cw - PI_WIDTH, "", true);
      });

      const spacer = autoLines.length > 0 ? [" ".repeat(cw)] : [];
      const raw = [topLine, ...midLines, ...spacer, ...autoLines, botLine];

      // ── Wrap with panel background ──────────────────────────────────
      const pad = " ".repeat(PAD_X);
      const wrap = (line: string): string => {
        const patched = line.replaceAll(RESET, RESET + BG_PANEL);
        return BG_PANEL + pad + patched + pad + RESET;
      };

      // Thin edge rows: ▁ top (1/8 bottom), ▔ bottom (1/8 top)
      const topEdge = FG_PANEL + "▁".repeat(width) + RESET;
      const botEdge = FG_PANEL + "▔".repeat(width) + RESET;

      return [topEdge, ...raw.map(wrap), botEdge];
    } catch (e) {
      console.error("PiPaneEditor render error:", e);
      throw e;
    }
  }
}
