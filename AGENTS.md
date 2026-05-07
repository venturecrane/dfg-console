# Durgan Field Guide (DFG) — Codex Instructions

DFG is an operator tool and subscription SaaS for identifying undervalued physical assets and producing conservative, explainable flip guidance. It is not a marketplace and must not inflate confidence.

## Coding Standards

All code edits MUST follow the Venture Crane portfolio coding standard, fetched via `crane_doc('global', 'coding-standards.md')`. Key directives that apply on every change:

- Parse external inputs with Zod; never `as` cast at trust boundaries.
- No floating Promises; explicitly `await` or attach a `.catch`.
- No module-level state in Cloudflare Workers (per-isolate state leaks across requests).
- File/function ceilings: 500 lines/file, 75 lines/function, complexity 15, depth 4, params 5.
- No default exports outside framework-required positions (Astro pages, Next.js App Router files, Workers entry).
- Fetch the global doc for the full 12 directives with good/bad examples and per-stack notes.

Mechanical enforcement status: dfg-console's `eslint.config.js` does NOT yet enforce the portfolio rule set; lint catches only the basic recommended rules. Self-discipline is required until the per-venture eslint adoption initiative reaches dfg-console (audit doc: `docs/research/venture-eslint-adoption-audit-2026-05-06.md` in venturecrane/crane-console). The portfolio rules are nonetheless mandatory; treat the global doc as the source of truth.

These portfolio standards are PRIMARY. The DFG-specific review guidelines below (money math, staleness gating, Cloudflare hygiene, mobile patterns) are ADDITIONAL — they apply on top of the portfolio standard, not instead of it.

## Repository structure

```
dfg/
├── apps/
│   └── dfg-app/          # Next.js 14 operator console (React, TypeScript, Tailwind)
├── workers/
│   ├── dfg-api/          # Cloudflare Worker - REST API for opportunities
│   ├── dfg-scout/        # Cloudflare Worker - auction scraping/pipeline
│   └── dfg-analyst/      # Cloudflare Worker - AI analysis engine
├── packages/             # Shared packages (currently minimal)
├── docs/                 # Documentation and specs
└── AGENTS.md            # This file - Codex review guidelines
```

**Key technologies:**

- Frontend: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- Backend: Cloudflare Workers, D1 (SQLite), R2 (object storage)
- Auth: Bearer tokens (OPS_TOKEN, ADMIN_TOKEN)

## Dev environment

```bash
# Install dependencies (from repo root)
npm install

# Frontend (dfg-app)
cd apps/dfg-app
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run type-check   # TypeScript check
npm run lint         # ESLint

# Workers (each worker directory)
cd workers/dfg-api   # or dfg-scout, dfg-analyst
npx tsc --noEmit     # TypeScript check
npx wrangler dev     # Local dev server
npx wrangler deploy  # Deploy to Cloudflare
```

## Review guidelines

### P0 blockers (must flag; do not approve)

- Money-math correctness regressions anywhere (UI, API, analyst, exports).
- Any double-counting or semantic drift between: buyer premium, listing fees, processing fees, transport, repairs.
- Conflicting numbers shown to operators for the same concept (two sources of truth).
- Exposed debug endpoints without auth/allowlist, hardcoded creds/secrets, permissive CORS, or leaking env vars to client bundles.
- Public access to immutable snapshots (R2) without signing/expiry when sensitive.

### Canonical money math (non-negotiable)

Use these exact definitions everywhere:

- Acquisition Cost = Bid + Buyer Premium + Transport + Immediate Repairs
- Net Proceeds = Sale Price − Listing Fees − Payment Processing
- Profit = Net Proceeds − Acquisition Cost
- Margin % = (Profit / Acquisition Cost) \* 100

Rules:

- Listing fees are SELLING COSTS ONLY. Never included in acquisition cost. Never double-count.
- If any of these values are computed in multiple layers, call out drift risk and recommend a single canonical calculation module.

### Data credibility (trust > cleverness)

- If the operator can see two different values for the same thing (current bid, max bid, fee totals, profit, margin), treat as P0.
- Prefer “single displayed truth”: one canonical source and one computation path.
- If a value is derived, it must be labeled as derived and consistent with the stored inputs.

### Staleness & action gating (operator safety)

If analysis depends on any of these and they change, analysis must be marked stale and actions gated:

- currentBid / pricing inputs
- title/operator inputs (condition, location assumptions, etc.)
- fee rates or premium logic
- snapshot identity (lot/listing changes)

When stale or CRITICAL gates are open:

- “Bid/Proceed” actions must be disabled (or require explicit re-analyze).
- UI must clearly show last analyzed timestamp and the inputs used.

### Degrade gracefully

- If category/identity cannot be identified with confidence, verdict must be PASS (do not proceed to analysis; do not present fabricated precision).
- Unknowns increase risk penalties; do not “smooth over” missing data.

### Cloudflare Workers / data layer discipline

- Avoid high fan-out patterns; batch lookups. Be mindful of subrequest limits.
- R2 snapshots must be immutable (new key per snapshot; never overwrite truth).
- D1 writes must be idempotent; avoid expensive rewrites and duplicate rows.
- Retries must use backoff; avoid retry storms.

### Security basics

- Never commit secrets. Prefer runtime env vars.
- Ensure server-only secrets never reach Next.js client bundles.
- Restrict debug endpoints and internal admin routes behind auth + allowlist.

### Mobile-first requirements

DFG operators primarily use the app on iOS Safari. All UI changes must:

- Use `flex-col md:flex-row` for page layouts (mobile column, desktop row)
- Account for fixed Navigation header (h-14 spacer on mobile)
- Use `position: sticky` instead of `position: fixed` where possible
- Avoid `-webkit-transform: translateZ(0)` on body (breaks fixed positioning)
- Test touch interactions: 44px minimum tap targets, proper scroll behavior
- Use `pb-safe` for bottom-fixed elements (safe area inset)

Critical iOS Safari gotchas:

- Transforms create new stacking contexts (fixed children escape to viewport)
- Viewport height (100vh) includes Safari's address bar
- Use `min-h-screen` with flexbox instead of fixed heights

## What a good Codex review looks like (output format)

1. PR intent summary (3 bullets)
2. Blockers (P0) — each with:
   - Location (file path + symbol)
   - Problem (precise)
   - Why it matters (cash / credibility / security)
   - Minimal fix
   - Verification (exact test or manual QA)
3. High priority (P1) — same format
4. Nice-to-have (P2) — same format
5. Required tests / QA checklist

## Verification expectations for changes

- If money math is touched: require deterministic unit tests with fixed inputs that assert profit + margin exactly.
- If staleness/gating is touched: require a manual QA checklist proving gating works (stale banner, re-analyze, last analyzed).
- If scout/classification is touched: require parsing/classification tests that pin expected outputs.
- If security surface is touched: require explicit reasoning and a test or proof path (route protection, auth middleware, signed URLs, etc.).

## Codebase Review Task

When asked to "perform a DFG codebase review" or similar, execute this checklist:

### 1. Run automated checks

```bash
# Frontend
cd apps/dfg-app
npm run type-check 2>&1 | head -50
npm run lint 2>&1 | head -50
npm run build 2>&1 | tail -20

# Workers (run for each)
for worker in dfg-api dfg-scout dfg-analyst; do
  echo "=== $worker ==="
  cd workers/$worker
  npx tsc --noEmit 2>&1 | head -20
  cd ../..
done
```

### 2. Scan critical paths

Review these files for P0 issues:

- `apps/dfg-app/src/lib/api.ts` — API client, auth token handling
- `apps/dfg-app/src/lib/utils.ts` — Money math utilities
- `workers/dfg-api/src/routes/opportunities.ts` — SQL queries, status transitions
- `workers/dfg-api/src/core/http.ts` — CORS, auth middleware
- `workers/dfg-scout/src/index.ts` — Endpoint exposure, auth checks

### 3. Check for common issues

- [ ] No `Access-Control-Allow-Origin: *` in production code
- [ ] No template literal SQL (use `.bind()` parameterization)
- [ ] No exposed /debug/_ or /test/_ endpoints without auth
- [ ] No hardcoded secrets or API keys
- [ ] Money math matches canonical definitions above
- [ ] Mobile layouts use `flex-col md:flex-row` pattern

### 4. Output structured report

```markdown
# DFG Codebase Review — [DATE]

## Automated Check Results

- TypeScript: [PASS/FAIL with error count]
- ESLint: [PASS/FAIL with error count]
- Build: [PASS/FAIL]

## P0 Blockers

[List any blockers found, or "None found"]

## P1 High Priority

[List issues, or "None found"]

## P2 Nice-to-have

[List suggestions]

## Recommendations

[Action items for next sprint]
```
