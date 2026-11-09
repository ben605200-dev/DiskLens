import type { Tab, TopN } from "../types";

interface Props {
  tab: Tab;
  setTab: (tab: Tab) => void;
  topN: TopN;
  setTopN: (n: TopN) => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
  typeOptions: string[];
  minSizeMb: string;
  setMinSizeMb: (value: string) => void;
  olderOnly: boolean;
  setOlderOnly: (value: boolean) => void;
  search: string;
  setSearch: (value: string) => void;
}

const inputClass =
  "rounded-md border border-neutral-700 bg-neutral-900 px-2 py-[var(--dl-ctl-py)] outline-none focus:border-sky-600";

export default function Filters(props: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <div className="flex overflow-hidden rounded-md border border-neutral-700">
        {(["files", "folders", "both"] as const).map((t) => (
          <button
            key={t}
            onClick={() => props.setTab(t)}
            className={`px-3 py-[var(--dl-ctl-py)] capitalize ${
              props.tab === t
                ? "bg-sky-600 text-on-accent"
                : "bg-neutral-900 hover:bg-neutral-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <select
        className={inputClass}
        value={props.topN}
        onChange={(e) => props.setTopN(Number(e.target.value) as TopN)}
      >
        {[10, 25, 50, 100].map((n) => (
          <option key={n} value={n}>
            Top {n}
          </option>
        ))}
      </select>

      <select
        className={inputClass}
        value={props.typeFilter}
        onChange={(e) => props.setTypeFilter(e.target.value)}
      >
        <option value="all">All types</option>
        {props.typeOptions.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <label className={`flex items-center gap-1 ${inputClass}`}>
        Min
        <input
          type="number"
          min={0}
          value={props.minSizeMb}
          onChange={(e) => props.setMinSizeMb(e.target.value)}
          className="w-16 bg-transparent outline-none"
          placeholder="0"
        />
        MB
      </label>

      <label className={`flex items-center gap-1.5 ${inputClass}`}>
        <input
          type="checkbox"
          checked={props.olderOnly}
          onChange={(e) => props.setOlderOnly(e.target.checked)}
        />
        Not modified in over a year
      </label>

      <input
        className={`min-w-40 flex-1 ${inputClass}`}
        value={props.search}
        onChange={(e) => props.setSearch(e.target.value)}
        placeholder="Search name or path..."
      />
    </div>
  );
}
