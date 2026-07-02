/**
 * DFG Orchestrator - Core Types
 * 
 * Design: Generate → Policy → Act separation
 * Model output is untrusted; Policy phase is the gatekeeper.
 */

// ============================================================================
// Environment
// ============================================================================

export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  DFG_RELAY_TOKEN: string;
  ORCHESTRATOR_SECRET: string;
  ENVIRONMENT: string;
  PHASE: 'phase0' | 'phase1' | 'phase2';
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskType = 
  | 'qa_plan'          // Phase 0: Generate QA test plan for PR
  | 'triage'           // Phase 1: Suggest priority/sprint/labels for issue
  | 'agent_brief'      // Phase 2+: Generate dev handoff brief
  | 'review'           // Phase 2+: Code review PR
  | 'sprint_plan'      // Phase 2+: Plan next sprint
  | 'status_report';   // Phase 2+: Generate status summary

export interface TaskInput {
  // Target identification
  issueNumber?: number;
  prNumber?: number;
  
  // Fetched data (populated by dispatcher)
  issueBody?: string;
  issueTitle?: string;
  prBody?: string;
  prTitle?: string;
  prDiff?: string;
  
  // Optional query/instructions
  query?: string;
}

export interface TaskConfig {
  model: 'claude-sonnet-4-20250514' | 'claude-opus-4-20250115';
  maxInputTokens: number;
  maxOutputTokens: number;
  requiresApproval: boolean;
  timeout: number;  // ms
}

export interface Task {
  id: string;
  type: TaskType;
  input: TaskInput;
  contextPack: string;
  config: TaskConfig;
}

// ============================================================================
// Generate Phase Output
// ============================================================================

export interface GenerateResult {
  success: boolean;
  output?: unknown;  // Validated by Policy phase
  rawOutput?: string;
  tokens: {
    input: number;
    output: number;
  };
  durationMs: number;
  attempts: number;
  retryDelaysMs: number[];
  error?: string;
}

// ============================================================================
// Policy Phase
// ============================================================================

export type ActionClassification = 'auto_safe' | 'requires_approval' | 'rejected';

export interface PolicyCheck {
  name: string;
  passed: boolean;
  reason: string;
}

export interface PolicyResult {
  classification: ActionClassification;
  reason: string;
  checks: PolicyCheck[];
}

// ============================================================================
// Proposed Actions
// ============================================================================

export interface BaseAction {
  type: string;
  reason: string;    // Why this action (from model)
  evidence: string;  // Supporting evidence (from model)
}

export interface AddCommentAction extends BaseAction {
  type: 'add_comment';
  issue: number;
  body: string;
}

export interface SuggestLabelsAction extends BaseAction {
  type: 'suggest_labels';
  issue: number;
  add: string[];
  remove: string[];
}

export type ProposedAction = AddCommentAction | SuggestLabelsAction;

// ============================================================================
// Act Phase
// ============================================================================

export interface ActionResult {
  success: boolean;
  actionId: string;
  executedAt?: string;
  executedBy?: 'auto' | 'captain' | string;
  result?: unknown;
  error?: string;
}

// ============================================================================
// Audit / Provenance
// ============================================================================

export interface Provenance {
  inputHash: string;
  contextHash: string;
  contextPackVersion: string;
  modelVersion: string;
  promptVersion: string;
  promptTemplateHash: string;
  sourceUrl?: string;
  sourceCommitSha?: string;
}

export interface TaskResultRecord {
  id: string;
  runId: string;
  taskType: TaskType;
  targetType: 'issue' | 'pr';
  targetId: string;
  targetUrl?: string;
  provenance: Provenance;
  status: 'success' | 'failed' | 'skipped_dedupe' | 'skipped_breaker';
  outputJson?: string;
  errorMessage?: string;
  attemptCount: number;
  retryDelaysMs?: number[];
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  createdAt: string;
}

// ============================================================================
// Circuit Breaker
// ============================================================================

export interface CircuitBreakerState {
  windowStart: string;
  windowDurationHours: number;
  totalTasks: number;
  failedTasks: number;
  totalCostUsd: number;
  maxTasksPerWindow: number;
  maxCostPerWindowUsd: number;
  errorRateThreshold: number;
  isOpen: boolean;
  openedAt?: string;
  openReason?: string;
}

export interface CircuitBreakerDecision {
  allow: boolean;
  reason?: string;
  state: CircuitBreakerState;
}

// ============================================================================
// API Responses
// ============================================================================

export interface DispatchResponse {
  status: 'success' | 'skipped' | 'error';
  runId: string;
  taskResultId?: string;
  actionId?: string;
  classification?: ActionClassification;
  preview?: string;
  reason?: string;
  error?: string;
}

export interface PendingAction {
  id: string;
  taskType: TaskType;
  targetId: string;
  actionType: string;
  payload: ProposedAction;
  reason: string;
  evidence: string;
  classification: ActionClassification;
  policyReason: string;
  createdAt: string;
}
