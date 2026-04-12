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
      const inner = width - 2;
      const superLines = super.render(width);

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
            width - PI_SYMBOL_COL,
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
            truncateToWidth(line, width - PI_WIDTH, "", true)
          );

        if (this.hintMessage) {
          const hint =
            this.fg("dim", this.hintMessage) + " ".repeat(HINT_MARGIN_RIGHT);
          return (
            piPrefix +
            truncateToWidth(
              line,
              width - PI_WIDTH - visibleWidth(hint),
              "",
              true,
            ) +
            hint
          );
        }
        return piPrefix + truncateToWidth(line, width - PI_WIDTH, "", true);
      });

      const spacer = autoLines.length > 0 ? [" ".repeat(width)] : [];
      return [topLine, ...midLines, ...spacer, ...autoLines, botLine];
    } catch (e) {
      console.error("PiPaneEditor render error:", e);
      throw e;
    }
  }
}
