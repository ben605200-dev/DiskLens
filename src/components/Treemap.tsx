import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import type { ChildOut, HogItem } from "../types";
import { formatBytes } from "../lib/format";
import { extOf, iconForItem, patternFill, patternIndexFor, treemapColor } from "../lib/fileTypes";

const MAX_BLOCKS = 500;
const HEIGHT = 460;

/** A block shown as one treemap tile ("other" aggregates tiny items). */
interface BlockItem {
  path: string;
  name: string;
  kind: "file" | "folder" | "link" | "other";
  size: number;
  isCloud?: boolean | null;
}

interface TmNode {
  name: string;
  size?: number;
  item?: BlockItem;
  children?: TmNode[];
}

interface Props {
  rootPath: string;
  selectedType: string | null;
  minBytes: number;
  search: string;
  onSelect: (item: HogItem) => void;
}

export default function Treemap({ rootPath, selectedType, minBytes, search, onSelect }: Props) {
  const [crumbs, setCrumbs] = useState<string[]>([rootPath]);
  const [children, setChildren] = useState<ChildOut[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [width, setWidth] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset to the scan root whenever a new scan finishes.
  useEffect(() => {
    setCrumbs([rootPath]);
  }, [rootPath]);

  const currentPath = crumbs[crumbs.length - 1];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    invoke<ChildOut[]>("list_children", { path: currentPath })
      .then((list) => {
        if (!cancelled) {
          setChildren(list);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setChildren([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observe = () => setWidth(el.clientWidth);
    observe();
    const observer = new ResizeObserver(observe);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Apply the active filters, then group tiny items into one "Other" block.
  const blocks = useMemo<BlockItem[]>(() => {
    if (!children) return [];
    const query = search.trim().toLowerCase();
    const filtered: BlockItem[] = children
      .filter((c) => {
        if (c.size < minBytes) return false;
        if (query && !c.name.toLowerCase().includes(query)) return false;
        if (selectedType) {
          if (c.kind !== "file") return false;
          if (extOf(c.name) !== selectedType) return false;
        }
        return true;
      })
      .map((c) => ({
        path: c.path,
        name: c.name,
        kind: c.kind,
        size: c.size,
        isCloud: c.isCloud,
      }));

    filtered.sort((a, b) => b.size - a.size);
    if (filtered.length <= MAX_BLOCKS) return filtered;

    const kept = filtered.slice(0, MAX_BLOCKS - 1);
    const restList = filtered.slice(MAX_BLOCKS - 1);
    const restBytes = restList.reduce((sum, item) => sum + item.size, 0);
    kept.push({
      path: "__other__",
      name: `Other (${restList.length.toLocaleString()} items)`,
      kind: "other",
      size: restBytes,
    });
    return kept;
  }, [children, minBytes, search, selectedType]);

  const leaves = useMemo(() => {
    if (blocks.length === 0) return [];
    const rootData: TmNode = {
      name: "root",
      children: blocks.map((item) => ({ name: item.name, size: item.size, item })),
    };
    const root = hierarchy<TmNode>(rootData)
      .sum((node) => node.size ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return treemap<TmNode>()
      .size([Math.max(320, width), HEIGHT])
      .paddingInner(2)
      .paddingOuter(0)
      .round(true)
      .tile(treemapSquarify)(root)
      .leaves();
  }, [blocks, width]);

  const hoveredItem = blocks.find((b) => b.path === hoveredPath) ?? null;

  function handleBlockClick(item: BlockItem) {
    if (item.kind === "folder") {
      setCrumbs([...crumbs, item.path]);
      setHoveredPath(null);
      return;
    }
    if (item.kind === "file") {
      onSelect({
        path: item.path,
        name: item.name,
        size: item.size,
        kind: "file",
        modifiedMs: 0,
        createdMs: 0,
      });
    }
  }

  return (
    <section className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium opacity-80">Treemap - current folder's biggest items</h2>
        <span className="text-xs opacity-50">
          Click a folder to drill in; blocks are sized by total size
        </span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs">
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb}>
            {index > 0 && <span className="opacity-40">›</span>}
            <button
              className={`max-w-56 truncate rounded px-1.5 py-0.5 ${
                index === crumbs.length - 1 ? "bg-neutral-800" : "opacity-70 hover:bg-neutral-800/60"
              }`}
              title={crumb}
              onClick={() => setCrumbs(crumbs.slice(0, index + 1))}
            >
              {crumbLabel(crumb, rootPath)}
            </button>
          </Fragment>
        ))}
      </div>

      <div
        ref={containerRef}
        className="relative"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseLeave={() => {
          setPointer(null);
          setHoveredPath(null);
        }}
      >
        {loading && <div className="p-4 text-sm opacity-60">Loading folder...</div>}
        {error && (
          <div className="rounded border border-red-900 bg-red-950/50 p-3 text-sm">{error}</div>
        )}
        {!loading && !error && blocks.length === 0 && (
          <div className="p-4 text-sm opacity-60">This folder has no items matching the filters.</div>
        )}

        {blocks.length > 0 && (
          <svg width={Math.max(320, width)} height={HEIGHT} className="select-none">
            <defs>
              {[0, 1, 2].map((i) => (
                <pattern
                  key={i}
                  id={`dl-pattern-${i}`}
                  width={8}
                  height={8}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1={0} y1={0} x2={0} y2={8} stroke="rgba(255,255,255,0.28)" strokeWidth={2.5} />
                </pattern>
              ))}
            </defs>
            {leaves.map((leaf) => {
              const item = leaf.data.item;
              if (!item) return null;
              const w = leaf.x1 - leaf.x0;
              const h = leaf.y1 - leaf.y0;
              const hovered = hoveredPath === item.path;
              const clickable = item.kind === "file" || item.kind === "folder";
              const fill =
                item.kind === "other" ? "#475569" : treemapColor(item.kind, item.name, item.isCloud);
              const darkText = item.kind !== "other" && item.kind !== "link";
              const showName = w > 64 && h > 22;
              const showSize = w > 64 && h > 40;
              return (
                <g
                  key={item.path}
                  transform={`translate(${leaf.x0},${leaf.y0})`}
                  className={clickable ? "cursor-pointer" : "cursor-default"}
                  onMouseEnter={() => setHoveredPath(item.path)}
                  onClick={() => handleBlockClick(item)}
                >
                  <rect width={w} height={h} fill="rgba(0,0,0,0.35)" rx={3} />
                  <rect
                    width={w}
                    height={h}
                    fill={fill}
                    fillOpacity={hovered ? 0.95 : 0.8}
                    stroke={hovered ? "#ffffff" : "none"}
                    strokeWidth={hovered ? 1.5 : 0}
                    rx={3}
                  />
                  <rect
                    width={w}
                    height={h}
                    fill={patternFill(patternIndexFor(item.name))}
                    rx={3}
                    pointerEvents="none"
                  />
                  {showName && (
                    <text
                      x={6}
                      y={17}
                      fontSize={11}
                      fontWeight={600}
                      fill={darkText ? "#0b1220" : "#e2e8f0"}
                      pointerEvents="none"
                    >
                      {iconForItem({ kind: item.kind === "folder" ? "folder" : "file", name: item.name })}{" "}
                      {truncate(item.name, w)}
                    </text>
                  )}
                  {showSize && (
                    <text
                      x={6}
                      y={33}
                      fontSize={10}
                      fill={darkText ? "rgba(11,18,32,0.75)" : "rgba(226,232,240,0.75)"}
                      pointerEvents="none"
                    >
                      {formatBytes(item.size)}
                      {item.isCloud ? " · cloud" : ""}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {hoveredItem && pointer && (
          <div
            className="pointer-events-none absolute z-10 max-w-72 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs shadow-lg"
            style={{ left: Math.min(pointer.x + 12, Math.max(0, width - 280)), top: pointer.y + 12 }}
          >
            <div className="truncate font-medium" title={hoveredItem.path}>
              {hoveredItem.name}
            </div>
            <div className="opacity-70">
              {formatBytes(hoveredItem.size)} · {kindLabel(hoveredItem.kind)}
              {hoveredItem.isCloud ? " · stored in the cloud" : ""}
            </div>
            {hoveredItem.kind === "folder" && (
              <div className="opacity-50">Click to open this folder</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function kindLabel(kind: BlockItem["kind"]): string {
  switch (kind) {
    case "folder":
      return "Folder";
    case "link":
      return "Link (not followed)";
    case "other":
      return "Grouped small items";
    default:
      return "File";
  }
}

function crumbLabel(path: string, rootPath: string): string {
  if (path === rootPath) return path;
  const parts = path.split("\\");
  return parts[parts.length - 1] || path;
}

function truncate(name: string, blockWidth: number): string {
  const maxChars = Math.max(4, Math.floor((blockWidth - 22) / 6.4));
  return name.length > maxChars ? `${name.slice(0, maxChars - 1)}…` : name;
}
