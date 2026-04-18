import type { Theme, UserMessageComponent } from "@mariozechner/pi-coding-agent";
import { RESET, resolvePalette, setThemeBg } from "./visual.js";

type UserMsgCtor = typeof UserMessageComponent & { [PATCHED]?: boolean };

// ── Constants ──────────────────────────────────────────────────────

const PATCHED = Symbol.for("pi-pane:userMsgPatched");
// Match OSC133 B (zone end) or C (zone final). v0.67 moved these from line
// tail to line head — we strip from wherever they sit and re-emit at the end.
const OSC133_RE = /\x1b\]133;[BC]\x07/g;
const MSG_PADDING_X = 3;
const TIME_COL = 9;

// ── Instance tracking ──────────────────────────────────────────────

const instanceIndex = new WeakMap<object, number>();
let instanceCount = 0;

export function resetInstanceCount(): void {
  instanceCount = 0;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

// ── Patch ──────────────────────────────────────────────────────────

export function patchUserMessage(
  getTheme: () => Theme,
  responseTimes: number[],
): void {
  let lastBg = "";
  const theme = getTheme();
  const p = resolvePalette(theme);
  lastBg = p.panelBg;
  setThemeBg(theme, "userMessageBg", lastBg);

  import("@mariozechner/pi-coding-agent").then(
    ({ UserMessageComponent }: { UserMessageComponent: UserMsgCtor }) => {
      if (UserMessageComponent[PATCHED]) return;

      if (
        typeof UserMessageComponent.prototype.addChild !== "function" ||
        typeof UserMessageComponent.prototype.render !== "function"
      ) {
        console.warn("[pi-pane] UserMessageComponent shape changed — skipping patch");
        return;
      }

      UserMessageComponent[PATCHED] = true;

      const origAddChild = UserMessageComponent.prototype.addChild;
      UserMessageComponent.prototype.addChild = function (child: any) {
        if (child.paddingX !== undefined && !child._piPanePatched) {
          child.paddingX = MSG_PADDING_X;
          child._piPanePatched = true;
        }
        if (!instanceIndex.has(this)) {
          instanceIndex.set(this, instanceCount++);
        }
        return origAddChild.call(this, child);
      };

      const origRender = UserMessageComponent.prototype.render;
      UserMessageComponent.prototype.render = function (
        width: number,
      ): string[] {
        const currentTheme = getTheme();
        const p = resolvePalette(currentTheme);
        const bg = p.panelBg;
        if (bg !== lastBg) { setThemeBg(currentTheme, "userMessageBg", bg); lastBg = bg; }

        const idx = instanceIndex.get(this);
        const elapsed = idx !== undefined ? responseTimes[idx] : 0;
        const hasTime = idx !== undefined;

        const contentWidth = width - TIME_COL;
        const lines: string[] = origRender.call(this, contentWidth);
        if (lines.length < 3) return lines;

        const timeStr = elapsed > 0 ? formatTime(elapsed) : "";
        const timeRight = 2;
        const timeLabel = timeStr.length > 0 ? p.time(timeStr) : "";
        const timeContent =
          p.panelBg +
          timeLabel +
          p.panelBg +
          " ".repeat(Math.max(0, TIME_COL - timeStr.length - timeRight)) +
          " ".repeat(timeRight);
        const emptyTimeCol = p.panelBg + " ".repeat(TIME_COL);

        const firstContent = 1;

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i]!;

          // Extract any OSC133 B/C markers (shell zone end/final). v0.67 placed
          // these at the head of the last line; older versions at the tail.
          // Strip them from the content line; re-emit after the time column.
          const oscMatches = line.match(OSC133_RE);
          const oscSuffix = oscMatches ? oscMatches.join("") : "";
          if (oscSuffix) line = line.replace(OSC133_RE, "");

          const col = i === firstContent && hasTime ? timeContent : emptyTimeCol;
          lines[i] = line + col + RESET + oscSuffix;
        }

        return idx === 0 ? ["", ...lines] : lines;
      };
    },
  );
}
