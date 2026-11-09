#Requires -Version 5.1
<#
.SYNOPSIS
    Configures branch protection for the "main" branch of the DiskLens repo.

.DESCRIPTION
    Uses the GitHub CLI (`gh api`) only. No tokens are stored anywhere in this
    script - authentication comes from your normal `gh auth login` session.

    What it enforces on "main":
      * Pull requests required before merging (0 required approvals)
      * The CI check must pass (context: the "ci" job of the CI workflow)
      * Conversations must be resolved
      * Linear history (no merge commits)
      * No force pushes, no branch deletion

    Run this ONLY after the repository exists on GitHub and has been pushed at
    least once. It requires admin rights on the repository.

.EXAMPLE
    .\scripts\protect-main.ps1
    .\scripts\protect-main.ps1 -Repo "ben605200-dev/DiskLens" -Branch main -RequiredCheck ci
#>
[CmdletBinding()]
param(
    [string]$Repo = "ben605200-dev/DiskLens",
    [string]$Branch = "main",
    [string]$RequiredCheck = "ci"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI (gh) not found. Install it with: winget install --id GitHub.cli"
}

gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Not signed in to the GitHub CLI. Run: gh auth login"
}

Write-Host "Applying branch protection to $Repo ($Branch)..."

$body = @{
    required_status_checks = @{
        strict   = $true
        contexts = @($RequiredCheck)
    }
    enforce_admins = $false
    required_pull_request_reviews = @{
        dismiss_stale_reviews           = $false
        require_code_owner_reviews      = $false
        required_approving_review_count = 0
        require_last_push_approval      = $false
    }
    restrictions = $null
    required_linear_history = $true
    allow_force_pushes = $false
    allow_deletions = $false
    required_conversation_resolution = $true
    lock_branch = $false
    allow_fork_syncing = $false
} | ConvertTo-Json -Depth 5

$body | gh api --method PUT "repos/$Repo/branches/$Branch/protection" --input -
if ($LASTEXITCODE -ne 0) {
    throw "Failed to update branch protection for $Repo ($Branch)."
}

Write-Host ""
Write-Host "Done. '$Branch' is now protected:"
Write-Host "  - pull requests required (0 required approvals)"
Write-Host "  - CI check '$RequiredCheck' must pass (strict, branch must be up to date)"
Write-Host "  - conversations must be resolved, linear history only"
Write-Host "  - force pushes and deletions are blocked"
