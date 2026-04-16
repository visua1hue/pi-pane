import type {
  ExtensionAPI,
  Theme,
  KeybindingsManager,
} from "@mariozechner/pi-coding-agent";
import { Spacer, type TUI, type EditorTheme } from "@mariozechner/pi-tui";
import { PiPaneEditor } from "./editor.js";
import { patchUserMessage } from "./message.js";
import { renderHeader, patchStartupListing, type ListingRef } from "./startup.js";

// Survives module reloads — Symbol.for() returns the same ref
const REAL_SET_EDITOR = Symbol.for("pi-pane:realSetEditor");

const g = globalThis as any;

// ── Intercept "Model scope:" console.log before InteractiveMode starts ─────
const MODEL_SCOPE_RE = /Model scope:\s*(.+)/;
const CAPTURED_MODELS = Symbol.for("pi-pane:capturedModels");
const PATCHED_LOG = Symbol.for("pi-pane:logPatched");

if (!g[PATCHED_LOG]) {
  g[PATCHED_LOG] = true;
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    if (args.length === 1 && typeof args[0] === "string") {
      const plain = args[0].replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      const m = MODEL_SCOPE_RE.exec(plain);
      if (m) {
        const raw = m[1].replace(/\s*\(Ctrl\+\w[\w\s]*\)/gi, "");
        g[CAPTURED_MODELS] = raw.split(",").map((s: string) => s.trim()).filter(Boolean);
        return; // suppress
      }
    }
    origLog.apply(console, args);
  };
}

export default function piPaneExtension(pi: ExtensionAPI) {
  const responseTimes: number[] = [];
  let turnStartMs = 0;

  pi.on("turn_start", () => {
    turnStartMs = Date.now();
    responseTimes.push(0);
  });

  pi.on("turn_end", () => {
    if (responseTimes.length > 0) {
      responseTimes[responseTimes.length - 1] = Date.now() - turnStartMs;
    }
  });

  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    const ui = ctx.ui as any;
    const realSetEditor: (factory: any) => void =
      ui[REAL_SET_EDITOR] ?? ctx.ui.setEditorComponent;
    ui[REAL_SET_EDITOR] = realSetEditor;

    const getTheme = () => ui.theme as Theme;

    ctx.ui.setWorkingMessage("\u200b");
    patchUserMessage(getTheme, responseTimes);

    // Custom header + intercept TUI ref for listing patch
    const capturedModels: string[] | undefined = g[CAPTURED_MODELS];
    const initialSections = capturedModels?.length
      ? [{ name: "Models" as const, items: capturedModels }]
      : [];
    const listingRef: ListingRef = { sections: initialSections, frame: 0, revealed: false, revealedAt: 0, scaffoldAt: 0, settled: false };
    ctx.ui.setHeader((tui, theme) => {

      // Neuter the built-in header so /reload doesn't flash keybinding hints.
      // On reset, pi restores builtInHeader into headerContainer — if its
      // render returns empty, the flash is invisible.
      const hc = tui.children[0] as any;
      if (hc?.children) {
        for (const child of hc.children) {
          if (child instanceof Spacer) continue;
          if ((child as any)._piPane) continue;
          child.render = () => [""];
        }
      }

      patchStartupListing(tui, theme, listingRef);
      return {
        _piPane: true,
        render: (w: number) => renderHeader(theme, listingRef, w),
        invalidate() {},
        dispose() {},
      } as any;
    });

    realSetEditor(
      (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) =>
        new PiPaneEditor(tui, theme, keybindings, {
          getTheme,
          isIdle: () => ctx.isIdle(),
          shutdown: () => ctx.shutdown(),
        }),
    );

    // Prevent other extensions from replacing the editor
    ctx.ui.setEditorComponent = () => {};
  });
}
