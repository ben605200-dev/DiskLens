# AGENTS.md

DiskLens: open-source Windows 11 desktop app that scans a drive or folder and shows what uses the most storage: file/folder path, size, and % of total. Must work on drives from 256 GB to 1.5 TB (SSD or HDD).

## RULES
- Do ONE task at a time. Never start the next task until I say "next".
- Keep code simple and readable. No over-engineering, no extra features.
- Never load the full file list into the frontend. The backend sends small summaries and top-N lists only.
- Memory target: under 500 MB for about 5 million files.
- After every task: run the tests and build, fix errors, then commit with a clear message.
- After every task, reply with exactly 3 lines: what was done / how to run it on Windows 11 / what is next.
- If a command fails, show me the error and fix it. Never skip it.
- Tick finished tasks in PLAN.md.
- If I say "Stop. Re-read the rules", re-read this prompt (saved in AGENTS.md) and fix only the failing item.

## PRIVACY (strict)
- The app is 100% local: no telemetry, analytics, or network calls.
- Never put real usernames, real paths, machine names, emails, or tokens anywhere (code, tests, docs, commits). Use fake paths like C:\Users\Example\.
- Mask the Windows username in any exported or copied text (use %USERPROFILE%).
- Use only my GitHub handle: ben605200-dev. Never write an email address anywhere.
- Never push, publish, or change GitHub settings on your own. Do these only when the user explicitly requests that action in the current message; otherwise, only tell the user what to run.

## WINDOWS HANDLING
- Do not follow junctions, symlinks, or reparse points (no infinite loops, no double counting).
- Count hard links once.
- Never trigger OneDrive downloads; mark cloud files separately.
- Support long paths (over 260 characters).
- Skip permission-denied folders without crashing and report a skipped count.
