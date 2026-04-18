![pi-pane preview](.github/assets/preview.png)

<div align="center">

UI extension for [pi](https://pi.dev/), the AI coding agent by [Mario Zechner](https://github.com/badlogic) and [Earendil](https://earendil.com).

</div>

## Features

<details>
  <summary>·· Preview (Expand)</summary>
  <video src="https://github.com/user-attachments/assets/e2029328-c352-4f7d-b0a8-6ff8bae524c4" controls></video>
</details>

- **Custom header** — animated logo with aligned, compact startup sections
- **Version check** — local vs latest pi version on startup
- **Origin prefixes** — `git:` / `npm:` source tags on extensions and skills
- **Framed editor** — bordered input with `pi` prefix and panel background
- **Response time** — per-message timing on user messages
- **Quit guard** — double-press to exit, single press clears input
- **Stable layout** — consistent width during LLM streaming
- **Theme-aware** — colors resolve from the active pi theme

## Requirements

- [pi](https://pi.dev/) **≤ v0.67.68**
- Terminal with [**24-bit truecolor**](#faq) support

## Install Extension

Install as a pi package:

```bash
pi install git:github.com/visua1hue/pi-pane
```

Try without installing:

```bash
pi -e git:github.com/visua1hue/pi-pane
```

## Local Development

Add to `~/.pi/agent/settings.json`:

```json
{
  "extensions": ["/path/to/pi-pane/src/index.ts"]
}
```

TypeScript is transpiled on the fly — no build step required.

## FAQ

**The intention behind pi-pane?**

Evolved from a prototype exploring pi and [pi-tui](https://github.com/badlogic/pi-mono/tree/main/packages/tui).

**Which terminals are supported?**

pi-pane requires 24-bit truecolor ANSI. To verify, run:

```bash
printf '\x1b[38;2;255;100;0mTRUECOLOR\x1b[0m\n'
```

If you see orange text, you're good. macOS Terminal.app, PuTTY, and the Linux TTY console lack truecolor support and will render incorrectly — use iTerm2, Ghostty, WezTerm, Kitty, Alacritty, Windows Terminal, or VS Code's integrated terminal instead.

## License

[MIT](LICENSE)
