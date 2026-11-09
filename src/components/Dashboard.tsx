import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DriveInfo, HogItem, ScanSummary } from "../types";
import { formatBytes, formatPercent } from "../lib/format";
import { colorForExt, groupOfExt } from "../lib/fileTypes";

const MAX_EXT_SLICES = 8;

interface Props {
  summary: ScanSummary;
  drive: DriveInfo | null;
  largestFile: HogItem | null;
  largestFolder: HogItem | null;
  selectedType: string | null;
  onSelectType: (ext: string | null) => void;
}

export default function Dashboard({
  summary,
  drive,
  largestFile,
  largestFolder,
  selectedType,
  onSelectType,
}: Props) {
  const usedPct = drive && drive.totalBytes > 0 ? (drive.usedBytes / drive.totalBytes) * 100 : 0;

  // File-type breakdown by extension (top 8 + Other types).
  const slices = summary.byType.slice(0, MAX_EXT_SLICES).map((t) => ({
    key: t.ext,
    label: t.ext === "(none)" ? "no extension" : `.${t.ext}`,
    bytes: t.bytes,
    fill: colorForExt(t.ext),
    ext: t.ext as string | null,
  }));
  const restBytes = summary.byType.slice(MAX_EXT_SLICES).reduce((sum, t) => sum + t.bytes, 0);
  if (restBytes > 0) {
    slices.push({ key: "__other__", label: "Other types", bytes: restBytes, fill: "#64748B", ext: null });
  }

  // One-line plain-language summary.
  let sentence = "Nothing was counted yet.";
  if (summary.byType.length > 0 && summary.totalBytes > 0) {
    const top = summary.byType[0];
    const group = groupOfExt(top.ext);
    sentence = `${capitalize(group)} files use ${formatBytes(top.bytes)}, ${formatPercent(
      top.bytes,
      summary.totalBytes,
    )} of the scanned ${formatBytes(summary.totalBytes)}.`;
  }

  return (
    <section className="space-y-3 rounded-md border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card label="Total scanned" value={formatBytes(summary.totalBytes)} />
        <Card label="Files" value={summary.fileCount.toLocaleString()} />
        <Card label="Folders" value={summary.dirCount.toLocaleString()} />
        <Card
          label="Largest file"
          value={largestFile ? formatBytes(largestFile.size) : "-"}
          sub={largestFile?.name}
        />
        <Card
          label="Largest folder"
          value={largestFolder ? formatBytes(largestFolder.size) : "-"}
          sub={largestFolder?.name}
        />
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="opacity-70">
            {drive ? `Drive ${drive.letter}` : "Drive usage"} - used vs free
          </span>
          <span className="opacity-60">
            {drive
              ? `${formatBytes(drive.usedBytes)} used / ${formatBytes(drive.totalBytes)} total`
              : `Scanned ${formatBytes(summary.totalBytes)}`}
          </span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded bg-neutral-800">
          <div className="bg-sky-600" style={{ width: `${usedPct}%` }} />
        </div>
      </div>

      <div className="rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm">
        {sentence}
      </div>

      <div className="grid gap-3 md:grid-cols-[240px_1fr]">
        <div className="relative">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="bytes"
                nameKey="label"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={1}
                isAnimationActive={false}
                stroke="#0a0a0a"
                strokeWidth={1}
                onClick={(_, index) => {
                  const slice = slices[index];
                  if (slice?.ext) onSelectType(slice.ext === selectedType ? null : slice.ext);
                }}
              >
                {slices.map((slice) => (
                  <Cell
                    key={slice.key}
                    fill={slice.fill}
                    cursor={slice.ext ? "pointer" : undefined}
                    fillOpacity={selectedType && slice.ext !== selectedType ? 0.35 : 1}
                    stroke={slice.ext === selectedType ? "#ffffff" : undefined}
                    strokeWidth={slice.ext === selectedType ? 1.5 : 0}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatBytes(Number(value ?? 0))}
                contentStyle={{
                  background: "#171717",
                  border: "1px solid #404040",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-xs">
            <div className="font-semibold">by type</div>
            <div className="opacity-60">{summary.byType.length} types</div>
          </div>
        </div>

        <div className="space-y-0.5 self-center text-xs">
          {slices.map((slice) => {
            const active = slice.ext !== null && slice.ext === selectedType;
            return (
              <button
                key={slice.key}
                onClick={() => slice.ext && onSelectType(active ? null : slice.ext)}
                disabled={!slice.ext}
                className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left ${
                  slice.ext ? "cursor-pointer hover:bg-white/5" : "cursor-default"
                } ${active ? "bg-white/10" : ""}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: slice.fill }} />
                <span className="flex-1 truncate">{slice.label}</span>
                <span className="tabular-nums opacity-80">{formatBytes(slice.bytes)}</span>
                <span className="w-12 text-right tabular-nums opacity-60">
                  {formatPercent(slice.bytes, summary.totalBytes)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/60 p-3">
      <div className="text-xs uppercase tracking-wide opacity-50">{label}</div>
      <div className="truncate text-lg font-semibold tabular-nums">{value}</div>
      {sub && (
        <div className="truncate text-xs opacity-60" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
