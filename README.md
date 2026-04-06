![pi-pane preview](.github/assets/preview.png)

<div align="center">

TUI extensions for [pi](https://pi.dev/), the minimal AI coding agent. Extensions are independently installable, theme-aware, and built around a single concern.

</div>

## Extensions

- [`prompt-pane`](./prompt-pane) — Framed input editor with a π prefix, corrected autocomplete alignment, and a double-press quit guard

## Install Extension

```bash
pi install git:github.com/visua1hue/pi-pane/prompt-pane
```

Try without install:

```bash
pi -e git:github.com/visua1hue/pi-pane/prompt-pane
```

## Development

Link the extension into pi's extensions directory, then edit and relaunch to iterate:

```bash
ln -s /path/to/pi-pane/prompt-pane ~/.pi/agent/extensions/pi-frame
```

TypeScript is transpiled on the fly — no build step required.

## Requirements

- [pi agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
