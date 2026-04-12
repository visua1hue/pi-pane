import { BG_PANEL, RESET, FG_ACCENT } from "./visual.js";

const PATCHED = Symbol.for("pi-pane:userMsgPatched");
const OSC133_B = "\x1b]133;B\x07";
const MSG_PADDING_X = 3;
const TIME_COL = 9; // fixed width for response time column

// Track instance creation order → maps to turn index
const instanceIndex = new WeakMap<object, number>();
let instanceCount = 0;

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

/**
 * Override user-message background to match the editor panel,
 * widen horizontal padding, and show response time as a
 * right-aligned column on the first content line.
 */
export function patchUserMessage(
  themeInstance: any,
  responseTimes: number[],
): void {
  themeInstance.bgColors.set("userMessageBg", BG_PANEL);

  import("@mariozechner/pi-coding-agent").then(
    ({ UserMessageComponent }: any) => {
      if (UserMessageComponent[PATCHED]) return;
      UserMessageComponent[PATCHED] = true;

      // Widen Markdown padding + tag instance with turn index
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
        const idx = instanceIndex.get(this);
        const elapsed = idx !== undefined ? responseTimes[idx] : 0;
        const hasTime = idx !== undefined;

        // Render narrower to reserve time column, so text wraps correctly
        const contentWidth = hasTime ? width - TIME_COL : width;
        const lines: string[] = origRender.call(this, contentWidth);
        if (lines.length < 3 || !hasTime) return lines;

        // Build time column content
        const timeStr = elapsed > 0 ? formatTime(elapsed) : "";
        const timeRight = 2; // right margin inside time column
        const timeContent =
          FG_ACCENT +
          timeStr +
          RESET +
          BG_PANEL +
          " ".repeat(Math.max(0, TIME_COL - timeStr.length - timeRight)) +
          " ".repeat(timeRight);
        const emptyTimeCol = BG_PANEL + " ".repeat(TIME_COL);

        // lines[0] = spacer (no bg), lines[1] = paddingY top, lines[2] = first content
        const firstContent = 2;

        for (let i = 1; i < lines.length; i++) {
          let line = lines[i]!;

          // Preserve OSC 133 end markers on last line
          let oscSuffix = "";
          const oscPos = line.indexOf(OSC133_B);
          if (oscPos >= 0) {
            oscSuffix = line.slice(oscPos);
            line = line.slice(0, oscPos);
          }

          const col =
            i === firstContent ? timeContent : emptyTimeCol;
          lines[i] = line + col + RESET + oscSuffix;
        }

        return lines;
      };
    },
  );
}
