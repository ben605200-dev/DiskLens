import type { Settings } from "../types";
import { setSizeUnits } from "./format";

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accent: "#0369A1",
  density: "comfortable",
  sizeUnits: "binary",
  defaultView: "dashboard",
  defaultTopN: 25,
  defaultGraph: "bar",
  excludedPaths: [],
  fontSize: 16,
  reduceMotion: false,
};

/** Curated accents with >= 4.5:1 contrast for white text. */
export const ACCENT_PRESETS = [
  { name: "Sky", value: "#0369A1" },
  { name: "Green", value: "#047857" },
  { name: "Violet", value: "#6D28D9" },
  { name: "Amber", value: "#B45309" },
  { name: "Rose", value: "#BE123C" },
  { name: "Teal", value: "#0F766E" },
];

export function resolvedTheme(theme: Settings["theme"]): "dark" | "light" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Pushes settings into the CSS variables / data attributes on <html>. */
export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(settings.theme);
  root.dataset.density = settings.density;
  root.dataset.reduceMotion = String(settings.reduceMotion);
  root.style.setProperty("--dl-font-size", `${settings.fontSize}px`);
  root.style.setProperty("--dl-accent", settings.accent);
  setSizeUnits(settings.sizeUnits);
}
