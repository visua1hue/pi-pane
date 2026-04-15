import type { Theme } from "@mariozechner/pi-coding-agent";
import { RESET, resolvePalette, setThemeBg } from "./visual.js";

// ── Constants ──────────────────────────────────────────────────────

const PATCHED = Symbol.for("pi-pane:userMsgPatched");
const OSC133_B = "\x1b]133;B\x07";
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
  const theme = getTheme();
  const p = resolvePalette(theme);
  setThemeBg(theme, "userMessageBg", p.panelBg);

  import("@mariozechner/pi-coding-agent").then(
    ({ UserMessageComponent }: any) => {
      if (UserMessageComponent[PATCHED]) return;
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
        setThemeBg(currentTheme, "userMessageBg", p.panelBg);

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
          timeLabel +
          p.panelBg +
          " ".repeat(Math.max(0, TIME_COL - timeStr.length - timeRight)) +
          " ".repeat(timeRight);
        const emptyTimeCol = p.panelBg + " ".repeat(TIME_COL);

        const firstContent = 2;

        for (let i = 1; i < lines.length; i++) {
          let line = lines[i]!;

          let oscSuffix = "";
          const oscPos = line.indexOf(OSC133_B);
          if (oscPos >= 0) {
            oscSuffix = line.slice(oscPos);
            line = line.slice(0, oscPos);
          }

          const col = i === firstContent && hasTime ? timeContent : emptyTimeCol;
          lines[i] = line + col + RESET + oscSuffix;
        }

        return lines;
      };
    },
  );
}
