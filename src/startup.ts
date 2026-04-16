import { VERSION, type Theme } from "@mariozechner/pi-coding-agent";
import { resetInstanceCount } from "./message.js";
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

const SECTION_KEYS = ["Models", "Context", "Prompts", "Skills", "Extensions", "Themes"] as const;
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
  scaffoldAt: number;
  latestVersion?: string;
  settled: boolean;
  cachedLines?: string[];
  cachedWidth?: number;
  maxHeaderHeight?: number;
}

// ── Symbols (survive hot-reload) ───────────────────────────────────────────

const PATCHED_CLEAR = Symbol.for("pi-pane:clearPatched");
const PATCHED_LISTING = Symbol.for("pi-pane:listingPatched");
const LISTING_REF = Symbol.for("pi-pane:listingRef");
const ANIM_INTERVAL = Symbol.for("pi-pane:animInterval");
const DEBOUNCE_TIMER = Symbol.for("pi-pane:debounceTimer");

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_RENDER_WIDTH = 9999;
const MIN_HEADER_LINES = 11;
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
      // Logo only — sections appear together on reveal
    } else {
      const latest = ref.latestVersion ?? VERSION;
      const hasUpdate = compareVersions(latest, VERSION) > 0;
      const latestStr = hasUpdate ? `Latest: ${accent("v" + latest)}` : `Latest: v${latest}`;
      sectionsToRender.push({ name: "Version", items: [`Local: v${VERSION}`, latestStr] });

      // Display sections in SECTION_KEYS order, skip empty
      const byName = new Map(ref.sections.map(s => [s.name, s]));
      for (const key of SECTION_KEYS) {
        const sec = byName.get(key);
        if (sec && sec.items.length > 0) sectionsToRender.push(sec);
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

  // Pi doesn't clear below the header when height shrinks,
  // so track the max height seen to prevent ghost lines.
  ref.maxHeaderHeight = Math.max(ref.maxHeaderHeight ?? MIN_HEADER_LINES, result.length);
  while (result.length < ref.maxHeaderHeight) result.push("");
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

  const itemAge = ref.revealed ? ref.frame - ref.revealedAt : 0;
  const labelAge = ref.revealed ? ref.frame - ref.scaffoldAt : 0;

  // RGB endpoints for fade ramps (truecolor only)
  const fadeStartRgb: [number, number, number] = [20, 20, 20];
  let dimRgb: [number, number, number] | undefined;
  let mutedRgb: [number, number, number] | undefined;
  const labelRamping = TRUECOLOR && ref.revealed && labelAge < RAMP_FRAMES + MAX_STAGGER;
  const itemRamping = TRUECOLOR && ref.revealed && itemAge < RAMP_FRAMES + MAX_STAGGER;
  if (labelRamping || itemRamping) {
    dimRgb = extractRgb(theme.fg("dim", " "));
    mutedRgb = extractRgb(theme.fg("muted", " "));
  }

  const lines: string[] = [];

  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    if (sec.items.length === 0) continue;

    const availableW = maxW - headerW - 1;

    // Label fade: near-invisible → dim (static dim when not revealed)
    const secLabelAge = Math.max(0, labelAge - BASE_FADE_DELAY - si * STAGGER_FRAMES);
    const wrapLabel = ref.revealed
      ? buildItemWrapper(secLabelAge, true, fadeStartRgb, dimRgb, dim)
      : dim;
    const header = wrapLabel(`[${sec.name}]`);
    const paddedHeader = header + " ".repeat(Math.max(0, headerW - sec.name.length - 2));

    // Item fade: near-invisible → muted
    const secItemAge = Math.max(0, itemAge - BASE_FADE_DELAY - si * STAGGER_FRAMES);
    const wrapItems = buildItemWrapper(secItemAge, ref.revealed, fadeStartRgb, mutedRgb, muted);

    // Style prefix (npm:/git:) dimmer than the name
    const styleItem = (raw: string): string => {
      const prefixMatch = raw.match(/^(npm:|git:)/);
      if (prefixMatch) {
        const pfx = prefixMatch[1];
        const name = raw.slice(pfx.length);
        return wrapLabel(pfx) + wrapItems(name);
      }
      return wrapItems(raw);
    };

    let currentLine = "";
    let currentStyled = "";
    let firstLine = true;

    for (const item of sec.items) {
      const itemW = visibleWidth(item);
      const currentW = visibleWidth(currentLine);

      if (currentLine && currentW + 2 + itemW > availableW) {
        lines.push(firstLine ? `${paddedHeader} ${currentStyled}` : " ".repeat(headerW + 1) + currentStyled);
        currentLine = item;
        currentStyled = styleItem(item);
        firstLine = false;
      } else {
        currentLine = currentLine ? currentLine + "  " + item : item;
        currentStyled = currentStyled ? currentStyled + "  " + styleItem(item) : styleItem(item);
      }
    }
    if (currentLine) {
      lines.push(firstLine ? `${paddedHeader} ${currentStyled}` : " ".repeat(headerW + 1) + currentStyled);
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
  let currentSource = "";
  let sourceIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("[")) continue;
    if (/^(user|project|path)$/.test(trimmed)) { currentSource = ""; sourceIndent = 0; continue; }

    const indent = line.length - line.trimStart().length;

    // Track package source headers (e.g. "git:github.com/...", "npm:@foo/bar")
    // Extract name from the header itself + let children inherit the prefix
    if (/^(git:|npm:)\S+\//.test(trimmed)) {
      currentSource = trimmed.startsWith("git:") ? "git:" : "npm:";
      sourceIndent = indent;
      // Extract name from source header (e.g. "npm:@foo/pi-tavily-tools" → "npm:pi-tavily-tools")
      const showSource = sectionName === "Extensions" || sectionName === "Skills";
      const name = extractName(trimmed, sectionName);
      if (name && showSource) names.push(name);
      continue;
    }

    // Reset source prefix when indent returns to source level or shallower
    if (currentSource && indent <= sourceIndent) {
      currentSource = "";
      sourceIndent = 0;
    }

    if (/^(index\.(ts|js)|src|dist|out|build|lib|bin)$/i.test(trimmed)) continue;
    // Skip resolved file paths only under source headers (e.g. "dist/index.js" under npm:)
    if (currentSource) {
      if (/\/(src|dist|out|build|lib|bin)\//.test(trimmed)) continue;
      if (/\.(ts|js)$/.test(trimmed) && trimmed.includes("/") && !/SKILL\.(ts|js)$/i.test(trimmed)) continue;
    }

    const name = extractName(trimmed, sectionName);
    // Prompts/Context don't need source prefix — only Extensions/Skills
    const showSource = sectionName === "Extensions" || sectionName === "Skills";
    if (name) names.push(showSource && currentSource ? currentSource + name : name);
  }

  // Deduplicate by bare name (without prefix) — prefer prefixed version
  const seen = new Map<string, string>();
  for (const n of names) {
    if (/^(index|dist|src|out|lib|bin)$/i.test(n)) continue;
    const bare = n.replace(/^(npm:|git:)/, "");
    if (!seen.has(bare) || n.includes(":")) seen.set(bare, n);
  }
  return { name: sectionName, items: [...seen.values()] };
}

function parseModelScope(plain: string): ParsedSection | undefined {
  const m = plain.match(/Model scope:\s*(.+)/i);
  if (!m) return undefined;
  const raw = m[1].replace(/\s*\(Ctrl\+\w[\w\s]*\)/gi, "");
  const items = raw.split(",").map(s => s.trim()).filter(Boolean);
  return items.length > 0 ? { name: "Models", items } : undefined;
}

function detectOrigin(path: string): { prefix: string; clean: string } {
  if (/^npm:/.test(path)) return { prefix: "npm:", clean: path.slice(4) };
  if (/^git:/.test(path)) return { prefix: "git:", clean: path.slice(4) };
  if (/^https?:\/\//.test(path)) return { prefix: "git:", clean: path };
  return { prefix: "", clean: path };
}

function cleanName(name: string): string {
  return name.replace(/\.(ts|js|json|md|git)$/i, "");
}

function extractName(path: string, section: string): string {
  const trimmed = path.trim();
  const { prefix, clean } = detectOrigin(trimmed);

  if (section === "Prompts") {
    // Extract prompt name from path (e.g. "/write-plan-implement" → "/write-plan-implement")
    const base = clean.split("/").pop() ?? clean;
    return cleanName(base) || clean;
  }

  if (section === "Skills" && clean.includes("/")) {
    const parts = clean.split("/");
    const file = parts.pop() ?? "";
    if (/^SKILL\.(md|ts|js)$/i.test(file)) {
      return prefix + cleanName(parts.pop() ?? file);
    }
    return prefix + cleanName(file);
  }

  if (section === "Context") {
    return clean.split("/").pop() ?? clean;
  }

  if (section === "Extensions") {
    const stripped = clean.replace(/^https?:\/\/[^/]+\//, "");
    const parts = stripped.split("/").filter(p => {
      const lower = p.toLowerCase();
      return p && !/^(index\.(ts|js)|src|dist|out|build|lib|bin)$/.test(lower);
    });

    if (parts.length > 0) {
      return prefix + cleanName(parts.pop()!);
    }

    return prefix + cleanName(clean);
  }

  const base = clean.split("/").pop() ?? clean;
  return prefix + cleanName(base);
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
  ref.scaffoldAt = 0;
  ref.settled = false;
  ref.cachedLines = undefined;
  ref.cachedWidth = undefined;
  ref.maxHeaderHeight = undefined;

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

  // Patch clear() to reset message instance tracking on container rebuild
  if (!cc[PATCHED_CLEAR]) {
    cc[PATCHED_CLEAR] = true;
    const origClear = chat.clear.bind(chat);
    chat.clear = () => {
      resetInstanceCount();
      return origClear();
    };
  }

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

      const section = parseSectionText(plain) ?? parseModelScope(plain);
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
            ref.scaffoldAt = ref.frame;
            // Restore original addChild — startup listing captured, get out of the hot path
            chat.addChild = origAddChild;
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

    if (component instanceof Spacer && !currentRef.revealed) return;
    origAddChild(component);
  };
}
