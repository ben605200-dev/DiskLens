# DiskLens

DiskLens is a free, open-source Windows 11 app that shows what is using the space
on your drive: the biggest files and folders, ranked, graphed, and mapped.

- **100% local.** No telemetry, no analytics, no network calls. See [PRIVACY.md](PRIVACY.md).
- **Built for real drives** (256 GB to 1.5 TB, SSD or HDD), scanned in parallel with [jwalk](https://crates.io/crates/jwalk).
- **Top Space Hogs:** rank, type icon, name, location, size, share of the drive, modified date; filters for type, minimum size, age, and search.
- **Charts:** horizontal bar chart (log-scale option) and a donut with a grey "Rest of drive" slice.
- **Dashboard:** summary cards, used-vs-free drive bar, file-type breakdown, and a plain-language sentence like "Videos use 312 GB, 34% of this scan".
- **Treemap:** drill into folders with breadcrumbs, tooltips, and color-blind-safe colors plus labels and patterns.
- **Windows-aware:** junctions and symlinks are never followed, hard links are counted once, OneDrive placeholders are marked and never downloaded, paths over 260 characters work, and permission-denied folders are reported as skipped.

## How it works

The Rust backend walks the drive in parallel and builds a compact in-memory tree.
The user interface only ever receives small summaries and top-N lists - the full
file list never crosses into the frontend, which keeps memory low (target: under
500 MB for about 5 million files).

## Build from source

Requirements: Windows 11, [Rust](https://rustup.rs) (MSVC toolchain),
[Node.js](https://nodejs.org) 20 or newer, and Visual Studio Build Tools with the
"C++ build tools" workload. WebView2 is already part of Windows 11.

```powershell
npm install
npm run tauri dev         # run the app in development
npm run build:installer   # NSIS installer  -> src-tauri/target/release/bundle/nsis/
npm run build:portable    # portable exe    -> src-tauri/target/release/disklens.exe
```

Run the tests:

```powershell
cd src-tauri
cargo test
```

## Project layout

- `src/` - React + TypeScript UI (views, charts, treemap)
- `src-tauri/` - Rust backend (parallel scanner, Tauri commands, tests)
- `scripts/` - maintenance scripts (branch protection, fake-tree generator)
- `.github/` - CI, issue templates, Dependabot

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).
Found a security issue? Please report it privately - see [SECURITY.md](SECURITY.md).

## License

MIT - see [LICENSE](LICENSE). Copyright (c) 2026 ben605200-dev.
