# Security Policy

## Supported versions

Only the latest release of DiskLens is supported with security fixes.

| Version | Supported |
| ------- | --------- |
| latest release | yes |
| older releases | no |

## Reporting a vulnerability

Please report vulnerabilities **privately** through GitHub:

1. Open the repository on GitHub.
2. Go to the **Security** tab.
3. Click **Report a vulnerability** (GitHub private vulnerability reporting).

Do **not** open a public issue for security problems, and please do not post
details anywhere public before a fix is released.

## What to include

- A clear description of the issue and its impact.
- Steps to reproduce, or a small proof-of-concept.
- The DiskLens version you tested (Settings does not show it yet; use the
  release name, e.g. `0.1.0`).
- Windows version and, if relevant, drive type (SSD/HDD) and size.

Replace any personal paths with placeholders such as `C:\Users\Example\` before
posting logs or screenshots.

## Scope

Things that are especially interesting to us:

- Unsafe behavior around junctions, symlinks, reparse points, or hard links.
- Cases where the app unexpectedly reads file *contents*, downloads cloud
  placeholders, or writes outside its app-data folder.
- Installer or privilege issues.
- Any way to make the app send data over the network (it is designed never to).

## Response

This is a volunteer-maintained project, so responses are best-effort - usually
within a week. We will confirm the report, keep you updated, and credit you in
the release notes if you would like.
