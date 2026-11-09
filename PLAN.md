# DiskLens — PLAN

Stack: Tauri + Rust (jwalk scanner) + React + TypeScript + Tailwind; charts: recharts; treemap: d3.

## Folder structure (top level)
- `src/` — React + TypeScript UI (views, components, charts)
- `src-tauri/` — Rust backend: Tauri app, jwalk scanner, tests
- `scripts/` — helper scripts (fake-tree generator, protect-main.ps1)
- `.github/` — CI workflow, issue/PR templates, CODEOWNERS, dependabot
- Root files — README.md, AGENTS.md, PLAN.md, LICENSE, etc.

## Tasks
- [x] Step 0: Save AGENTS.md + PLAN.md, wait for "approved".
- [x] Task 1: Scaffold Tauri/React/TS/Tailwind and build the parallel jwalk scanner: progress events, ~1s cancel, compact tree, top-N lists, Windows rules, summary + tests.
- [x] Task 2: Top Space Hogs table + bar/donut graphs (recharts), tabs, Top-N selector, filters, detail panel, hover/click linking, throttled live updates.
- [x] Task 3: Dashboard summary cards + d3 treemap (drill-in, breadcrumbs, "Other" grouping, tooltips, color-blind-safe palette with non-color cues).
- [ ] Task 4: Settings page (theme, accent, density, units, defaults, excluded paths, font size, reduce motion) with CSS variables; Win11 look, keyboard nav, accessible contrast.
- [ ] Task 5: Community files (README, LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, PRIVACY, .gitignore), GitHub templates, CI (windows-latest + gitleaks), protect-main script, repo privacy scan.
- [ ] Task 6: NSIS installer + portable build, restart-as-admin button, 1M-file fake-tree benchmark, empty/loading/error states, fix build warnings.

## Assumptions
- Rust and Node.js are installed on the Windows 11 dev machine (I will check and report before building).
- OneDrive cloud-only files are detected via Windows file attributes so scans never trigger downloads.
- One scan runs at a time; the app stays 100% local (no telemetry, no network calls).
