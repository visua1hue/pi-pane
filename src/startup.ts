import { VERSION, type Theme } from "@mariozechner/pi-coding-agent";
import {
  Text,
  Spacer,
  Container,
  TUI,
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@mariozechner/pi-tui";

// ── Truecolor detection ─────────────────────────────────────────────────────

const TRUECOLOR = /truecolor|24bit/i.test(process.env.COLORTERM ?? "")
  || (process.env.TERM ?? "").includes("256color")
  || process.env.TERM_PROGRAM === "iTerm.app"
  || process.env.TERM_PROGRAM === "WezTerm"
  || process.env.TERM_PROGRAM === "vscode"
  || process.env.WT_SESSION !== undefined;

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "").trim();
}

function gray(level: number, text: string): string {
  const l = Math.max(0, Math.min(255, Math.floor(level)));
  return `\x1b[38;2;${l};${l};${l}m${text}\x1b[0m`;
}

function rgb(r: number, g: number, b: number, text: string): string {
  return `\x1b[38;2;${Math.floor(r)};${Math.floor(g)};${Math.floor(b)}m${text}\x1b[0m`;
}

function extractRgb(themed: string): [number, number, number] {
  const m = themed.match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
  return m ? [+m[1], +m[2], +m[3]] : [100, 100, 100];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Logo ────────────────────────────────────────────────────────────────────

const LOGO = [
  "██████  ",
  "██  ██  ",
  "████  ██",
  "██    ██",
];

const CHAR_FADE_FRAMES = 22;
const LOGO_SETTLE_FRAME = 70;

function getShinedLogo(frame: number): string[] {
  if (!TRUECOLOR) return LOGO;

  return LOGO.map((line, y) => {
    let result = "";
    for (let x = 0; x < line.length; x++) {
      const char = line[x];
      if (char === " ") { result += " "; continue; }

      // Diagonal stagger: top-left chars appear first
      const revealAt = (x * 1.2 + y * 3.5) * 1.4;
      const age = frame - revealAt;

      if (age <= 0) { result += " "; continue; }

      const t = Math.min(1, age / CHAR_FADE_FRAMES);
      const eased = 1 - (1 - t) * (1 - t);
      const brightness = Math.floor(lerp(50, 255, eased));
      result += gray(brightness, char);
    }
    return result;
  });
}

const LOGO_PAD = 2;
const LOGO_GAP = 4;

// ── Types ───────────────────────────────────────────────────────────────────

const SECTION_KEYS = ["Context", "Prompts", "Skills", "Extensions", "Themes"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];
type RenderSectionKey = SectionKey | "Version";

export interface ParsedSection {
  name: SectionKey;
  items: string[];
}

interface RenderSection {
  name: RenderSectionKey;
  items: string[];
}

export interface ListingRef {
  sections: ParsedSection[];
  frame: number;
  revealed: boolean;
  revealedAt: number;
  latestVersion?: string;
  settled: boolean;
  cachedLines?: string[];
  cachedWidth?: number;
}

// ── Symbols (survive hot-reload) ───────────────────────────────────────────

const PATCHED_LISTING = Symbol.for("pi-pane:listingPatched");
const LISTING_REF = Symbol.for("pi-pane:listingRef");
const ANIM_INTERVAL = Symbol.for("pi-pane:animInterval");
const DEBOUNCE_TIMER = Symbol.for("pi-pane:debounceTimer");

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_RENDER_WIDTH = 9999;
const REVEAL_DEBOUNCE_MS = 150;
const RAMP_FRAMES = 22;
const STAGGER_FRAMES = 0;
const BASE_FADE_DELAY = 3;
const MAX_STAGGER = BASE_FADE_DELAY + 5 * STAGGER_FRAMES; // base delay + max section index

// ── Version fetch ──────────────────────────────────────────────────────────

const NPM_REGISTRY_URL = "https://registry.npmjs.org/@mariozechner/pi-coding-agent/latest";
const FETCH_TIMEOUT_MS = 4000;

async function fetchLatestVersion(): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(NPM_REGISTRY_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { version?: string };
    return data.version;
  } catch {
    return undefined;
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

// ── Header renderer ─────────────────────────────────────────────────────────

export function renderHeader(theme: Theme, ref: ListingRef, width: number): string[] {
  const dim = (t: string) => theme.fg("dim", t);
  const accent = (t: string) => theme.fg("accent", t);

  const logoLines = getShinedLogo(ref.frame);

  // Use cached text lines if settled (no more animations)
  const logoW = LOGO_PAD + visibleWidth(LOGO[0]) + LOGO_GAP;
  let listingLines: string[];

  if (ref.settled && ref.cachedLines && ref.cachedWidth === width) {
    listingLines = ref.cachedLines;
  } else {
    const sectionsToRender: RenderSection[] = [];

    if (!ref.revealed) {
      if (TRUECOLOR) {
        const pulse = Math.sin(ref.frame / 18) * 0.5 + 0.5;
        const b = Math.floor(40 + pulse * 35);
        const dots = gray(b, "···");
        sectionsToRender.push({ name: "Version", items: [dots] });
        for (const key of SECTION_KEYS) sectionsToRender.push({ name: key, items: [dots] });
      } else {
        const dots = dim("···");
        sectionsToRender.push({ name: "Version", items: [dots] });
        for (const key of SECTION_KEYS) sectionsToRender.push({ name: key, items: [dots] });
      }
    } else {
      const latest = ref.latestVersion ?? VERSION;
      const hasUpdate = compareVersions(latest, VERSION) > 0;
      const latestStr = hasUpdate ? `Latest: ${accent("v" + latest)}` : `Latest: v${latest}`;
      sectionsToRender.push({ name: "Version", items: [`Local: v${VERSION}`, latestStr] });

      // Display sections in SECTION_KEYS order, fill missing with placeholder
      const byName = new Map(ref.sections.map(s => [s.name, s]));
      for (const key of SECTION_KEYS) {
        const sec = byName.get(key);
        sectionsToRender.push(sec ?? { name: key, items: [dim("—")] });
      }
    }

    listingLines = formatColumns(sectionsToRender, theme, width - logoW, ref);

    // Cache once text animations are done
    const textAge = ref.revealed ? ref.frame - ref.revealedAt : 0;
    const textDone = ref.revealed && textAge > RAMP_FRAMES + MAX_STAGGER;
    const logoDone = ref.frame >= LOGO_SETTLE_FRAME;

    if (textDone && logoDone) {
      ref.settled = true;
      ref.cachedLines = listingLines;
      ref.cachedWidth = width;
    }
  }

  const result: string[] = ["", ""];

  for (let i = -1; i < Math.max(logoLines.length, listingLines.length); i++) {
    const logoRow = logoLines[i] ?? "";
    const listRow = listingLines[i + 1] ?? "";
    const left = " ".repeat(LOGO_PAD) + pad(logoRow, LOGO[0].length);
    const line = `${left}${" ".repeat(LOGO_GAP)}${listRow}`;
    result.push(truncateToWidth(line, width));
  }

  // Fixed height — Pi doesn't clear below the header when height changes,
  // so we must pad to a constant to prevent ghost lines from shorter renders.
  const HEADER_LINES = 11;
  while (result.length < HEADER_LINES) result.push("");
  return result;
}

function pad(s: string, w: number): string {
  const vw = visibleWidth(s);
  return vw >= w ? s : s + " ".repeat(w - vw);
}

// ── Column formatter ────────────────────────────────────────────────────────

function formatColumns(sections: RenderSection[], theme: Theme, maxW: number, ref: ListingRef): string[] {
  if (sections.length === 0) return [];

  const dim = (t: string) => theme.fg("dim", t);
  const muted = (t: string) => theme.fg("muted", t);

  const headerW = Math.max(...sections.map(s => s.name.length + 2)) + 2;

  const age = ref.revealed ? ref.frame - ref.revealedAt : 0;

  // RGB interpolation only when truecolor + actively ramping
  let startRgb: [number, number, number] | undefined;
  let mutedRgb: [number, number, number] | undefined;
  if (TRUECOLOR && ref.revealed && age < RAMP_FRAMES + MAX_STAGGER) {
    startRgb = extractRgb(theme.fg("dim", " "));
    mutedRgb = extractRgb(theme.fg("muted", " "));
  }

  const lines: string[] = [];

  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    if (sec.items.length === 0) continue;

    // Labels are always static dim — never re-animated
    const header = dim(`[${sec.name}]`);
    const paddedHeader = header + " ".repeat(Math.max(0, headerW - sec.name.length - 2));
    const availableW = maxW - headerW - 1;

    // Item color: smooth ramp if truecolor + animating, otherwise straight to muted
    const sectionAge = Math.max(0, age - BASE_FADE_DELAY - si * STAGGER_FRAMES);
    const wrapItems = buildItemWrapper(sectionAge, ref.revealed, startRgb, mutedRgb, muted);

    let currentLine = "";
    let firstLine = true;

    for (const item of sec.items) {
      const itemW = visibleWidth(item);
      const currentW = visibleWidth(currentLine);

      if (currentLine && currentW + 2 + itemW > availableW) {
        lines.push(firstLine ? `${paddedHeader} ${wrapItems(currentLine)}` : " ".repeat(headerW + 1) + wrapItems(currentLine));
        currentLine = item;
        firstLine = false;
      } else {
        currentLine = currentLine ? currentLine + "  " + item : item;
      }
    }
    if (currentLine) {
      lines.push(firstLine ? `${paddedHeader} ${wrapItems(currentLine)}` : " ".repeat(headerW + 1) + wrapItems(currentLine));
    }

    if (sec.name === "Version") {
      lines.push("");
    }
  }

  return lines;
}

function buildItemWrapper(
  sectionAge: number,
  revealed: boolean,
  startRgb: [number, number, number] | undefined,
  mutedRgb: [number, number, number] | undefined,
  muted: (t: string) => string,
): (text: string) => string {
  if (!revealed) return (text) => text; // placeholders already styled

  // No truecolor or ramp done → static muted
  if (!startRgb || !mutedRgb || sectionAge >= RAMP_FRAMES) return muted;

  const t = Math.min(1, sectionAge / RAMP_FRAMES);
  const eased = 1 - (1 - t) * (1 - t);
  const r = lerp(startRgb[0], mutedRgb[0], eased);
  const g = lerp(startRgb[1], mutedRgb[1], eased);
  const b = lerp(startRgb[2], mutedRgb[2], eased);
  return (text) => rgb(r, g, b, text);
}

// ── Listing interceptor ─────────────────────────────────────────────────────

function detectSection(plain: string): SectionKey | undefined {
  for (const key of SECTION_KEYS) {
    if (plain.includes(`[${key}]`)) return key;
  }
  return undefined;
}

function parseSectionText(plain: string): ParsedSection | undefined {
  const sectionName = detectSection(plain);
  if (!sectionName) return undefined;

  const names: string[] = [];
  const lines = plain.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("[")) continue;
    if (/^(user|project|path)$/.test(trimmed)) continue;

    if (/^(index\.(ts|js)|src|dist|out|build|lib|bin)$/i.test(trimmed)) continue;
    if (trimmed.endsWith("index.js") || trimmed.endsWith("index.ts")) {
       if (trimmed.split("/").length <= 2 && /^(dist|src|out|lib|bin)/.test(trimmed)) continue;
    }

    const name = extractName(trimmed, sectionName);
    if (name) names.push(name);
  }

  return { name: sectionName, items: [...new Set(names.filter(n => !/^(index|dist|src|out|lib|bin)$/i.test(n)))] };
}

function extractName(path: string, section: string): string {
  if (section === "Prompts") return path.trim();

  const trimmed = path.trim();

  if (section === "Skills" && trimmed.includes("/")) {
    const parts = trimmed.split("/");
    const file = parts.pop() ?? "";
    if (/^SKILL\.(md|ts|js)$/i.test(file)) {
      return parts.pop() ?? file;
    }
    return file.replace(/\.(ts|js|md)$/, "");
  }

  if (section === "Context") {
    return trimmed.split("/").pop() ?? trimmed;
  }

  if (section === "Extensions") {
    if (/^(git:|npm:|https?:)/.test(trimmed)) {
      const parts = trimmed.split("/");
      const last = parts.pop() || "";
      return last.replace(/\.(ts|js)$/, "");
    }

    const parts = trimmed.split("/").filter(p => {
      const lower = p.toLowerCase();
      return p && !/^(index\.(ts|js)|src|dist|out|build|lib|bin)$/.test(lower);
    });

    if (parts.length > 0) {
      const name = parts.pop()!;
      return name.replace(/\.(ts|js|json|md)$/i, "");
    }

    return trimmed;
  }

  const base = trimmed.split("/").pop() ?? trimmed;
  return base.replace(/\.(ts|js|json|md)$/, "");
}

// ── Chat container discovery ────────────────────────────────────────────────

// Fragile: relies on TUI child ordering (header, chat, footer) which is an
// internal layout detail of pi's InteractiveMode. If upstream changes the
// child structure, this will need updating.
function findChatContainer(tui: TUI): Container | undefined {
  for (const child of tui.children) {
    if (child instanceof Container && child.constructor.name.includes("Scrollable")) {
      return child;
    }
  }
  if (tui.children.length >= 3) {
    return tui.children[1] as Container;
  }
  return undefined;
}

export function patchStartupListing(
  tui: TUI,
  _theme: Theme,
  ref: ListingRef,
): void {
  const chat = findChatContainer(tui);
  if (!chat) return;
  const cc = chat as any;

  // Always update ref + restart animation (critical for /reload)
  cc[LISTING_REF] = ref;
  ref.frame = 0;
  ref.revealed = false;
  ref.revealedAt = 0;
  ref.settled = false;
  ref.cachedLines = undefined;
  ref.cachedWidth = undefined;

  if (cc[ANIM_INTERVAL]) clearInterval(cc[ANIM_INTERVAL]);
  if (cc[DEBOUNCE_TIMER]) clearTimeout(cc[DEBOUNCE_TIMER]);

  cc[ANIM_INTERVAL] = setInterval(() => {
    const current: ListingRef = cc[LISTING_REF];
    current.frame++;

    // Stop interval once everything is settled
    if (current.settled && current.frame >= LOGO_SETTLE_FRAME) {
      clearInterval(cc[ANIM_INTERVAL]);
      cc[ANIM_INTERVAL] = null;
      return;
    }

    tui.requestRender();
  }, 16);

  // Fetch latest version from npm
  fetchLatestVersion().then(v => {
    if (v) {
      const current: ListingRef = cc[LISTING_REF];
      current.latestVersion = v;
      // Invalidate cache so version updates on next render
      current.cachedLines = undefined;
      current.settled = false;
    }
  });

  // Only patch addChild once — the closure reads cc[LISTING_REF] dynamically
  if (cc[PATCHED_LISTING]) {
    chat.clear();
    return;
  }
  cc[PATCHED_LISTING] = true;

  const origAddChild = chat.addChild.bind(chat);
  chat.clear();

  chat.addChild = (component: Component) => {
    const currentRef: ListingRef = cc[LISTING_REF];

    if (component instanceof Text) {
      const rendered = component.render(MAX_RENDER_WIDTH);
      const plain = stripAnsi(rendered.join("\n"));

      const section = parseSectionText(plain);
      if (section) {
        const existing = currentRef.sections.find(s => s.name === section.name);
        if (existing) {
          existing.items = [...new Set([...existing.items, ...section.items])];
        } else {
          currentRef.sections.push(section);
        }

        // Invalidate cache so late-arriving sections show up
        currentRef.settled = false;
        currentRef.cachedLines = undefined;

        if (currentRef.revealed) {
          // Already revealed — show new section immediately
          tui.requestRender();
        } else {
          // Batch initial sections — reset debounce on each arrival
          if (cc[DEBOUNCE_TIMER]) clearTimeout(cc[DEBOUNCE_TIMER]);
          cc[DEBOUNCE_TIMER] = setTimeout(() => {
            const ref: ListingRef = cc[LISTING_REF];
            ref.revealed = true;
            ref.revealedAt = ref.frame;
            tui.requestRender();
            cc[DEBOUNCE_TIMER] = null;
          }, REVEAL_DEBOUNCE_MS);
        }

        return;
      }

      if (
        plain.includes("Listing all available commands") ||
        plain.includes("(Source: extension)") ||
        plain.trim().startsWith("/skill:")
      ) {
        return;
      }
    }

    if (component instanceof Spacer) return;
    origAddChild(component);
  };
}
