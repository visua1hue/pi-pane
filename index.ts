import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  type TUI,
  type KeybindingsManager,
  type EditorTheme,
  truncateToWidth,
  isKeyRelease,
  visibleWidth,
} from "@mariozechner/pi-tui";

// ── Constants ─────────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const PI_STR = "  π ";
const PI_WIDTH = PI_STR.length; // prefix column budget: 4
const PI_SYMBOL_COL = PI_STR.indexOf("π"); // autocomplete indent: 2

const AUTOCOMPLETE_CURSOR = "›"; // replaces pi-tui's hardcoded "→"
const DOUBLE_PRESS_WINDOW_MS = 500; // time window for Ctrl+C double-press
const HINT_MARGIN_RIGHT = 3; // cols between hint text and right edge

// ── Helpers ───────────────────────────────────────────────────────────────────

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const isParentBorder = (s: string) => {
  const clean = stripAnsi(s);
  return clean.length > 0 && clean[0] === "─";
};

function formatKey(key: string | undefined): string {
  if (!key) return "that key";
  return key
    .split("+")
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "ctrl") return "Ctrl";
      if (lower === "alt") return "Alt";
      if (lower === "shift") return "Shift";
      if (lower === "cmd" || lower === "meta") return "Cmd";
      return part.length === 1
        ? part.toUpperCase()
        : part[0]!.toUpperCase() + part.slice(1);
    })
    .join("+");
}

// ── Theme interface ───────────────────────────────────────────────────────────

// EditorTheme doesn't expose fg() publicly — this local extension grants access
// to the theme's named color resolver without importing internal pi types.
interface ThemeWithFg extends EditorTheme {
  fg(colorKey: string, text: string): string;
}

// ── Editor ────────────────────────────────────────────────────────────────────

class PiFrameEditor extends CustomEditor {
  private readonly theme: ThemeWithFg;
  private readonly keybindings: KeybindingsManager;
  private readonly isIdle: () => boolean;
  private readonly shutdown: () => void;

  // Quit-on-double-press state
  private pendingQuitUntil = 0;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;
  private hintMessage: string | undefined;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    { isIdle, shutdown }: { isIdle: () => boolean; shutdown: () => void },
  ) {
    super(tui, theme, keybindings);
    this.theme = theme as ThemeWithFg;
    this.keybindings = keybindings;
    this.isIdle = isIdle;
    this.shutdown = shutdown;
  }

  private fg(key: string, text: string): string {
    try {
      return this.theme.fg(key, text);
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
    // Key-release events carry no semantic value — pass through immediately
    if (isKeyRelease(data)) {
      super.handleInput(data);
      return;
    }

    // Non-clear keys reset the quit window and pass through normally
    if (!this.keybindings.matches(data, "app.clear")) {
      this.clearHint();
      super.handleInput(data);
      return;
    }

    const now = Date.now();

    // First press with content: clear the editor (standard Ctrl+C behaviour)
    if (this.getText().length > 0) {
      this.clearHint();
      this.pendingQuitUntil = now + DOUBLE_PRESS_WINDOW_MS;
      this.setText("");
      return;
    }

    // Never quit while the agent is running
    if (!this.isIdle()) {
      this.clearHint();
      super.handleInput(data);
      return;
    }

    // Second press within window: quit
    if (this.pendingQuitUntil > 0 && now <= this.pendingQuitUntil) {
      this.clearHint();
      this.shutdown();
      return;
    }

    // First press on empty editor: open quit window and show hint
    this.pendingQuitUntil = now + DOUBLE_PRESS_WINDOW_MS;
    this.showHint(
      `${formatKey(this.keybindings.getKeys("app.clear")[0])} to quit`,
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  override render(width: number): string[] {
    const inner = width - 2;

    // Render at full width so the parent's lastWidth stays correct for
    // cursor navigation and word-wrap. We post-process lines below.
    const superLines = super.render(width);

    // Split parent output into: [top border] [content] [bottom border] [autocomplete]
    let bottomIdx = superLines.length - 1;
    for (let i = superLines.length - 1; i >= 1; i--) {
      if (isParentBorder(superLines[i]!)) {
        bottomIdx = i;
        break;
      }
    }
    const contentLines = superLines.slice(1, bottomIdx);
    const autoLines = superLines.slice(bottomIdx + 1).map(
      (line) =>
        // Indent autocomplete to align under π, replace hardcoded arrow cursor
        " ".repeat(PI_SYMBOL_COL) +
        truncateToWidth(
          line.replace("→", AUTOCOMPLETE_CURSOR),
          width - PI_SYMBOL_COL,
          "",
          true,
        ),
    );

    // Box borders using theme color — adapts automatically on theme switch
    const border = (ch: string) => this.fg("borderMuted", ch);
    const topLine =
      border("┌") + border("─".repeat(inner)) + border("┐") + RESET;
    const botLine =
      border("└") + border("─".repeat(inner)) + border("┘") + RESET;

    // π prefix: bold + borderMuted color so it reads as part of the frame
    const piPrefix = BOLD + this.fg("borderMuted", PI_STR) + RESET;

    const midLines = contentLines.map((line, i) => {
      // Continuation lines: indent to match π prefix width
      if (i !== 0)
        return (
          " ".repeat(PI_WIDTH) +
          truncateToWidth(line, width - PI_WIDTH, "", true)
        );

      // First line: π prefix + content, with optional right-aligned hint
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

    // Spacer between input and autocomplete dropdown when list is visible
    const spacer = autoLines.length > 0 ? [" ".repeat(width)] : [];
    return [topLine, ...midLines, ...spacer, ...autoLines, botLine];
  }
}

// ── Extension entry point ─────────────────────────────────────────────────────

export default function piFrameExtension(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return; // no-op in headless / SDK mode

    // Zero-width space suppresses the default working indicator text
    ctx.ui.setWorkingMessage("\u200b");

    ctx.ui.setEditorComponent(
      (tui, theme, keybindings) =>
        new PiFrameEditor(tui, theme, keybindings, {
          isIdle: () => ctx.isIdle(),
          shutdown: () => ctx.shutdown(),
        }),
    );
  });
}
