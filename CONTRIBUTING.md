# Contributing to DiskLens

Thanks for your interest! This project is small and simple on purpose, and
contributions that keep it that way are very welcome.

## Prerequisites

- Windows 11
- [Rust](https://rustup.rs) with the MSVC toolchain
- [Node.js](https://nodejs.org) 20 or newer
- Visual Studio Build Tools with the "C++ build tools" workload

## Getting started

```powershell
npm install
npm run tauri dev      # run the app against your local changes
```

## Before you open a pull request

Run everything the CI runs:

```powershell
# frontend
npm run build

# backend (in src-tauri)
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build
```

All of these must pass. CI enforces them on `windows-latest`.

## Ground rules

DiskLens has a few hard promises. Please do not break them:

1. **Stay 100% local.** No network calls, telemetry, analytics, or update
   checks. Pull requests that add any of these will be rejected.
2. **Never send the full file list to the UI.** The backend sends summaries and
   top-N lists only; this is what keeps memory under control on multi-million
   file drives.
3. **Privacy.** Never put real usernames, real paths, machine names, or email
   addresses in code, tests, docs, or commits. Use placeholders like
   `C:\Users\Example\` and `%USERPROFILE%`.
4. **Windows correctness.** Junctions/symlinks/reparse points are never
   followed, hard links count once, cloud placeholders are never downloaded,
   and paths over 260 characters must keep working.

## Code style

- Rust: `cargo fmt`, clippy clean, small focused functions, comments where the
  Windows handling is subtle.
- TypeScript/React: keep components small; prefer clear names over clever code.
- Commit messages: a short imperative summary line.

## Pull requests

Fill in the pull request template. Keep changes focused - one topic per PR
makes review fast. If you change behavior, add or update tests.
