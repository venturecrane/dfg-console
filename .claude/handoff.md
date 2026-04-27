# Handoff

**Venture:** Durgan Field Guide
**Status:** blocked
**Session:** sess_01KNQF5BE66FKD1W77R16JJ9GJ
**Agent:** crane-mcp-mbp27
**Date:** 2026-04-08T21:27:11.021Z
**Issue:** #283

## Summary

## Issue #283: Dependabot PR Triage

### Actions Taken

1. **PR #271 (rollup 4.53.5 → 4.59.0)**: ✅ Merged successfully
   - Verified with `npm run verify` after building `@dfg/types`
   - Merged via `gh pr merge --squash --delete-branch`

2. **PRs #273, #278-#282**: ⚠️ Blocked by root cause issue
   - All 6 remaining PRs fail CI due to `next lint` command removal in Next.js 16
   - Left comments on each PR explaining the blocker

### Root Cause Discovered

**Issue #284 created**: `next lint` was removed in Next.js 16, but the dfg-app lint script still uses it. This was introduced in PR #275 (Next.js 14→16 upgrade) which was merged despite CI failures.

### Current State

- **Before**: 7 open dependabot PRs, oldest 36 days
- **After**: 6 open dependabot PRs (1 merged, 6 blocked)
- **Blocker**: #284 must be fixed before remaining PRs can be merged

### Next Steps

1. Fix #284 by updating `apps/dfg-app/package.json` to use `eslint .` instead of `next lint`
2. Once CI is green on main, resume dependabot triage for remaining 6 PRs
3. Consider investigating why PR #275 was merged with failing CI (required checks may need updating)
