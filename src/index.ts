import type {
  ExtensionAPI,
  Theme,
  KeybindingsManager,
} from "@mariozechner/pi-coding-agent";
import type { TUI, EditorTheme } from "@mariozechner/pi-tui";
import { PiPaneEditor } from "./editor.js";
import { patchUserMessage } from "./message.js";

// Survives module reloads — Symbol.for() returns the same ref
const REAL_SET_EDITOR = Symbol.for("pi-pane:realSetEditor");

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

    const getTheme = () => (ctx.ui as any).theme as Theme;

    ctx.ui.setWorkingMessage("\u200b");
    patchUserMessage(getTheme, responseTimes);
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
