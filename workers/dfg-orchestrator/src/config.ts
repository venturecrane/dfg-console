/**
 * DFG Orchestrator - Configuration & Guardrails
 * 
 * These limits are non-negotiable. They prevent runaway costs,
 * noisy output, and trust-damaging automation failures.
 */

// ============================================================================
// Runtime Guardrails
// ============================================================================

export const GUARDRAILS = {
  // Per-run limits
  MAX_TASKS_PER_RUN: 5,
  MAX_TOTAL_INPUT_TOKENS: 50_000,
  MAX_TOTAL_OUTPUT_TOKENS: 10_000,
  
  // Cost ceiling (per run)
  COST_CEILING_PER_RUN_USD: 0.50,
  
  // Retry policy
  MAX_RETRIES: 3,
  BACKOFF_BASE_MS: 1000,  // 1s, 2s, 4s exponential
  REQUEST_TIMEOUT_MS: 30_000,
  
  // De-dupe window (content-hash based)
  DEDUPE_WINDOW_HOURS: 24,
  
  // Comment storm prevention (per-target, regardless of content hash)
  // Prevents storms when hash changes due to PR edits, context pack bumps, etc.
  COMMENT_DEDUPE_WINDOW_HOURS: 6,
  
  // Circuit breaker (per window, persisted in D1)
  CIRCUIT_BREAKER: {
    WINDOW_DURATION_HOURS: 1,
    MAX_TASKS_PER_WINDOW: 50,
    MAX_COST_PER_WINDOW_USD: 5.0,
    ERROR_RATE_THRESHOLD: 0.5,  // 50% failure rate trips breaker
  },
} as const;

// ============================================================================
// Model Configuration
// ============================================================================

export const MODELS = {
  // Phase 0/1: Use Sonnet for speed and cost
  SONNET: 'claude-sonnet-4-20250514',
  
  // Phase 2+: Use Opus for complex reasoning
  OPUS: 'claude-opus-4-20250115',
} as const;

// Pricing per 1K tokens (approximate)
export const MODEL_PRICING = {
  [MODELS.SONNET]: { input: 0.003, output: 0.015 },
  [MODELS.OPUS]: { input: 0.015, output: 0.075 },
} as const;

// ============================================================================
// Task Configuration
// ============================================================================

export const TASK_CONFIG = {
  qa_plan: {
    model: MODELS.SONNET,
    maxInputTokens: 8000,
    maxOutputTokens: 2000,
    requiresApproval: false,  // Comments are auto_safe in Phase 0
    timeout: GUARDRAILS.REQUEST_TIMEOUT_MS,
  },
  triage: {
    model: MODELS.SONNET,
    maxInputTokens: 4000,
    maxOutputTokens: 1000,
    requiresApproval: true,   // Label changes require approval
    timeout: GUARDRAILS.REQUEST_TIMEOUT_MS,
  },
  agent_brief: {
    model: MODELS.SONNET,
    maxInputTokens: 8000,
    maxOutputTokens: 3000,
    requiresApproval: true,
    timeout: GUARDRAILS.REQUEST_TIMEOUT_MS,
  },
  review: {
    model: MODELS.SONNET,
    maxInputTokens: 16000,
    maxOutputTokens: 4000,
    requiresApproval: true,
    timeout: 60_000,
  },
  sprint_plan: {
    model: MODELS.OPUS,
    maxInputTokens: 32000,
    maxOutputTokens: 8000,
    requiresApproval: true,
    timeout: 120_000,
  },
  status_report: {
    model: MODELS.SONNET,
    maxInputTokens: 16000,
    maxOutputTokens: 4000,
    requiresApproval: false,  // Reports are informational
    timeout: GUARDRAILS.REQUEST_TIMEOUT_MS,
  },
} as const;

// ============================================================================
// GitHub / Relay Configuration
// ============================================================================

export const GITHUB = {
  OWNER: 'durganfieldguide',
  REPO: 'dfg-console',
  RELAY_BASE_URL: 'https://dfg-relay.automation-ab6.workers.dev',
} as const;

// ============================================================================
// Versioning
// ============================================================================

export const VERSIONS = {
  // Update when context packs change
  CONTEXT_PACK: '2026-01-09',
  
  // Update when prompt templates change
  PROMPT: '0.1.0',
  
  // Schema version
  SCHEMA: '0001',
} as const;
