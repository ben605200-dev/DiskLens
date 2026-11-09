import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ChartType,
  DriveInfo,
  HogItem,
  ScanProgress,
  ScanSummary,
  Settings,
  Tab,
  TopN,
} from "./types";
import DrivePicker from "./components/DrivePicker";
import Filters from "./components/Filters";
import HogsTable from "./components/HogsTable";
import DetailPanel from "./components/DetailPanel";
import SettingsPage from "./components/SettingsPage";
import { extOf } from "./lib/fileTypes";
import { formatBytes, formatElapsed } from "./lib/format";
import { DEFAULT_SETTINGS, applySettings } from "./lib/settings";

// Charts and the treemap (recharts + d3 are heavy) are only loaded
// once results exist, which keeps the start screen light.
const HogsChart = lazy(() => import("./components/HogsChart"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const Treemap = lazy(() => import("./components/Treemap"));

const OLD_MS = 365 * 24 * 60 * 60 * 1000;

export default function App() {
  // Scan lifecycle
  const [drives, setDrives] = useState<DriveInfo[] | null>(null);
  const [path, setPath] = useState("C:\\");
  const [scanning, setScanning] = useState(false);
  const [live, setLive] = useState<ScanProgress | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters and view options
  const [tab, setTab] = useState<Tab>("files");
  const [topN, setTopN] = useState<TopN>(25);
  const [typeFilter, setTypeFilter] = useState("all");
  const [minSizeMb, setMinSizeMb] = useState("");
  const [olderOnly, setOlderOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [logScale, setLogScale] = useState(false);

  // Interaction
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [selected, setSelected] = useState<HogItem | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [rootView, setRootView] = useState<"dashboard" | "details">("dashboard");

  // Settings (persisted by the backend in the app-data folder)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(settings);
  const saveTimer = useRef<number | null>(null);

  const loadDrives = useCallback(async () => {
    try {
      setDrives(await invoke<DriveInfo[]>("list_drives"));
    } catch (err) {
      setDrives([]);
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    void loadDrives();
  }, [loadDrives]);

  // Load saved settings once and adopt the defaults that apply right away.
  useEffect(() => {
    invoke<Settings>("load_settings")
      .then((loaded) => {
        setSettings(loaded);
        setTopN(loaded.defaultTopN);
        setChartType(loaded.defaultGraph);
        setRootView(loaded.defaultView);
      })
      .catch(() => {
        /* fall back to defaults silently */
      });
  }, []);

  // Push settings into the CSS variables; follow the OS theme when asked.
  useEffect(() => {
    settingsRef.current = settings;
    applySettings(settings);
    if (settings.theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: light)");
      const listener = () => applySettings(settingsRef.current);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
  }, [settings]);

  useEffect(() => {
    const unlisteners: Promise<UnlistenFn>[] = [
      listen<ScanProgress>("scan-progress", (event) => setLive(event.payload)),
      listen<ScanSummary>("scan-finished", (event) => {
        setSummary(event.payload);
        setLive(null);
        setScanning(false);
        setRootView(settingsRef.current.defaultView);
      }),
      listen<string>("scan-failed", (event) => {
        setError(event.payload);
        setLive(null);
        setScanning(false);
      }),
    ];
    return () => {
      unlisteners.forEach((pending) => pending.then((unlisten) => unlisten()));
    };
  }, []);

  async function startScan(target?: string) {
    const targetPath = target ?? path;
    setError(null);
    setSummary(null);
    setLive(null);
    setSelected(null);
    setHoveredPath(null);
    setSelectedType(null);
    setScanning(true);
    try {
      await invoke("scan_start", {
        path: targetPath,
        excludedPaths: settings.excludedPaths,
      });
      setPath(targetPath);
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

  function newScan() {
    setSummary(null);
    setLive(null);
    setSelected(null);
    setHoveredPath(null);
    setSelectedType(null);
    setError(null);
  }

  /** Keeps the type dropdown, donut selection and treemap in sync. */
  function applyTypeFilter(value: string) {
    setTypeFilter(value);
    setSelectedType(value === "all" ? null : value);
  }

  /** Applies a settings change immediately and saves it (debounced). */
  function updateSettings(patch: Partial<Settings>) {
    const next = { ...settingsRef.current, ...patch };
    setSettings(next);
    settingsRef.current = next;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void invoke("save_settings", { settings: next }).catch((err) => setError(String(err)));
    }, 400);
    // Defaults also apply to the current view right away.
    if (patch.defaultTopN !== undefined) setTopN(patch.defaultTopN);
    if (patch.defaultGraph !== undefined) setChartType(patch.defaultGraph);
    if (patch.defaultView !== undefined) setRootView(patch.defaultView);
  }

  // ----- derived data -----------------------------------------------------

  const totalBytes = summary ? summary.totalBytes : live ? live.bytes : 0;
  const rootNorm = ((summary?.root ?? live?.root) || "")
    .toLowerCase()
    .replace(/[\\/]+$/, "");

  const files: HogItem[] = useMemo(
    () =>
      (summary?.topFiles ?? live?.topFiles ?? []).map((f) => ({
        path: f.path,
        name: f.name,
        size: f.size,
        kind: "file" as const,
        modifiedMs: f.modifiedMs,
        createdMs: f.createdMs,
      })),
    [summary, live],
  );

  const folders: HogItem[] = useMemo(
    () =>
      (summary?.topFolders ?? live?.topFolders ?? [])
        // The scan root folder would always be 100% - hide it.
        .filter((f) => f.path.toLowerCase().replace(/[\\/]+$/, "") !== rootNorm)
        .map((f) => ({
          path: f.path,
          name: f.name,
          size: f.size,
          kind: "folder" as const,
          modifiedMs: 0,
          createdMs: 0,
        })),
    [summary, live, rootNorm],
  );

  const typeOptions = useMemo(() => {
    const exts = new Set<string>();
    for (const f of files) {
      const e = extOf(f.name);
      if (e) exts.add(e);
    }
    return Array.from(exts).sort();
  }, [files]);

  const minBytes = parseFloat(minSizeMb) > 0 ? parseFloat(minSizeMb) * 1024 * 1024 : 0;

  const visible = useMemo(() => {
    const base =
      tab === "files"
        ? files
        : tab === "folders"
          ? folders
          : [...files, ...folders].sort((a, b) => b.size - a.size);

    const query = search.trim().toLowerCase();
    const now = Date.now();

    return base
      .filter((item) => {
        if (item.size < minBytes) return false;
        if (query && !item.name.toLowerCase().includes(query) && !item.path.toLowerCase().includes(query)) {
          return false;
        }
        if (item.kind === "file") {
          if (typeFilter !== "all" && extOf(item.name) !== typeFilter) return false;
          if (olderOnly && !(item.modifiedMs > 0 && now - item.modifiedMs > OLD_MS)) return false;
        } else if (typeFilter !== "all" || olderOnly) {
          // Type/age filters only make sense for files.
          return false;
        }
        return true;
      })
      .sort((a, b) => b.size - a.size)
      .slice(0, topN);
  }, [tab, files, folders, minBytes, search, typeFilter, olderOnly, topN]);

  const rootPath = summary?.root ?? live?.root ?? "";
  const largestFile = files[0] ?? null;
  const largestFolder = folders[0] ?? null;
  const selectedDrive = useMemo(
    () => drives?.find((d) => rootPath.toLowerCase().startsWith(d.letter.toLowerCase())) ?? null,
    [drives, rootPath],
  );

  const showStart = !scanning && !summary && !live;
  const showResults = scanning || summary !== null;
  const showDashboard = rootView === "dashboard" && !scanning && summary !== null;

  // ----- rendering --------------------------------------------------------

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">DiskLens</h1>
          <span className="text-xs opacity-60">100% local - no telemetry, no network</span>
        </div>
        <div className="flex items-center gap-2">
          {showResults && !showSettings && (
            <button
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-900"
              onClick={newScan}
              disabled={scanning}
            >
              New scan
            </button>
          )}
          <button
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-900"
            onClick={() => {
              setShowSettings((open) => !open);
              setSelected(null);
            }}
          >
            {showSettings ? "Close settings" : "Settings"}
          </button>
        </div>
      </header>

      {showSettings && (
        <SettingsPage
          settings={settings}
          onChange={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showStart && !showSettings && (
        <>
          <DrivePicker drives={drives} onPick={(root) => void startScan(root)} onRefresh={() => void loadDrives()} />
          <section className="space-y-2">
            <h2 className="text-sm font-medium opacity-80">Or scan a specific folder</h2>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-sky-600"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\\Users\\Example\\Downloads"
                spellCheck={false}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && path.trim() !== "") void startScan();
                }}
              />
              <button
                className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-40"
                onClick={() => void startScan()}
                disabled={path.trim() === ""}
              >
                Scan
              </button>
            </div>
            {error && (
              <div className="rounded-md border border-red-900 bg-red-950/50 p-3 text-sm">{error}</div>
            )}
          </section>
        </>
      )}

      {showResults && !showSettings && (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm">
            {scanning ? (
              <>
                <Stat label="Scanning" value={path} wide />
                <Stat label="Files" value={live ? live.files.toLocaleString() : "..."} />
                <Stat label="Bytes" value={live ? formatBytes(live.bytes) : "..."} />
                <Stat label="Skipped" value={live ? live.skipped.toLocaleString() : "..."} />
                <Stat label="Elapsed" value={live ? formatElapsed(live.elapsedMs) : "..."} />
                <button
                  className="ml-auto rounded-md border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800"
                  onClick={() => void cancelScan()}
                >
                  Cancel
                </button>
              </>
            ) : summary ? (
              <>
                <Stat label={summary.cancelled ? "Total (partial)" : "Total"} value={formatBytes(summary.totalBytes)} />
                <Stat label="Files" value={summary.fileCount.toLocaleString()} />
                <Stat label="Folders" value={summary.dirCount.toLocaleString()} />
                <Stat label="Skipped" value={summary.skippedCount.toLocaleString()} />
                <Stat label="Links skipped" value={summary.linkCount.toLocaleString()} />
                <Stat label="Cloud files" value={summary.cloudFileCount.toLocaleString()} />
                <span className="ml-auto text-xs opacity-60">
                  {formatElapsed(summary.elapsedMs)} · {summary.root}
                </span>
              </>
            ) : null}
          </div>

          {error && (
            <div className="rounded-md border border-red-900 bg-red-950/50 p-3 text-sm">{error}</div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex overflow-hidden rounded-md border border-neutral-700 text-xs">
              {(["dashboard", "details"] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setRootView(view)}
                  disabled={scanning}
                  className={`px-3 py-1.5 capitalize disabled:opacity-40 ${
                    rootView === view
                      ? "bg-sky-600 text-on-accent"
                      : "bg-neutral-900 hover:bg-neutral-800"
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
            {scanning && <span className="text-xs opacity-60">Live results update while scanning</span>}
          </div>

          {showDashboard && summary && (
            <Suspense fallback={<div className="p-4 text-sm opacity-60">Loading views...</div>}>
              <Dashboard
                summary={summary}
                drive={selectedDrive}
                largestFile={largestFile}
                largestFolder={largestFolder}
                selectedType={selectedType}
                onSelectType={(ext) => applyTypeFilter(ext ?? "all")}
              />
              <Treemap
                rootPath={summary.root}
                selectedType={selectedType}
                minBytes={minBytes}
                search={search}
                onSelect={setSelected}
              />
            </Suspense>
          )}

          <Filters
            tab={tab}
            setTab={setTab}
            topN={topN}
            setTopN={setTopN}
            typeFilter={typeFilter}
            setTypeFilter={applyTypeFilter}
            typeOptions={typeOptions}
            minSizeMb={minSizeMb}
            setMinSizeMb={setMinSizeMb}
            olderOnly={olderOnly}
            setOlderOnly={setOlderOnly}
            search={search}
            setSearch={setSearch}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
            <HogsTable
              items={visible}
              totalBytes={totalBytes}
              hoveredPath={hoveredPath}
              onHover={setHoveredPath}
              onSelect={setSelected}
            />

            <section className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium opacity-80">
                  {chartType === "bar" ? "Largest items" : "Share of scanned total"}
                </h2>
                <div className="flex items-center gap-3 text-xs">
                  {chartType === "bar" && (
                    <label className="flex items-center gap-1 opacity-80">
                      <input
                        type="checkbox"
                        checked={logScale}
                        onChange={(e) => setLogScale(e.target.checked)}
                      />
                      Log scale
                    </label>
                  )}
                  <div className="flex overflow-hidden rounded-md border border-neutral-700">
                    {(["bar", "donut"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setChartType(t)}
                        className={`px-3 py-1 capitalize ${
                          chartType === t
                            ? "bg-sky-600 text-on-accent"
                            : "bg-neutral-900 hover:bg-neutral-800"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Suspense fallback={<div className="p-4 text-sm opacity-60">Loading chart...</div>}>
                <HogsChart
                  chartType={chartType}
                  logScale={logScale}
                  items={visible}
                  totalBytes={totalBytes}
                  hoveredPath={hoveredPath}
                  onHover={setHoveredPath}
                  onSelect={setSelected}
                />
              </Suspense>
            </section>
          </div>
        </>
      )}

      {selected && <DetailPanel item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "min-w-0 max-w-64" : undefined}>
      <div className="text-xs uppercase tracking-wide opacity-50">{label}</div>
      <div className="truncate tabular-nums" title={value}>
        {value}
      </div>
    </div>
  );
}
