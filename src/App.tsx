import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ScanProgress, ScanSummary } from "./types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = "B";
  for (const u of units) {
    value /= 1024;
    unit = u;
    if (value < 1024) break;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
}

function formatElapsed(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export default function App() {
  const [path, setPath] = useState("C:\\");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [
      listen<ScanProgress>("scan-progress", (event) => setProgress(event.payload)),
      listen<ScanSummary>("scan-finished", (event) => {
        setSummary(event.payload);
        setProgress(null);
        setScanning(false);
      }),
      listen<string>("scan-failed", (event) => {
        setError(event.payload);
        setProgress(null);
        setScanning(false);
      }),
    ];
    return () => {
      unlisteners.forEach((pending) => pending.then((unlisten) => unlisten()));
    };
  }, []);

  async function startScan() {
    setError(null);
    setSummary(null);
    setProgress(null);
    setScanning(true);
    try {
      await invoke("scan_start", { path });
    } catch (err) {
      setError(String(err));
      setScanning(false);
    }
  }

  async function cancelScan() {
    try {
      await invoke("scan_cancel");
    } catch {
      // nothing to do
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">DiskLens</h1>
        <span className="text-xs opacity-60">100% local - no telemetry, no network</span>
      </header>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-sky-600"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="C:\\ or C:\\Users\\Example\\Downloads"
          spellCheck={false}
        />
        <button
          className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium disabled:opacity-40"
          onClick={startScan}
          disabled={scanning || path.trim() === ""}
        >
          {scanning ? "Scanning..." : "Scan"}
        </button>
        <button
          className="rounded-md border border-neutral-700 px-4 py-2 text-sm disabled:opacity-40"
          onClick={cancelScan}
          disabled={!scanning}
        >
          Cancel
        </button>
      </div>

      {progress && scanning && (
        <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-3 text-sm">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Files" value={progress.files.toLocaleString()} />
            <Stat label="Bytes" value={formatBytes(progress.bytes)} />
            <Stat label="Skipped" value={progress.skipped.toLocaleString()} />
            <Stat label="Elapsed" value={formatElapsed(progress.elapsedMs)} />
          </div>
          <div className="mt-2 truncate text-xs opacity-60" title={progress.currentDir}>
            {progress.currentDir}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-900 bg-red-950/50 p-3 text-sm">
          {error}
        </div>
      )}

      {summary && (
        <>
          <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-3 text-sm">
            <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
              <Stat label="Total" value={formatBytes(summary.totalBytes)} />
              <Stat label="Files" value={summary.fileCount.toLocaleString()} />
              <Stat label="Folders" value={summary.dirCount.toLocaleString()} />
              <Stat label="Skipped" value={summary.skippedCount.toLocaleString()} />
              <Stat label="Links skipped" value={summary.linkCount.toLocaleString()} />
              <Stat label="Cloud files" value={summary.cloudFileCount.toLocaleString()} />
            </div>
            <div className="mt-2 text-xs opacity-60">
              {summary.cancelled ? "Scan was cancelled - partial results." : "Scan complete."}{" "}
              · {formatElapsed(summary.elapsedMs)}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Largest folders">
              {summary.topFolders.slice(0, 10).map((folder) => (
                <div key={folder.path} className="flex items-baseline gap-2 py-0.5">
                  <span className="flex-1 truncate" title={folder.path}>
                    {folder.path}
                  </span>
                  <span className="tabular-nums opacity-80">{formatBytes(folder.size)}</span>
                </div>
              ))}
            </Panel>
            <Panel title="Largest files">
              {summary.topFiles.slice(0, 10).map((file) => (
                <div key={file.path} className="flex items-baseline gap-2 py-0.5">
                  <span className="flex-1 truncate" title={file.path}>
                    {file.name}
                  </span>
                  <span className="tabular-nums opacity-80">{formatBytes(file.size)}</span>
                </div>
              ))}
            </Panel>
          </div>

          <Panel title="Size by file type">
            {summary.byType.slice(0, 8).map((type) => (
              <div key={type.ext} className="flex items-baseline gap-2 py-0.5">
                <span className="w-24 truncate opacity-80">{type.ext}</span>
                <span className="flex-1 opacity-60">{type.count.toLocaleString()} files</span>
                <span className="tabular-nums">{formatBytes(type.bytes)}</span>
              </div>
            ))}
          </Panel>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="opacity-60">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900/60 p-3 text-sm">
      <h2 className="mb-1 font-medium">{title}</h2>
      {children}
    </div>
  );
}
