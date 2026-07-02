# DFG Orchestrator

Policy-controlled LLM automation for DFG workflow management.

## Design Principles

1. **Generate → Policy → Act separation**: Model output is untrusted. The Policy phase validates and classifies before any action executes.

2. **Immutable audit trail**: Every task, action, and decision is logged with full provenance.

3. **Circuit breaker**: Persisted in D1, prevents runaway costs and error cascades.

4. **Phase-gated rollout**: Start with low-risk actions, add capabilities incrementally.

## Phase 0 (Current)

- **Trigger:** Manual dispatch only (no cron)
- **Task types:** `qa_plan` only
- **Action types:** `add_comment` only (auto-safe)
- **Blast radius:** Minimal (comments don't mutate workflow state)

## Quick Start

### 1. Install dependencies

```bash
cd workers/dfg-orchestrator
npm install
```

### 2. Create D1 database

```bash
wrangler d1 create dfg-orchestrator-db
# Copy the database_id to wrangler.toml
```

### 3. Run migration

```bash
npm run migrate
```

### 4. Set secrets

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put DFG_RELAY_TOKEN
wrangler secret put ORCHESTRATOR_SECRET
```

For `ORCHESTRATOR_SECRET`, generate a new token:
```bash
openssl rand -hex 32
```

### 5. Deploy

```bash
npm run deploy
```

## API Reference

All endpoints except `/health` require Bearer token auth:
```
Authorization: Bearer <ORCHESTRATOR_SECRET>
```

### GET /health

Public status check.

```bash
curl https://dfg-orchestrator.<subdomain>.workers.dev/health
```

Response:
```json
{
  "status": "ok",
  "phase": "phase0",
  "version": "0.1.0",
  "circuitBreaker": {
    "isOpen": false,
    "totalTasks": 3,
    "failedTasks": 0,
    "totalCostUsd": "0.0234"
  }
}
```

### POST /dispatch/qa-plan

Generate a QA test plan for a PR.

```bash
curl -X POST https://dfg-orchestrator.<subdomain>.workers.dev/dispatch/qa-plan \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"prNumber": 42, "linkedIssue": 100}'
```

Response:
```json
{
  "status": "success",
  "runId": "uuid",
  "taskResultId": "uuid",
  "actionId": "uuid",
  "classification": "auto_safe",
  "executed": true,
  "preview": "## 🤖 QA Test Plan...",
  "tokens": {"input": 1234, "output": 567},
  "cost": "0.0123"
}
```

### GET /pending

View pending actions awaiting Captain approval.

```bash
curl https://dfg-orchestrator.<subdomain>.workers.dev/pending \
  -H "Authorization: Bearer <token>"
```

### POST /approve/:id

Approve and execute a pending action.

```bash
curl -X POST https://dfg-orchestrator.<subdomain>.workers.dev/approve/<actionId> \
  -H "Authorization: Bearer <token>"
```

### POST /reject/:id

Reject a pending action.

```bash
curl -X POST https://dfg-orchestrator.<subdomain>.workers.dev/reject/<actionId> \
  -H "Authorization: Bearer <token>"
```

### GET /audit

View recent orchestrator runs.

```bash
curl https://dfg-orchestrator.<subdomain>.workers.dev/audit \
  -H "Authorization: Bearer <token>"
```

### POST /circuit/reset

Emergency circuit breaker reset.

```bash
curl -X POST https://dfg-orchestrator.<subdomain>.workers.dev/circuit/reset \
  -H "Authorization: Bearer <token>"
```

## Guardrails

| Limit | Value | Purpose |
|-------|-------|---------|
| MAX_TASKS_PER_RUN | 5 | Prevent runaway dispatch |
| MAX_RETRIES | 3 | Exponential backoff (1s, 2s, 4s) |
| DEDUPE_WINDOW_HOURS | 24 | Don't reprocess same content |
| COST_CEILING_PER_RUN_USD | 0.50 | Per-run cost limit |
| MAX_COST_PER_WINDOW_USD | 5.00 | Per-hour cost limit |
| ERROR_RATE_THRESHOLD | 50% | Trips circuit breaker |

## Phase Roadmap

| Phase | Scope | Blast Radius |
|-------|-------|--------------|
| **0** | Manual `/dispatch/qa-plan` → comment draft | Minimal |
| **1** | Add `triage` → label suggestions (approval required) | Low |
| **2** | Cron trigger for triage queue | Medium |
| **3** | Auto-apply labels with state machine validation | Higher |
| **4** | Agent briefs, sprint planning | Medium |

## Prerequisites for Phase 2+

- PRE-006: CI gating (prevent broken code from merging)
- CRIT-001: Secure debug endpoints

Do NOT enable cron or auto-actions until these are complete.

## Architecture

```
src/
├── index.ts              # Worker entry point
├── config.ts             # Guardrails and constants
├── types.ts              # TypeScript interfaces
│
├── context/
│   └── packs.ts          # Curated context excerpts (<2000 tokens each)
│
├── dispatcher/
│   ├── client.ts         # Claude API wrapper with retries
│   └── circuit-breaker.ts # D1-persisted breaker
│
├── policy/
│   ├── schemas.ts        # Zod .strict() schemas
│   ├── state-machine.ts  # Label transition rules
│   ├── classifier.ts     # Action classification
│   └── validator.ts      # Main policy engine
│
├── prompts/
│   └── qa-plan.ts        # QA plan prompt template
│
├── actions/
│   └── github.ts         # dfg-relay client
│
└── audit/
    └── logger.ts         # D1 audit logging
```

## Key Design Decisions

### Why D1 for circuit breaker?

Workers are stateless — in-memory counters reset on every request. D1 persists state across invocations, enabling true per-hour rate limiting.

### Why `.strict()` on Zod schemas?

Prevents the model from "sneaking" extra fields into the execution phase. If the model outputs something we didn't define, it gets rejected.

### Why store prompt template hashes?

Model behavior is sensitive to prompt changes. By storing the exact prompt text used, we can reproduce any historical result.

### Why dangerous pattern detection?

The model might generate comments containing `/assign` or `/merge` commands. We reject these before they reach GitHub.

## Local Development

```bash
npm run dev
```

This starts a local Worker. Use `--local` flag for D1:

```bash
npm run migrate:local
```
