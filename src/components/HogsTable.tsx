import type { HogItem } from "../types";
import { dirOf, formatBytes, formatDateTime, formatPercent } from "../lib/format";
import { iconForItem } from "../lib/fileTypes";

interface Props {
  items: HogItem[];
  totalBytes: number;
  hoveredPath: string | null;
  onHover: (path: string | null) => void;
  onSelect: (item: HogItem) => void;
}

export default function HogsTable({ items, totalBytes, hoveredPath, onHover, onSelect }: Props) {
  return (
    <div className="overflow-hidden rounded-md border border-neutral-800">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wide">
          <tr className="opacity-60">
            <th className="w-10 px-2 py-2 text-right">#</th>
            <th className="px-2 py-2">Name</th>
            <th className="w-56 px-2 py-2">Location</th>
            <th className="w-24 px-2 py-2 text-right">Size</th>
            <th className="w-32 px-2 py-2">% of total</th>
            <th className="w-32 px-2 py-2">Modified</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const pct = totalBytes > 0 ? (item.size / totalBytes) * 100 : 0;
            const isHovered = hoveredPath === item.path;
            return (
              <tr
                key={item.path}
                tabIndex={0}
                onMouseEnter={() => onHover(item.path)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(item);
                  }
                }}
                className={`cursor-pointer border-t border-neutral-800/60 ${
                  isHovered ? "bg-[var(--dl-hover-strong)]" : "hover:bg-[var(--dl-hover)]"
                }`}
              >
                <td className="px-2 py-[var(--dl-row-py)] text-right opacity-50">{index + 1}</td>
                <td className="truncate px-2 py-[var(--dl-row-py)]">
                  <span className="mr-1.5">{iconForItem(item)}</span>
                  <span title={item.path}>{item.name}</span>
                </td>
                <td className="truncate px-2 py-[var(--dl-row-py)] text-xs opacity-60" title={item.path}>
                  {dirOf(item.path)}
                </td>
                <td className="px-2 py-[var(--dl-row-py)] text-right tabular-nums">{formatBytes(item.size)}</td>
                <td className="px-2 py-[var(--dl-row-py)]">
                  <div className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums">
                      {formatPercent(item.size, totalBytes)}
                    </span>
                    <div className="h-1.5 flex-1 rounded bg-neutral-800">
                      <div
                        className="h-1.5 rounded bg-sky-500"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-2 py-[var(--dl-row-py)] text-xs opacity-70">
                  {item.kind === "folder" ? "-" : formatDateTime(item.modifiedMs)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {items.length === 0 && (
        <div className="p-4 text-sm opacity-60">No items match the current filters.</div>
      )}
    </div>
  );
}
