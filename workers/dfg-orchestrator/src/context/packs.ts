/**
 * DFG Orchestrator - Context Packs
 * 
 * Curated excerpts for each task type.
 * These are NOT full project files — they're distilled context
 * that keeps token usage low and reduces hallucination risk.
 * 
 * Rule: Each pack should be <2000 tokens.
 */

import type { TaskType } from '../types';
import { VERSIONS } from '../config';

// ============================================================================
// Core Doctrine (shared across all tasks)
// ============================================================================

const CORE_DOCTRINE = `
## DFG Operating Doctrine (excerpt)
1. Cash velocity > theoretical upside
2. Demand is the compass
3. Buy-box discipline > clever ideas
4. Explainable logic over opaque intelligence
5. Data credibility is absolute — conflicting numbers = permanent trust loss

## Key Principles
- "Code merged" ≠ "feature works" — require verified acceptance criteria
- Never double-count fees (listing fees are selling costs only)
- Systems degrade gracefully, never catastrophically
`.trim();

// ============================================================================
// Label Taxonomy
// ============================================================================

const LABEL_TAXONOMY = `
## Label Taxonomy

### Status Labels (EXCLUSIVE — only one at a time)
- status:triage — New, needs prioritization
- status:ready — Approved, ready for dev
- status:in-progress — Dev actively working
- status:review — PR open, code review
- status:qa — Under QA verification
- status:verified — QA passed, ready to merge
- status:done — Merged AND deployed
- status:blocked — Blocked by dependency

### Priority Labels
- prio:P0 — Blocker, drop everything
- prio:P1 — High priority
- prio:P2 — Medium priority
- prio:P3 — Low priority

### Routing Labels (additive)
- needs:pm — Waiting for PM decision
- needs:dev — Waiting for dev fix
- needs:qa — Ready for QA verification

### Component Labels
- component:dfg-app — Frontend (Next.js)
- component:dfg-api — API Worker
- component:dfg-analyst — Analyst Worker
- component:dfg-scout — Scout Worker
- component:dfg-relay — Relay Worker
`.trim();

// ============================================================================
// Triage Rules
// ============================================================================

const TRIAGE_RULES = `
## Triage Rules

### Priority Assignment
- P0: Production broken, data corruption, security issue, blocks all work
- P1: Blocks sprint goal, affects core value loop, data credibility issue
- P2: Important but not blocking current work
- P3: Nice to have, polish, tech debt

### Sprint Assignment
- Current sprint: Only if directly supports sprint goal AND capacity exists
- Next sprint: Important but not urgent
- Backlog: Everything else

### Component Detection
Look for keywords:
- dfg-app: "frontend", "UI", "dashboard", "page", "component", "React", "Next.js"
- dfg-api: "endpoint", "API", "REST", "route"
- dfg-analyst: "analysis", "Claude", "valuation", "max bid"
- dfg-scout: "scraping", "snapshot", "parsing", "source"
- dfg-relay: "GitHub", "relay", "webhook"

### Questions to Ask
If the issue is unclear, suggest these questions:
1. What specific behavior is expected vs actual?
2. Is there a reproduction path?
3. What's the operator impact?
`.trim();

// ============================================================================
// QA Template
// ============================================================================

const QA_TEMPLATE = `
## QA Test Plan Format

For each Acceptance Criterion (AC), provide:

| AC | Test Steps | Expected Result | Edge Cases |
|----|------------|-----------------|------------|
| AC1 | 1. Navigate to... 2. Click... | Result shows... | Empty state, error state |

### Edge Cases to Consider
- Empty data / null values
- Error states / API failures
- Loading states
- Boundary conditions (0, 1, max)
- Mobile viewport if UI-related

### Evidence Requirements
- Screenshot for UI changes
- Console output for API/data changes
- Before/after comparison if editing
`.trim();

// ============================================================================
// Pack Builder
// ============================================================================

export const CONTEXT_PACKS: Record<TaskType, string> = {
  qa_plan: [CORE_DOCTRINE, QA_TEMPLATE].join('\n\n---\n\n'),
  triage: [CORE_DOCTRINE, LABEL_TAXONOMY, TRIAGE_RULES].join('\n\n---\n\n'),
  agent_brief: [CORE_DOCTRINE, LABEL_TAXONOMY].join('\n\n---\n\n'),
  review: [CORE_DOCTRINE].join('\n\n---\n\n'),
  sprint_plan: [CORE_DOCTRINE, LABEL_TAXONOMY, TRIAGE_RULES].join('\n\n---\n\n'),
  status_report: [CORE_DOCTRINE].join('\n\n---\n\n'),
};

/**
 * Get the context pack for a task type.
 * Returns versioned, curated excerpt — NOT full project files.
 */
export function getContextPack(taskType: TaskType): string {
  const pack = CONTEXT_PACKS[taskType];
  if (!pack) {
    throw new Error(`No context pack defined for task type: ${taskType}`);
  }
  return pack;
}

/**
 * Get the version of context packs.
 */
export function getContextPackVersion(): string {
  return VERSIONS.CONTEXT_PACK;
}

/**
 * Compute SHA256 hash of content for provenance tracking.
 */
export async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
