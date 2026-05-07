# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DFG (Durgan Field Guide) is an operator tool for identifying undervalued physical assets at auction and producing conservative flip guidance. The frontend is a Next.js 16 app; the backend consists of Cloudflare Workers.

## Repository Structure

```
dfg/
├── apps/
│   ├── dfg-app/           # Next.js 16 operator console (React, TypeScript, Tailwind)
│   └── dfg-core/          # Next.js 16 internal command center (port 3001)
├── workers/
│   ├── dfg-api/           # Cloudflare Worker - REST API for opportunities
│   ├── dfg-scout/         # Cloudflare Worker - auction scraping/pipeline
│   └── dfg-analyst/       # Cloudflare Worker - AI analysis engine
├── packages/dfg-types/    # Shared TypeScript types
└── docs/                  # Documentation and specs
```

**apps/dfg-core**: Internal PM/QA command center. Surfaces a GitHub-issue queue
dashboard (needs-qa, needs-pm, dev-queue, ready-to-merge, in-flight) sourced
from `venturecrane/dfg-console`. Protected by Clerk (shares the dfg-app Clerk
tenant; allowlist is managed in the Clerk dashboard). Runs on port 3001 and
deploys via Vercel. The GitHub repo and owner are overridable through
`GITHUB_OWNER` and `GITHUB_REPO` env vars (defaults: `venturecrane`,
`dfg-console`). Server-side `GITHUB_TOKEN` powers the proxy at
`/api/github`.

## Build Commands

```bash
# Install all dependencies (from repo root)
npm install

# Frontend (dfg-app)
cd apps/dfg-app
npm run dev              # Start dev server (localhost:3000) with Turbo
npm run build            # Production build
npm run type-check       # TypeScript check
npm run lint             # ESLint

# Workers (each worker directory)
cd workers/dfg-api       # or dfg-scout, dfg-analyst
npx wrangler dev         # Local dev server
npx wrangler deploy      # Deploy to Cloudflare
npx tsc --noEmit         # TypeScript check

# Worker-specific commands
cd workers/dfg-api
npm run test             # Run vitest tests
npm run test:watch       # Run vitest in watch mode
npm run db:migrate       # Run D1 migrations (remote)
npm run db:migrate:local # Run D1 migrations (local)

cd workers/dfg-scout
npm run dev              # Includes --test-scheduled flag
npm run test             # Run vitest tests

cd workers/dfg-analyst
npm run test             # Run acquisition tests (tsx)
npm run test:full        # Run full test suite

# Shared types package
cd packages/dfg-types
npm run build            # Build with tsup
npm run typecheck        # TypeScript check
```

## Architecture

**Data Flow:** Scout (scraping) → D1 (listings) → API (CRUD) → D1 (opportunities) → Analyst (AI evaluation)

**Tech Stack:**

- Frontend: Next.js 16 (App Router), React 18, TypeScript, Tailwind CSS, @clerk/nextjs
- Backend: Cloudflare Workers with Hono router
- Database: Cloudflare D1 (SQLite)
- Storage: Cloudflare R2 (photos, snapshots)
- AI: Claude API (Anthropic)

**Category System:** Analyst has three category tiers with different prompts, market comps, and profit thresholds:

- Power Tools: `prompts-power-tools.ts`, `analysis-power-tools.ts`
- Vehicles: `prompts-vehicles.ts`, `analysis-vehicles.ts`
- Trailers (default): `prompts.ts`, `analysis.ts`, `phoenix-market-data.ts`

## Canonical Money Math (Non-negotiable)

Use these exact definitions everywhere:

- **Acquisition Cost** = Bid + Buyer Premium + Transport + Immediate Repairs
- **Net Proceeds** = Sale Price − Listing Fees − Payment Processing
- **Profit** = Net Proceeds − Acquisition Cost
- **Margin %** = (Profit / Acquisition Cost) \* 100

Listing fees are SELLING COSTS ONLY. Never include in acquisition cost. Never double-count.

## iOS Safari / Mobile Patterns

DFG operators primarily use the app on iOS Safari. All UI changes must follow:

**Layout:**

- Use `flex flex-col md:flex-row` for page containers
- Navigation renders a fixed mobile header (h-14) - add spacer div on mobile
- Use `min-h-screen` instead of `h-screen` to avoid viewport issues

**Fixed/Sticky Elements:**

- Prefer `position: sticky` over `position: fixed`
- Never use `-webkit-transform: translateZ(0)` on body/ancestors (breaks fixed positioning)
- For bottom-fixed elements, use `pb-safe` class for safe area inset

**Touch:** Minimum 44x44px tap targets

**Example Page Layout:**

```tsx
<div className="flex flex-col md:flex-row min-h-screen w-full">
  <Navigation />
  <main className="flex-1 min-w-0">
    <div className="h-14 md:hidden" />
    <div className="p-4">{children}</div>
  </main>
</div>
```

## Code Style

- TypeScript strict mode
- Tailwind CSS for styling (no CSS modules)
- Use `cn()` utility from `src/lib/utils.ts` for conditional classes
- SQL queries must use `.bind()` parameterization (no template literals)

## CI Pipeline

All PRs must pass:

1. DFG App - lint, type-check, build
2. DFG API Worker - type-check, tests
3. DFG Scout Worker - type-check, tests

Run locally before pushing: `npm run lint && npm run type-check`

## Security Checklist

- No `Access-Control-Allow-Origin: *` in production
- No exposed /debug/_ or /test/_ endpoints without auth
- Server-only secrets never reach Next.js client bundles
- R2 snapshots must be immutable (new key per snapshot)

## Session Start

Every session must begin with:

1. Call the `crane_preflight` MCP tool (no arguments)
2. Call the `crane_sod` MCP tool with `venture: "dfg"`

This creates a session, loads documentation, and establishes handoff context. Additional workflow commands are available in `.claude/commands/`.

## Enterprise Rules

- **All changes through PRs.** Never push directly to main. Branch, PR, CI, QA, merge.
- **Never echo secret values.** Transcripts persist in ~/.claude/ and are sent to API providers. Pipe from Infisical, never inline.
- **Verify secret VALUES, not just key existence.** Agents have stored descriptions as values before.
- **Never auto-save to VCMS** without explicit Captain approval.
- **Scope discipline.** Discover additional work mid-task - finish current scope, file a new issue.
- **Escalation triggers.** Credential not found in 2 min, same error 3 times, blocked >30 min - stop and escalate.

## Instruction Modules

Detailed domain instructions stored as on-demand documents.
Fetch the relevant module when working in that domain.

| Module                | Key Rule (always applies)                                                                                                               | Fetch for details                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `coding-standards.md` | Parse external inputs (never cast); no floating Promises; no module-level state in Workers; 500/75/15 file/function/complexity ceilings | Portable TypeScript directives, agent-context arithmetic, per-stack notes |
| `secrets.md`          | Verify secret VALUES, not just key existence                                                                                            | Infisical, vault, API keys, GitHub App                                    |
| `content-policy.md`   | Never auto-save to VCMS; agents ARE the voice                                                                                           | VCMS tags, storage rules, editorial, style                                |
| `team-workflow.md`    | All changes through PRs; never push to main                                                                                             | Full workflow, escalation triggers                                        |
| `fleet-ops.md`        | Bootstrap phases IN ORDER: Tailscale > CLI > bootstrap > optimize > mesh                                                                | SSH, machines, Tailscale, macOS                                           |
| `pr-workflow.md`      | Push branch, `gh pr create`, never skip the PR                                                                                          | Branch naming, commit format, PR template                                 |

Fetch with: `crane_doc('global', '<module>')`
