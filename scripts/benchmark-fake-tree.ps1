#Requires -Version 5.1
<#
.SYNOPSIS
    Generates a large fake tree (~1,000,000 small files) in the temp folder,
    scans it with the real DiskLens scanner, and reports scan time and peak
    memory.

.DESCRIPTION
    The tree is created under $env:TEMP\disklens-benchmark-tree:
      10 parts x 20 folders x 5,000 files = 1,000,000 files.

    The scan runs through the headless benchmark example
    (src-tauri\examples\scan_bench.rs) in release mode, so the numbers are
    comparable to the real app.

.PARAMETER Files
    Total number of files to create (default 1000000).

.PARAMETER Keep
    Keep the generated tree afterwards (default: keep, since rebuilding takes
    a while). Delete it manually when done - see the printed hint.

.EXAMPLE
    .\scripts\benchmark-fake-tree.ps1
    .\scripts\benchmark-fake-tree.ps1 -Files 200000 -Keep
#>
[CmdletBinding()]
param(
    [int]$Files = 1000000,
    [switch]$Keep
)

$ErrorActionPreference = "Stop"

$root = Join-Path $env:TEMP "disklens-benchmark-tree"
$parts = 10
$dirsPerPart = 20
$filesPerDir = [Math]::Ceiling($Files / ($parts * $dirsPerPart))

$drive = (Get-Item $env:TEMP).PSDrive
if ($drive.Free -lt 6GB) {
    throw "Not enough free space on $($drive.Name): for ~1,000,000 small files (needs roughly 4-5 GB)."
}

Write-Host "Generating ~$Files files under a temp folder..."
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$content = New-Object byte[] 16
[System.Random]::new(1337).NextBytes($content)

$created = 0
for ($p = 0; $p -lt $parts; $p++) {
    for ($d = 0; $d -lt $dirsPerPart; $d++) {
        $dir = Join-Path $root ("part-{0:00}\dir-{1:000}" -f $p, $d)
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        for ($f = 0; $f -lt $filesPerDir -and $created -lt $Files; $f++) {
            $file = Join-Path $dir ("file-{0:000000}.bin" -f $f)
            [System.IO.File]::WriteAllBytes($file, $content)
            $created++
        }
    }
    Write-Host ("  created {0:N0} files..." -f $created)
}
$sw.Stop()
Write-Host ("Creation finished: {0:N0} files in {1:n1} s" -f $created, $sw.Elapsed.TotalSeconds)

Write-Host ""
Write-Host "Scanning with the DiskLens scanner (release build)..."
$srcTauri = Join-Path $PSScriptRoot "..\src-tauri"
Push-Location $srcTauri
try {
    $output = cargo run --release --quiet --example scan_bench -- $root
    if ($LASTEXITCODE -ne 0) { throw "scan_bench failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "=== Scan results ==="
$output | ForEach-Object { Write-Host "  $_" }

if (-not $Keep) {
    Write-Host ""
    Write-Host "The tree was kept (rebuilding it takes a while)."
}
Write-Host ""
Write-Host "To delete the tree later, run in PowerShell:"
Write-Host ('  Remove-Item -Recurse -Force "{0}"' -f $root)
