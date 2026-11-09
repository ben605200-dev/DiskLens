# Privacy

DiskLens is designed to be 100% local. This page explains exactly what the app
does and does not do with your data.

## No network activity

DiskLens makes no network requests:

- No telemetry, analytics, crash reporting, or usage statistics.
- No auto-updates and no update checks.
- No accounts, sign-ins, or cloud features.

You can verify this yourself: the app contains no HTTP client code, and you can
watch its network activity with any network monitor while it runs.

## What is stored on your computer

- **Settings only.** Your preferences (theme, accent color, size units, default
  view, excluded folders, and so on) are saved as a small JSON file in the
  standard app-data folder: `%APPDATA%\com.ben605200dev.disklens\settings.json`.
- **Scan results are never written to disk.** The scan tree lives in the app's
  memory only and is discarded when the app closes.
- Nothing is written anywhere else - no logs with file names, no caches with paths.

## What the scanner reads

The scanner reads file and folder **metadata** (size, dates, file type) to build
the scan tree. It does not open, read, or upload file contents. OneDrive and
other cloud placeholder files are detected by their attributes and are never
downloaded or hydrated.

## Copied text

When you use "Copy path" in the detail panel, the Windows user folder is
replaced with `%USERPROFILE%` before the path lands on your clipboard, for
example `%USERPROFILE%\Downloads\video.mp4`.

## Issue reports

If you file a bug report, only include what you choose to write there. Follow
the warning in the bug template and replace personal paths with placeholders
such as `C:\Users\Example\`.

## Questions

Open a regular GitHub issue in this repository.
