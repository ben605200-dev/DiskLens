import type { DriveInfo } from "../types";
import { formatBytes } from "../lib/format";

const TYPE_LABELS: Record<string, string> = {
  fixed: "SSD / HDD",
  removable: "Removable",
  remote: "Network",
  cdrom: "Optical",
  ramdisk: "RAM disk",
};

interface Props {
  drives: DriveInfo[] | null;
  onPick: (root: string) => void;
  onRefresh: () => void;
}

export default function DrivePicker({ drives, onPick, onRefresh }: Props) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium opacity-80">Pick a drive</h2>
        <button className="text-xs opacity-60 hover:opacity-100" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {!drives && <div className="text-sm opacity-60">Loading drives...</div>}
      {drives && drives.length === 0 && (
        <div className="text-sm opacity-60">No usable drives found.</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {drives?.map((drive) => {
          const usedPct = drive.totalBytes > 0 ? (drive.usedBytes / drive.totalBytes) * 100 : 0;
          return (
            <button
              key={drive.letter}
              onClick={() => onPick(drive.root)}
              className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-left transition-colors hover:border-sky-600"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-semibold">{drive.letter}</span>
                <span className="text-xs opacity-50">
                  {TYPE_LABELS[drive.driveType] ?? drive.driveType}
                </span>
              </div>
              <div className="mt-2 h-2 rounded bg-neutral-800">
                <div className="h-2 rounded bg-sky-600" style={{ width: `${usedPct}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-xs opacity-70">
                <span>{formatBytes(drive.usedBytes)} used</span>
                <span>
                  {formatBytes(drive.freeBytes)} free of {formatBytes(drive.totalBytes)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
