import type { ExtensionAPI, KeybindingsManager } from "@mariozechner/pi-coding-agent";
import type { TUI, EditorTheme } from "@mariozechner/pi-tui";
import { PiPaneEditor } from "./editor.js";

// Symbol.for() returns the same symbol across module reloads, so
// the stashed original survives even when pi re-evaluates this file.
const REAL_SET_EDITOR = Symbol.for("pi-pane:realSetEditor");

export default function piPaneExtension(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Retrieve the original, or stash it on first run
    const ui = ctx.ui as any;
    const realSetEditor: (factory: any) => void =
      ui[REAL_SET_EDITOR] ?? ctx.ui.setEditorComponent;
    ui[REAL_SET_EDITOR] = realSetEditor;

    ctx.ui.setWorkingMessage("\u200b");
    realSetEditor(
      (tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) =>
        new PiPaneEditor(tui, theme, keybindings, {
          isIdle: () => ctx.isIdle(),
          shutdown: () => ctx.shutdown(),
        }),
    );

    // Proxy: swallow any subsequent setEditorComponent calls from other
    // extensions so the frame is never replaced or broken by undefined.
    ctx.ui.setEditorComponent = () => {};
  });
}
