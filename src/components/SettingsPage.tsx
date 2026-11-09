import { useState, type ReactNode } from "react";
import type { ChartType, Settings, TopN } from "../types";
import { ACCENT_PRESETS } from "../lib/settings";

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

export default function SettingsPage({ settings, onChange, onClose }: Props) {
  const [newExcluded, setNewExcluded] = useState("");

  function addExcluded() {
    const value = newExcluded.trim().replace(/[\\/]+$/, "");
    if (!value) return;
    const exists = settings.excludedPaths.some((p) => p.toLowerCase() === value.toLowerCase());
    if (!exists) {
      onChange({ excludedPaths: [...settings.excludedPaths, value] });
    }
    setNewExcluded("");
  }

  function removeExcluded(path: string) {
    onChange({ excludedPaths: settings.excludedPaths.filter((p) => p !== path) });
  }

  return (
    <section className="rounded-md border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">Settings</h2>
        <button
          className="rounded px-2 py-1 text-xs opacity-70 hover:opacity-100"
          onClick={onClose}
        >
          Back
        </button>
      </div>

      <div className="grid gap-x-8 lg:grid-cols-2">
        <div>
          <h3 className="mt-2 text-xs font-medium uppercase tracking-wide opacity-50">Appearance</h3>
          <Row label="Theme">
            <Segmented
              value={settings.theme}
              options={[
                { value: "system", label: "Follow system" },
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
              onChange={(theme) => onChange({ theme })}
            />
          </Row>
          <Row label="Accent color">
            <div className="flex gap-1.5">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  title={preset.name}
                  aria-label={`Accent ${preset.name}`}
                  onClick={() => onChange({ accent: preset.value })}
                  className={`h-6 w-6 rounded-full border-2 ${
                    settings.accent.toLowerCase() === preset.value.toLowerCase()
                      ? "border-[var(--dl-text)]"
                      : "border-transparent"
                  }`}
                  style={{ background: preset.value }}
                />
              ))}
            </div>
          </Row>
          <Row label="Font size" hint="Base text size of the whole app">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={13}
                max={18}
                step={1}
                value={settings.fontSize}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              />
              <span className="w-10 text-right text-xs tabular-nums">{settings.fontSize} px</span>
            </div>
          </Row>
          <Row label="Reduce motion" hint="Turns off animations and transitions">
            <input
              type="checkbox"
              checked={settings.reduceMotion}
              onChange={(e) => onChange({ reduceMotion: e.target.checked })}
            />
          </Row>
        </div>

        <div>
          <h3 className="mt-2 text-xs font-medium uppercase tracking-wide opacity-50">Layout</h3>
          <Row label="Density">
            <Segmented
              value={settings.density}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
              onChange={(density) => onChange({ density })}
            />
          </Row>
          <Row label="Default view" hint="Shown after each scan finishes">
            <Segmented
              value={settings.defaultView}
              options={[
                { value: "dashboard", label: "Dashboard" },
                { value: "details", label: "Details" },
              ]}
              onChange={(defaultView) => onChange({ defaultView })}
            />
          </Row>
          <Row label="Default Top N">
            <select
              className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-sky-600"
              value={settings.defaultTopN}
              onChange={(e) => onChange({ defaultTopN: Number(e.target.value) as TopN })}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Default graph">
            <Segmented
              value={settings.defaultGraph}
              options={[
                { value: "bar", label: "Bar" },
                { value: "donut", label: "Donut" },
              ]}
              onChange={(defaultGraph) => onChange({ defaultGraph: defaultGraph as ChartType })}
            />
          </Row>
          <Row label="Size units">
            <Segmented
              value={settings.sizeUnits}
              options={[
                { value: "binary", label: "GiB (1024)" },
                { value: "decimal", label: "GB (1000)" },
              ]}
              onChange={(sizeUnits) => onChange({ sizeUnits })}
            />
          </Row>
        </div>
      </div>

      <h3 className="mt-4 text-xs font-medium uppercase tracking-wide opacity-50">Scanning</h3>
      <div className="mt-2">
        <p className="mb-2 text-xs opacity-60">
          Folders here are never scanned. Example: C:\Users\Example\Downloads\junk
        </p>
        {settings.excludedPaths.length === 0 && (
          <div className="mb-2 text-xs opacity-40">No excluded folders.</div>
        )}
        <ul className="mb-2 space-y-1">
          {settings.excludedPaths.map((path) => (
            <li
              key={path}
              className="flex items-center gap-2 rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-xs"
            >
              <span className="flex-1 truncate" title={path}>
                {path}
              </span>
              <button
                className="rounded px-1.5 opacity-60 hover:opacity-100"
                aria-label={`Remove ${path}`}
                onClick={() => removeExcluded(path)}
              >
                x
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs outline-none focus:border-sky-600"
            value={newExcluded}
            onChange={(e) => setNewExcluded(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addExcluded();
            }}
            placeholder="C:\Users\Example\Downloads\junk"
            spellCheck={false}
          />
          <button
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs hover:bg-neutral-800"
            onClick={addExcluded}
          >
            Add
          </button>
        </div>
      </div>

      <p className="mt-4 text-xs opacity-50">
        Settings are saved automatically in this app's data folder.
      </p>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-800 py-3 last:border-b-0">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs opacity-50">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-neutral-700">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1.5 text-xs ${
            value === option.value
              ? "bg-sky-600 text-on-accent"
              : "bg-neutral-900 hover:bg-neutral-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
