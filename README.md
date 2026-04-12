![pi-pane preview](.github/assets/preview.png)

<div align="center">

Custom prompt editor pane for [pi](https://pi.dev/), the minimal AI coding agent.
Framed input with a `pi` prefix, panel background, user message styling with response time, and a double-press quit guard.

</div>

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
  "extensions": [
    "/path/to/pi-pane/src/index.ts"
  ]
}
```

TypeScript is transpiled on the fly — no build step required.

## Requirements

- [pi agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)

## License

MIT
