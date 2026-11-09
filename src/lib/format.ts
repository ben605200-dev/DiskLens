let sizeUnits: "binary" | "decimal" = "binary";

/** Sets the size units used by every formatBytes call (KB/GB = 1000-based,
 *  KiB/GiB = 1024-based). Set from the saved settings. */
export function setSizeUnits(units: "binary" | "decimal"): void {
  sizeUnits = units;
}

export function formatBytes(bytes: number): string {
  const base = sizeUnits === "decimal" ? 1000 : 1024;
  if (bytes < base) return `${bytes} B`;
  const units = sizeUnits === "decimal" ? ["KB", "MB", "GB", "TB"] : ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = "B";
  for (const u of units) {
    value /= base;
    unit = u;
    if (value < base) break;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}

export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  const pct = (part / whole) * 100;
  return `${pct.toFixed(pct >= 10 ? 0 : 1)}%`;
}

export function formatElapsed(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatDateTime(ms: number): string {
  if (!ms) return "-";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parent directory of a full path. */
export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i > 0 ? path.slice(0, i) : path;
}
