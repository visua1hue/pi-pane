![pi-pane preview](.github/assets/preview.png)

<div align="center">

Custom prompt editor pane for [pi](https://pi.dev/), the minimal AI coding agent.
Framed input with a π prefix, corrected autocomplete alignment, and a double-press quit guard.

</div>

## Install Extension

```bash
pi install git:github.com/visua1hue/pi-pane
```

Try without installing:

```bash
pi -e git:github.com/visua1hue/pi-pane
```

## Development

Link the extension into pi's extensions directory, then edit and relaunch to iterate:

```bash
ln -s /path/to/pi-pane/prompt-pane ~/.pi/agent/extensions/pi-frame
```

TypeScript is transpiled on the fly — no build step required.

## Requirements

- [pi agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
