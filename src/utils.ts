export const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

export const isParentBorder = (s: string) => {
  const clean = stripAnsi(s);
  return clean.length > 0 && clean[0] === "─";
};

export function formatKey(key: string | undefined): string {
  if (!key) return "that key";
  return key
    .split("+")
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "ctrl") return "Ctrl";
      if (lower === "alt") return "Alt";
      if (lower === "shift") return "Shift";
      if (lower === "cmd" || lower === "meta") return "Cmd";
      return part.length === 1
        ? part.toUpperCase()
        : part[0]!.toUpperCase() + part.slice(1);
    })
    .join("+");
}
