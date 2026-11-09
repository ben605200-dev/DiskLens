import type { ChildOut, HogItem } from "../types";

/** Extension → coarse group. Kept small on purpose. */
const EXT_GROUPS: Array<[string, string[]]> = [
  ["video", ["mp4", "mkv", "avi", "mov", "wmv", "webm", "flv", "m4v", "mpg", "mpeg", "3gp"]],
  ["image", ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "tif", "tiff", "heic", "ico", "raw", "psd", "ai"]],
  ["audio", ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus", "mid", "midi"]],
  ["archive", ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "iso", "cab", "zst"]],
  ["document", ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "ods", "csv", "md", "epub"]],
  [
    "code",
    ["js", "ts", "tsx", "jsx", "rs", "py", "c", "cpp", "h", "hpp", "cs", "java", "go", "rb", "php", "html", "css", "json", "xml", "yml", "yaml", "toml", "sql", "sh", "ps1", "bat", "cmd"],
  ],
  ["app", ["exe", "dll", "msi", "appx", "msix", "sys", "so", "jar", "com", "bin"]],
  ["font", ["ttf", "otf", "woff", "woff2", "fon"]],
];

const extToGroup = new Map<string, string>();
for (const [group, exts] of EXT_GROUPS) {
  for (const e of exts) extToGroup.set(e, group);
}

/** Color-blind-safe palette (Okabe-Ito based), plus neutrals. */
const GROUP_COLORS: Record<string, string> = {
  video: "#56B4E9",
  image: "#E69F00",
  audio: "#009E73",
  archive: "#D55E00",
  document: "#CC79A7",
  code: "#0072B2",
  app: "#F0E442",
  font: "#B0B0B0",
  other: "#8FA6B2",
};

const GROUP_ICONS: Record<string, string> = {
  video: "🎬",
  image: "🖼️",
  audio: "🎵",
  archive: "🗜️",
  document: "📄",
  code: "💻",
  app: "🧩",
  font: "🔤",
  other: "📄",
};

export const FOLDER_COLOR = "#94A3B8";
export const OTHER_ITEMS_COLOR = "#64748B";
export const REST_COLOR = "#4B5563";

/** Lower-cased extension without the dot, or "" when there is none. */
export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0 || i + 1 >= name.length) return "";
  return name.slice(i + 1).toLowerCase();
}

export function groupOfExt(ext: string): string {
  return extToGroup.get(ext) ?? "other";
}

export function colorForItem(item: Pick<HogItem, "kind" | "name">): string {
  if (item.kind === "folder") return FOLDER_COLOR;
  return GROUP_COLORS[groupOfExt(extOf(item.name))] ?? GROUP_COLORS.other;
}

export function iconForItem(item: Pick<HogItem, "kind" | "name">): string {
  if (item.kind === "folder") return "📁";
  return GROUP_ICONS[groupOfExt(extOf(item.name))] ?? GROUP_ICONS.other;
}

/** Color for a treemap block (also handles links). */
export function treemapColor(kind: ChildOut["kind"], name: string, isCloud?: boolean | null): string {
  if (kind === "link") return "#8A6D3B";
  if (kind === "folder") return FOLDER_COLOR;
  if (isCloud) return "#7DD3FC";
  return colorForItem({ kind: "file", name });
}

/**
 * Deterministic diagonal stripe pattern (never rely on color alone):
 * pattern index cycles 0..2 by case-insensitive name.
 */
export function patternIndexFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.toLowerCase().charCodeAt(i)) >>> 0;
  }
  return hash % 3;
}

/** SVG fill for an overlay: a subtle white diagonal stripe pattern. */
export function patternFill(index: number): string {
  return `url(#dl-pattern-${index})`;
}

/** Color for a file extension (used by the type donut). */
export function colorForExt(ext: string): string {
  return GROUP_COLORS[groupOfExt(ext)] ?? GROUP_COLORS.other;
}
