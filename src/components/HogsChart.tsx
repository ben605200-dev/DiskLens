import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartType, HogItem } from "../types";
import { formatBytes, formatPercent } from "../lib/format";
import { OTHER_ITEMS_COLOR, REST_COLOR, colorForItem } from "../lib/fileTypes";

const MAX_BARS = 25;
const MAX_SLICES = 10;

interface SliceDatum {
  key: string;
  name: string;
  value: number;
  fill: string;
  item?: HogItem;
}

interface Props {
  chartType: ChartType;
  logScale: boolean;
  items: HogItem[];
  totalBytes: number;
  hoveredPath: string | null;
  onHover: (path: string | null) => void;
  onSelect: (item: HogItem) => void;
}

export default function HogsChart({
  chartType,
  logScale,
  items,
  totalBytes,
  hoveredPath,
  onHover,
  onSelect,
}: Props) {
  if (items.length === 0) {
    return <div className="p-4 text-sm opacity-60">Nothing to chart yet.</div>;
  }
  return chartType === "bar" ? (
    <BarView
      items={items}
      logScale={logScale}
      hoveredPath={hoveredPath}
      onHover={onHover}
      onSelect={onSelect}
    />
  ) : (
    <DonutView
      items={items}
      totalBytes={totalBytes}
      hoveredPath={hoveredPath}
      onHover={onHover}
      onSelect={onSelect}
    />
  );
}

interface TooltipRow {
  payload?: Array<{ payload?: { name?: string; rawSize?: number; value?: number; fill?: string } }>;
  active?: boolean;
}

function ChartTooltip({ active, payload }: TooltipRow) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  if (!datum) return null;
  const size = datum.rawSize ?? datum.value ?? 0;
  return (
    <div className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs shadow-lg">
      <div className="max-w-56 truncate font-medium">{datum.name}</div>
      <div className="opacity-70">{formatBytes(size)}</div>
    </div>
  );
}

function BarView({
  items,
  logScale,
  hoveredPath,
  onHover,
  onSelect,
}: {
  items: HogItem[];
  logScale: boolean;
  hoveredPath: string | null;
  onHover: (path: string | null) => void;
  onSelect: (item: HogItem) => void;
}) {
  const barItems = items.slice(0, MAX_BARS);
  const data = barItems.map((item) => ({
    key: item.path,
    name: item.name,
    size: Math.max(1, item.size),
    rawSize: item.size,
    fill: colorForItem(item),
    item,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 26)}>
      <BarChart layout="vertical" data={data} margin={{ top: 4, right: 60, bottom: 4, left: 4 }}>
        <XAxis
          type="number"
          hide
          scale={logScale ? "log" : "linear"}
          domain={logScale ? [1, "dataMax"] : [0, "dataMax"]}
          allowDataOverflow={logScale}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tickFormatter={(value: string) => (value.length > 22 ? `${value.slice(0, 21)}…` : value)}
          tick={{ fontSize: 11, fill: "#cbd5e1" }}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.06)" }} />
        <Bar
          dataKey="size"
          isAnimationActive={false}
          onClick={(dataPoint) => {
            const item = (dataPoint as { payload?: { item?: HogItem } }).payload?.item;
            if (item) onSelect(item);
          }}
        >
          {data.map((d) => (
            <Cell
              key={d.key}
              fill={d.fill}
              fillOpacity={hoveredPath && hoveredPath !== d.key ? 0.4 : 1}
              stroke={hoveredPath === d.key ? "#ffffff" : undefined}
              cursor="pointer"
              onMouseEnter={() => onHover(d.key)}
              onMouseLeave={() => onHover(null)}
            />
          ))}
          <LabelList
            dataKey="rawSize"
            position="right"
            formatter={(value) => formatBytes(Number(value ?? 0))}
            style={{ fontSize: 11, fill: "#cbd5e1" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DonutView({
  items,
  totalBytes,
  hoveredPath,
  onHover,
  onSelect,
}: {
  items: HogItem[];
  totalBytes: number;
  hoveredPath: string | null;
  onHover: (path: string | null) => void;
  onSelect: (item: HogItem) => void;
}) {
  const slices: SliceDatum[] = items
    .slice(0, MAX_SLICES)
    .map((item) => ({ key: item.path, name: item.name, value: item.size, fill: colorForItem(item), item }));

  const otherSum = items.slice(MAX_SLICES).reduce((sum, item) => sum + item.size, 0);
  if (otherSum > 0) {
    slices.push({ key: "__other__", name: "Other items", value: otherSum, fill: OTHER_ITEMS_COLOR });
  }
  const shownSum = items.reduce((sum, item) => sum + item.size, 0);
  const rest = Math.max(0, totalBytes - shownSum);
  if (rest > 0) {
    slices.push({ key: "__rest__", name: "Rest of drive", value: rest, fill: REST_COLOR });
  }

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={68}
              outerRadius={105}
              paddingAngle={1}
              isAnimationActive={false}
              stroke="#0a0a0a"
              strokeWidth={1}
              onMouseEnter={(_, index) => onHover(slices[index]?.item ? slices[index].key : null)}
              onMouseLeave={() => onHover(null)}
              onClick={(_, index) => {
                const slice = slices[index];
                if (slice?.item) onSelect(slice.item);
              }}
            >
              {slices.map((slice) => (
                <Cell
                  key={slice.key}
                  fill={slice.fill}
                  cursor={slice.item ? "pointer" : undefined}
                  fillOpacity={hoveredPath && slice.key !== hoveredPath ? 0.4 : 1}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg font-semibold tabular-nums">{formatBytes(totalBytes)}</div>
          <div className="text-xs opacity-60">scanned total</div>
        </div>
      </div>

      <div className="mt-3 space-y-0.5 text-xs">
        {slices.map((slice) => (
          <div
            key={slice.key}
            onMouseEnter={() => slice.item && onHover(slice.key)}
            onMouseLeave={() => onHover(null)}
            onClick={() => slice.item && onSelect(slice.item)}
            className={`flex items-center gap-2 rounded px-1 py-0.5 ${
              hoveredPath === slice.key ? "bg-white/10" : ""
            } ${slice.item ? "cursor-pointer hover:bg-white/5" : ""}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: slice.fill }} />
            <span className="flex-1 truncate" title={slice.item?.path ?? slice.name}>
              {slice.name}
            </span>
            <span className="tabular-nums opacity-80">{formatBytes(slice.value)}</span>
            <span className="w-12 shrink-0 text-right tabular-nums opacity-60">
              {formatPercent(slice.value, totalBytes)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
