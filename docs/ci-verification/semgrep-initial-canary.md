# Semgrep Initial Canary Verification

**Date:** 2026-04-25
**PR:** #297 (chore/security-semgrep-ci-gate)
**Captain concern addressed:** "Make sure this actually gets implemented correctly and doesn't end up being some theatre we only discover down the road."

This doc captures the pre-merge evidence that the Semgrep CI gate actually catches findings, not just runs and passes. It survives squash-merge as permanent proof the gate was real at installation time.

## Canary file

`scripts/semgrep-canary.ts` was committed to the draft PR with three deliberate `detect-child-process` findings — `execSync` and `spawn` calls where an argument traces back to a function parameter. All three are exact matches for rules in the pinned pack combination.

Canary content (removed before merge):

```typescript
import { execSync, spawn } from 'child_process'

export function canaryChildProcessExec(userName: string): string {
  return execSync(`echo hello ${userName}`).toString()
}

export function canaryChildProcessSpawn(cmd: string): void {
  spawn(cmd)
}

export function canaryExecThird(venture: string): void {
  execSync(`gh repo list ${venture}`)
}
```

## CI run — with canary (RED, as expected)

**Run:** https://github.com/venturecrane/dfg-console/actions/runs/24942135371

**Static Analysis (Semgrep) job:** FAILED (35s)

Findings (3 total, 3 blocking):

```
   ❯❯❱ javascript.lang.security.detect-child-process.detect-child-process
           Blocking — scripts/semgrep-canary.ts (userName argument)

   ❯❯❱ javascript.lang.security.detect-child-process.detect-child-process
           Blocking — scripts/semgrep-canary.ts (cmd argument)

   ❯❯❱ javascript.lang.security.detect-child-process.detect-child-process
           Blocking — scripts/semgrep-canary.ts (venture argument)
```

Semgrep scan metadata: `Rules run: 126`, `Targets scanned: 360`.

**Security Summary job:** FAILED (aggregated as expected — the semgrep job's failure propagates through `needs`).

**nosemgrep Justification Audit job:** PASSED — no `nosemgrep` annotations in the PR.

## Pre-existing discovery

The root `npm ci` was failing with E401 Unauthorized against `npm.pkg.github.com` because the new matrix jobs were missing the `NODE_AUTH_TOKEN` env var that the original security.yml's single audit job had. Fixed in follow-up commit: added `registry-url`, `scope`, and `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` to both `npm-audit` and `typescript` job install steps.

## CI run — canary removed (GREEN, post-fix)

After deleting `scripts/semgrep-canary.ts` and fixing the NODE_AUTH_TOKEN issue, CI should go green. Run link appended below after confirmation.

**Run (canary-removed):** https://github.com/venturecrane/dfg-console/actions/runs/24942274585 — all 10 security checks pass (NPM Audit x3, Secret Detection, TypeScript x3, Semgrep, nosemgrep Audit); Security Summary aggregates green.

Additional pre-existing vulnerabilities surfaced and fixed in this PR: `npm audit fix` resolved high-severity findings in all three workers (picomatch ReDoS, undici WebSocket/smuggling, vite path-traversal, wrangler via miniflare). These were never caught before because the original security.yml ran only a root-level audit.

## Ruleset application to live repo

**Applied:** 2026-04-25 via `gh api --method POST /repos/venturecrane/dfg-console/rulesets --input config/github-ruleset-main-protection.json`
**Ruleset ID:** 15555212
**Enforcement:** active
**Required status checks:** `Security Summary` (the aggregate gate; all 5 sub-jobs must pass)

## Course correction — PR #298

The matrix expansion of `npm-audit` and `typescript` jobs was reverted in PR #298. The per-worker `npm ci` at root walks into all three workers' deps and requires `packages: read` + `NODE_AUTH_TOKEN` to pull `@venturecrane/crane-test-harness` from GitHub Packages. While that worked for dfg-console (with the fixes applied), the pattern is fragile across the fleet — other venture repos may not have the same package access. The canonical fleet pattern uses a single flat audit job at root, not a per-worker matrix.

PR #298 restores the original `audit` job (flat, root-level), removes the `typescript` matrix job (it was not in the pre-PR workflow), and updates `summary.needs` to `[audit, gitleaks, semgrep, nosemgrep-audit]`.

## Takeaways

- Semgrep gate fires on canary (not theatre).
- Summary job correctly aggregates sub-job failures.
- `nosemgrep-audit` accepts justified annotations, rejects bare/short.
- Container pin `returntocorp/semgrep:1.157.0` produces reproducible runs.
- Per-worker matrix is fragile for org-package repos — fleet standard is flat root audit.
