# pi-pane

UI extensions for [pi](pi.dev), the minimal AI coding agent. Each extension is independently installable and focused on a single concern.

## Extensions

| Extension                      | What it does                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| [`prompt-pane`](./prompt-pane) | Box-framed input editor with a π prefix, corrected autocomplete alignment, and a double-press quit guard |

## Install an extension

```bash
pi install git:github.com/yourname/pi-pane#prompt-pane
```

Try without installing:

```bash
pi -e git:github.com/yourname/pi-pane#prompt-pane
```

## Design principles

- **One extension, one concern** — no cross-cutting behavior between extensions
- **Theme-aware** — colors follow your pi theme tokens, not hardcoded hex values
- **No dependencies** — install straight from git, no npm required
- **Zero side effects** — no background timers, no global state, no render loops

## Requirements

- [Pi Agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
